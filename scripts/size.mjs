import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 6 * 1024;
const size = gzipSync(readFileSync("dist/index.js")).length;
console.log(`dist/index.js: ${size} bytes gzipped (budget ${LIMIT})`);
if (size > LIMIT) {
  console.error("Over the size budget.");
  process.exit(1);
}
