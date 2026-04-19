// `pnpm --filter @visitportal/spec test` entry.
// Runs every manifest vector against the schema and asserts each fails/passes
// as declared. This is the contract that protects the spec from drift.

import { runVectorSuite } from "./runner.ts";

const report = runVectorSuite();

if (report.failures.length === 0) {
  console.log(`spec self-test · ${report.totals.pass} vectors OK`);
  process.exit(0);
} else {
  console.error(`spec self-test · ${report.totals.fail} vector failure(s):`);
  for (const f of report.failures) {
    console.error(`  - ${f.id} (expected ${f.expected}): ${f.detail}`);
  }
  console.error(`  pass=${report.totals.pass} fail=${report.totals.fail}`);
  process.exit(1);
}
