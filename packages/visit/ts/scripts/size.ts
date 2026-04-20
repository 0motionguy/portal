// Bundles the SDK with esbuild and reports minified + gzipped size. Used to
// enforce the <15 kB gzipped claim from the plan (Phase 3 acceptance).

import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
  external: [],
});

const out = result.outputFiles[0];
if (!out) {
  console.error("no output from esbuild");
  process.exit(1);
}
const raw = out.contents;
const gz = gzipSync(raw);
const rawKb = (raw.byteLength / 1024).toFixed(2);
const gzKb = (gz.byteLength / 1024).toFixed(2);

const LIMIT_KB = 15;
const gzSize = gz.byteLength / 1024;

console.log("@visitportal/visit bundle");
console.log(`  minified: ${rawKb} kB`);
console.log(`  gzipped:  ${gzKb} kB (limit ${LIMIT_KB} kB)`);

if (gzSize > LIMIT_KB) {
  console.error(`FAIL: bundle exceeds ${LIMIT_KB} kB gzipped`);
  process.exit(1);
}
console.log("OK");
