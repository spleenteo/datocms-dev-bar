import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Importing the preload patches fetch and http.Server for this test process (vitest keeps each file in its own).
import "../src/register";

type Seen = { url: string; headers: Headers; body: string };
const seen: Seen[] = [];
const cookiesSeen: (string | undefined)[] = [];

// Stands in for a framework's patched fetch (Next.js): set after the preload, it is what the wrapper calls.
// Anything else goes back through the global fetch, as such a patch does, and must reach the network.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("graphql.datocms.com")) return fetch(input, init);
  seen.push({ url, headers: new Headers(init?.headers), body: String(init?.body ?? "") });
  return new Response(JSON.stringify({ data: { home: { id: "R1", title: "Hi" } } }), {
    headers: { "x-environment": "main", "x-timings-total": "0.2", "cf-cache-status": "MISS", "content-type": "application/json" },
  });
}) as typeof fetch;

const cda = (name: string) =>
  fetch("https://graphql.datocms.com/", {
    method: "POST",
    headers: { Authorization: "Bearer site-token", "X-Include-Drafts": "true", "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query ${name} { home { id title } }`, variables: { a: 1 } }),
    cache: "force-cache",
  });

let server: http.Server;
let origin: string;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/cookies") {
      cookiesSeen.push(req.headers.cookie);
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("ok");
    }
    if (url.pathname === "/json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }
    if (url.pathname === "/slow") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await cda("Slow");
    } else {
      await cda("Home");
      await cda("Menu");
    }
    const html = `<!doctype html><html><body>${url.pathname} encoding=${req.headers["accept-encoding"] ?? "none"}</body></html>`;
    res.writeHead(200, { "Content-Type": "text/html", "Content-Length": Buffer.byteLength(html) });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());

const get = (path: string, cookie?: string) => fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {}, cache: "no-store" });
const barId = (html: string) => /data-url="\/__datocms-dev-bar\/data\?id=([^"]+)"/.exec(html)?.[1];

describe("register", () => {
  it("appends the bar to HTML pages and leaves the rest alone", async () => {
    const page = await get("/page");
    const html = await page.text();
    expect(html).toContain("</html>");
    expect(html).toContain('<script type="module" src="/__datocms-dev-bar/index.js"></script>');
    expect(html).toMatch(/<datocms-dev-bar data-url="\/__datocms-dev-bar\/data\?id=[^"]+" position="bottom-left" style="--dev-bar-bottom: 200px"><\/datocms-dev-bar>/);
    expect(html).toContain("encoding=none");
    expect(page.headers.get("content-length")).toBeNull();
    expect(await (await get("/json")).text()).toBe('{"ok":true}');
  });

  it("ties the queries of a request to its page, with text, variables and headers", async () => {
    const id = barId(await (await get("/page")).text());
    const data = await (await get(`/__datocms-dev-bar/data?id=${id}`)).json();
    expect(data.project).toBeNull();
    expect(data.queries.map((q: { operation: string }) => q.operation)).toEqual(["Home", "Menu"]);
    expect(data.queries[0]).toMatchObject({ environment: "main", timingsTotalMs: 200, cache: "miss", variables: '{\n  "a": 1\n}', responseBytes: 42 });
    expect(data.queries[0].query).toContain("query Home");
  });

  it("applies the bar's cookies to the calls, and a token from the environment", async () => {
    process.env.DATOCMS_DEV_BAR_CDA_TOKEN = "dev-bar-token";
    process.env.DATOCMS_BASE_EDITING_URL = "https://p.admin.datocms.com";
    seen.length = 0;
    await get("/page", "datocms-mode=published");
    expect(seen[0].headers.get("x-include-drafts")).toBeNull();
    expect(seen[0].headers.get("x-visual-editing")).toBeNull();
    expect(seen[0].headers.get("authorization")).toBe("Bearer dev-bar-token");
    seen.length = 0;
    await get("/page", "datocms-mode=draft; datocms-visual=on");
    expect(seen[0].headers.get("x-include-drafts")).toBe("true");
    expect(seen[0].headers.get("x-visual-editing")).toBe("v1");
    expect(seen[0].headers.get("x-base-editing-url")).toBe("https://p.admin.datocms.com");
    delete process.env.DATOCMS_DEV_BAR_CDA_TOKEN;
    delete process.env.DATOCMS_BASE_EDITING_URL;
  });

  it("drives Next.js draft mode through its bypass cookie when a prerender manifest is there", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dev-bar-"));
    mkdirSync(join(dir, ".next", "dev"), { recursive: true });
    writeFileSync(join(dir, ".next", "dev", "prerender-manifest.json"), JSON.stringify({ preview: { previewModeId: "abc123" } }));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await get("/cookies", "datocms-mode=draft; other=1");
      expect(cookiesSeen.pop()).toBe("datocms-mode=draft; other=1; __prerender_bypass=abc123");
      await get("/cookies", "__prerender_bypass=stale; datocms-mode=published");
      expect(cookiesSeen.pop()).toBe("datocms-mode=published");
    } finally {
      process.chdir(cwd);
    }
  });

  it("answers by page, waiting for a request that is still being served", async () => {
    const pending = get("/slow?x=1&_rsc=abc");
    const data = await (await get("/__datocms-dev-bar/data?url=%2Fslow%3Fx%3D1")).json();
    await pending;
    expect(data.queries.map((q: { operation: string }) => q.operation)).toEqual(["Slow"]);
    const none = await (await get("/__datocms-dev-bar/data?url=%2Fnever&t=1")).json();
    expect(none.queries).toEqual([]);
  }, 15_000);

  it("moves the bar where the environment says", async () => {
    process.env.DATOCMS_DEV_BAR_POSITION = "bottom-right";
    process.env.DATOCMS_DEV_BAR_BOTTOM = "12px";
    const html = await (await get("/page")).text();
    expect(html).toContain('position="bottom-right" style="--dev-bar-bottom: 12px"');
    delete process.env.DATOCMS_DEV_BAR_POSITION;
    delete process.env.DATOCMS_DEV_BAR_BOTTOM;
  });

  it("serves the bar's script", async () => {
    const script = await get("/__datocms-dev-bar/index.js");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect((await get("/__datocms-dev-bar/other")).status).toBe(404);
  });
});
