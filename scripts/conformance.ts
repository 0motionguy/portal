// `pnpm conformance [url]` entry point.
// Phase 0: stub. Phase 1 wires up packages/spec/conformance/runner.ts and the vectors file.

const target = process.argv[2];
if (!target) {
  console.log("usage: pnpm conformance <portal-url>");
  console.log("  e.g. pnpm conformance https://starscreener.xyz/portal");
  console.log("");
  console.log("portal-conformance · runner lands Phase 1 (packages/spec/conformance/runner.ts)");
  process.exit(0);
}

console.log(`portal-conformance · target: ${target}`);
console.log("runner not yet implemented (Phase 1 deliverable)");
process.exit(0);
