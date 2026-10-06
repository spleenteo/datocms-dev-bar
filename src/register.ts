/**
 * EXPERIMENTAL. The bar without a line of application code: loaded into the development server
 * with `NODE_OPTIONS=--import=@spleenteo/datocms-dev-bar/register`, it
 *
 * - watches the server's `fetch` calls to the Content Delivery API, applies the draft / visual
 *   editing state of the bar's cookies to them, and keeps a report of each one;
 * - ties each query to the HTTP request being served, with AsyncLocalStorage;
 * - appends the bar to every HTML page and serves its script and its data from `/__datocms-dev-bar/`.
 *
 * Contact points with the application: none. With the environment: `DATOCMS_DEV_BAR_CDA_TOKEN`
 * (a CDA token that can read drafts, used in place of the one the site sends), `DATOCMS_BASE_EDITING_URL`
 * (the project URL, for Content Link and the links of the panel) and `DATOCMS_DEVTOOLS_TOKEN`
 * (a read-only CMA token, for the Records tab). Node only: a dev server that runs its code elsewhere
 * (an edge sandbox, a worker) is not seen.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { collectRecordIds, fetchProjectInfo } from "./project";
import { readQueryReport, serializeDevBarData, type QueryReport } from "./queries";
import { readDevPreview } from "./server";

const CDA_HOST = "graphql.datocms.com";
const PATH = "/__datocms-dev-bar";
const KEEP_MS = 5 * 60_000;
const LOG = "[datocms-dev-bar]";

type Served = { id: string; at: number; preview: ReturnType<typeof readDevPreview>; reports: QueryReport[]; recordIds: Set<string> };

const requests = new AsyncLocalStorage<Served>();
/** True inside our own fetch wrapper: a call that comes back to it from a layer it wraps goes straight to the base fetch. */
const nesting = new AsyncLocalStorage<true>();
const served = new Map<string, Served>();
let lastServed: Served | null = null;

// ---- the server's fetch ---------------------------------------------------------------------

type Fetch = typeof globalThis.fetch;
const base: Fetch = globalThis.fetch;
// What others install on globalThis.fetch (Next.js patches it for its cache): the wrapper stays on top of them.
let inner: Fetch = base;

const wrapper: Fetch = function fetch(input, init) {
  if (nesting.getStore()) return base(input, init);
  return nesting.run(true, () => watch(input, init));
};
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  enumerable: true,
  get: () => wrapper,
  set: (next: Fetch) => {
    if (next !== wrapper) inner = next;
  },
});

function hostOf(input: RequestInfo | URL): string | null {
  try {
    return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).hostname;
  } catch {
    return null;
  }
}

async function watch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const context = requests.getStore();
  if (!context || hostOf(input) !== CDA_HOST) return inner(input, init);
  const request = input instanceof Request ? input : null;
  const headers = new Headers(init?.headers ?? request?.headers);
  // The bar's state wins over what the site asked for.
  const { mode, visualEditing } = context.preview;
  headers.delete("X-Include-Drafts");
  headers.delete("X-Visual-Editing");
  headers.delete("X-Base-Editing-Url");
  const editingUrl = process.env.DATOCMS_BASE_EDITING_URL;
  if (mode === "draft") {
    headers.set("X-Include-Drafts", "true");
    if (visualEditing && editingUrl) {
      headers.set("X-Visual-Editing", "v1");
      headers.set("X-Base-Editing-Url", editingUrl);
    }
  }
  const token = process.env.DATOCMS_DEV_BAR_CDA_TOKEN;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Always fresh in development: a cached answer would hide the switch between draft and published.
  const patched: RequestInit & { next?: Record<string, unknown> } = { ...init, headers, cache: "no-store" };
  if (patched.next && "revalidate" in patched.next) {
    const { revalidate: _, ...rest } = patched.next;
    patched.next = rest;
  }
  const body = init?.body ?? null;
  const response = await inner(request ? new Request(request, patched) : input, patched);
  void record(context, headers, body, request, response.clone());
  return response;
}

async function record(context: Served, sent: Headers, body: BodyInit | null, request: Request | null, response: Response) {
  try {
    const text = typeof body === "string" ? body : request ? await request.clone().text() : "";
    const { query, variables, operationName } = JSON.parse(text || "{}") as { query?: string; variables?: unknown; operationName?: string };
    const result = (await response.json().catch(() => undefined)) as { data?: unknown } | undefined;
    context.reports.push(
      readQueryReport(response.headers, {
        cacheTagsRequested: sent.has("X-Cache-Tags"),
        operation: operationName ?? (query ? /^\s*(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/.exec(query)?.[1] : null),
        query,
        variables,
        result,
      }),
    );
    for (const id of collectRecordIds(result?.data, await stegaDecoder())) context.recordIds.add(id);
  } catch (error) {
    console.info(`${LOG} could not read a query: ${error instanceof Error ? error.message : error}`);
  }
}

// `@datocms/content-link` of the site, when it has it: finds the records behind the Content Link metadata.
let decoder: Promise<((text: string) => { href: string } | null) | undefined> | undefined;
function stegaDecoder() {
  return (decoder ??= (async () => {
    try {
      const require = createRequire(join(process.cwd(), "package.json"));
      const module = (await import(pathToFileURL(require.resolve("@datocms/content-link")).href)) as Record<string, unknown>;
      const fn = module.decodeStega ?? (module.default as Record<string, unknown> | undefined)?.decodeStega;
      return typeof fn === "function" ? (fn as (text: string) => { href: string } | null) : undefined;
    } catch {
      return undefined;
    }
  })());
}

// ---- the HTTP requests ----------------------------------------------------------------------

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (this: http.Server, event: string | symbol, ...args: unknown[]): boolean {
  if (event !== "request") return emit.call(this, event, ...args);
  const [req, res] = args as [http.IncomingMessage, http.ServerResponse];
  if (req.url?.startsWith(`${PATH}/`)) {
    void serve(req, res);
    return true;
  }
  const context = begin(req);
  injectBar(res, context);
  return requests.run(context, () => emit.call(this, event, req, res));
} as typeof http.Server.prototype.emit;

function begin(req: http.IncomingMessage): Served {
  const now = Date.now();
  for (const [id, entry] of served) if (now - entry.at > KEEP_MS) served.delete(id);
  const context: Served = {
    id: crypto.randomUUID(),
    at: now,
    preview: readDevPreview({ cookie: req.headers.cookie, url: req.url }, { isDev: true }),
    reports: [],
    recordIds: new Set(),
  };
  served.set(context.id, context);
  lastServed = context;
  // No compression: the bar is appended to the HTML as it goes out.
  delete req.headers["accept-encoding"];
  return context;
}

const isHtml = (res: http.ServerResponse) => String(res.getHeader("content-type") ?? "").includes("text/html");

/** Appends the bar to the HTML, at the end: the browser moves what follows `</html>` into the body. */
function injectBar(res: http.ServerResponse, context: Served) {
  const end = res.end.bind(res) as (chunk?: unknown, encoding?: unknown, callback?: unknown) => http.ServerResponse;
  res.end = function (chunk?: unknown, encoding?: unknown, callback?: unknown) {
    if (typeof chunk === "function") [chunk, callback] = [undefined, chunk];
    if (typeof encoding === "function") [encoding, callback] = [undefined, encoding];
    if (!isHtml(res) || (res.req as http.IncomingMessage & { method?: string }).method === "HEAD") return end(chunk, encoding, callback);
    if (!res.headersSent) res.removeHeader("content-length");
    if (chunk) res.write(chunk as string | Uint8Array, encoding as BufferEncoding);
    return end(barMarkup(context.id), "utf8", callback);
  } as typeof res.end;
}

function barMarkup(id: string): string {
  const attributes = [`data-url="${PATH}/data?id=${id}"`];
  const projectUrl = process.env.DATOCMS_BASE_EDITING_URL;
  if (projectUrl) attributes.push(`project-url="${escapeAttribute(projectUrl)}"`);
  return `\n<script type="module" src="${PATH}/index.js"></script><datocms-dev-bar ${attributes.join(" ")}></datocms-dev-bar>\n`;
}

const escapeAttribute = (value: string) => value.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);

let barScript: Buffer | undefined;

/** `/__datocms-dev-bar/index.js`: the bar. `/__datocms-dev-bar/data?id=…`: what one page's queries said. */
async function serve(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === `${PATH}/index.js`) {
      barScript ??= readFileSync(new URL("./index.js", import.meta.url));
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(barScript);
    }
    if (url.pathname === `${PATH}/data`) {
      const id = url.searchParams.get("id");
      const context = id ? served.get(id) : lastServed;
      const queries = context?.reports ?? [];
      const token = process.env.DATOCMS_DEVTOOLS_TOKEN;
      const project =
        token && context
          ? await fetchProjectInfo({
              token,
              environment: queries.find((report) => report.environment)?.environment,
              recordIds: [...context.recordIds],
              projectUrl: process.env.DATOCMS_BASE_EDITING_URL,
            })
          : null;
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(serializeDevBarData({ queries, project }));
    }
    res.writeHead(404);
    res.end();
  } catch (error) {
    console.info(`${LOG} ${url.pathname}: ${error instanceof Error ? error.message : error}`);
    res.writeHead(500);
    res.end();
  }
}

console.info(`${LOG} watching the Content Delivery API calls of this server; the bar is appended to every HTML page.`);
