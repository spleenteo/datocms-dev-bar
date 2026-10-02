import { context } from "esbuild";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { configs } from "../build.mjs";
import { renderPage } from "./page.mjs";

try {
  process.loadEnvFile();
} catch {
  // No .env: the playground runs on fake content.
}

const PORT = Number(process.env.PORT || 5173);
const TYPES = { ".js": "text/javascript; charset=utf-8", ".map": "application/json; charset=utf-8" };

// Build once before serving, then rebuild on every save.
for (const config of configs) {
  const ctx = await context({ ...config, minify: false });
  await ctx.rebuild();
  await ctx.watch();
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/dist/")) {
      const body = await readFile(new URL(`..${url.pathname}`, import.meta.url));
      const type = TYPES[url.pathname.slice(url.pathname.lastIndexOf("."))] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      return res.end(body);
    }
    // Fresh import on every request, so helper changes show up without restarting.
    const { readDevPreview } = await import(new URL(`../dist/server.js?v=${Date.now()}`, import.meta.url).href);
    const preview = readDevPreview({ cookie: req.headers.cookie, url: req.url }, { isDev: true });
    const html = await renderPage(url.pathname, preview);
    if (html === null) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(error));
  }
}).listen(PORT, () => console.log(`playground: http://localhost:${PORT}`));
