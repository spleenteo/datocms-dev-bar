import { build, context } from "esbuild";
import { pathToFileURL } from "node:url";

const shared = { bundle: true, minify: true, sourcemap: true, target: "es2020", logLevel: "info" };

export const configs = [
  { ...shared, entryPoints: ["src/index.ts"], outfile: "dist/index.js", format: "esm", platform: "browser" },
  { ...shared, entryPoints: ["src/index.ts"], outfile: "dist/datocms-dev-bar.iife.js", format: "iife", platform: "browser" },
  { ...shared, entryPoints: ["src/server.ts"], outfile: "dist/server.js", format: "esm", platform: "neutral" },
];

// Builds only when run directly (`node build.mjs`), not when the playground imports `configs`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--watch")) {
    for (const config of configs) await (await context(config)).watch();
  } else {
    await Promise.all(configs.map((config) => build(config)));
  }
}
