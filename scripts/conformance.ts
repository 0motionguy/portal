// `pnpm conformance [url]` — front door for the Portal conformance runner.
//
//   pnpm conformance                         → offline self-test (30 vectors).
//   pnpm conformance https://foo.dev/portal  → live test against a Portal URL.
//
// Offline mode is what CI runs. Live mode is what Mirko / judges run to verify
// a deployed Portal. Exit code = number of failures (0 = pass).

import { runSmokeConformance, runVectorSuite } from "@visitportal/spec/runner";

const target = process.argv[2];

if (!target) {
  // Offline: run all static vectors through the schema + shape checks.
  const report = runVectorSuite();
  if (report.failures.length === 0) {
    console.log(`portal-conformance · offline self-test · ${report.totals.pass} vectors OK`);
    process.exit(0);
  }
  console.error(`portal-conformance · offline self-test · ${report.totals.fail} failure(s):`);
  for (const f of report.failures) {
    console.error(`  - ${f.id} (expected ${f.expected}): ${f.detail}`);
  }
  process.exit(report.totals.fail);
}

// Live smoke: fetch GET /portal, validate, then probe POST /portal/call for
// NOT_FOUND. For the full 30-vector offline suite, use validateAgainstVectors
// from @visitportal/spec (or drop the URL arg to get runVectorSuite).
console.log(`portal-conformance · live smoke · ${target}`);
const report = await runSmokeConformance(target);

let failures = 0;

if (report.manifestOk) {
  console.log("  ✓ manifest valid");
} else {
  failures++;
  console.error("  ✗ manifest INVALID");
  for (const e of report.manifestErrors) {
    console.error(`      ${e.instancePath || "/"} ${e.message}`);
  }
}

if (report.notFoundOk) {
  console.log(`  ✓ NOT_FOUND round-trip: ${report.notFoundDetail}`);
} else {
  failures++;
  console.error(`  ✗ NOT_FOUND round-trip: ${report.notFoundDetail}`);
}

process.exit(failures);
