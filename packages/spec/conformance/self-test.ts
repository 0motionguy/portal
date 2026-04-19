// `pnpm --filter @visitportal/spec test` entry. Two passes:
// 1) Every vector is handled correctly by the ajv validator (authoritative).
// 2) The lean validator (shipped to SDKs) agrees with ajv on every manifest
//    vector — same ok/!ok decision. Strings differ by design; the decision
//    must not.

import { getVectors, runVectorSuite, validateManifest } from "./runner.ts";
import { leanValidate } from "./lean-validator.ts";

const report = runVectorSuite();
const vectors = getVectors();

const disagreements: string[] = [];
for (const v of vectors.manifest_valid) {
  const a = validateManifest(v.manifest).ok;
  const l = leanValidate(v.manifest).ok;
  if (a !== l) disagreements.push(`${v.id}: ajv=${a} lean=${l} (expected both ok)`);
}
for (const v of vectors.manifest_invalid) {
  const a = validateManifest(v.manifest).ok;
  const l = leanValidate(v.manifest).ok;
  if (a !== l) disagreements.push(`${v.id}: ajv=${a} lean=${l} (expected both fail)`);
}

const anyFailures = report.failures.length > 0 || disagreements.length > 0;
if (!anyFailures) {
  const manifestCount = vectors.manifest_valid.length + vectors.manifest_invalid.length;
  console.log(
    `spec self-test · ${report.totals.pass} vectors OK · ajv↔lean agree on all ${manifestCount} manifest vectors`,
  );
  process.exit(0);
}

if (report.failures.length > 0) {
  console.error(`ajv vector failures:`);
  for (const f of report.failures) {
    console.error(`  - ${f.id} (expected ${f.expected}): ${f.detail}`);
  }
}
if (disagreements.length > 0) {
  console.error(`ajv ↔ lean disagreements (SDK validator drift):`);
  for (const d of disagreements) console.error(`  - ${d}`);
}
process.exit(1);
