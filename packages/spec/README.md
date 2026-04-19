# @visitportal/spec

Portal v0.1.1 specification artifacts: JSON Schema, conformance vectors,
ajv-backed validator, and a zero-dependency lean validator for visitor
SDKs that want to stay tiny.

## 30-second adopter check

```ts
import { runSmokeConformance } from '@visitportal/spec';
const report = await runSmokeConformance('https://my-service.com/portal');
console.log(report);
// { target, manifestOk, manifestErrors, notFoundOk, notFoundDetail }
```

If `manifestOk && notFoundOk`, your service passes the v0.1.1 smoke test.

## Full offline validation

```ts
import { validateAgainstVectors } from '@visitportal/spec';
const report = validateAgainstVectors(myManifest);
// { manifest: {ok}, vectorSuite: {totals, failures} }
```

Runs the 30 canonical test vectors offline. Zero network. Adopter-facing
CI pre-flight.

## Manifest schema import

```ts
import schema from '@visitportal/spec/schema' assert { type: 'json' };
// → JSON Schema draft-07
```

## Lean validator (zero-dep for visitor SDKs)

```ts
import { leanValidate } from '@visitportal/spec/lean-validator';
const r = leanValidate(obj); // { ok: true } | { ok: false, errors: string[] }
```

Kept in lockstep with the ajv-backed validator via the spec self-test;
visitor SDKs can use this to avoid shipping ajv to browsers.

## Error codes

```ts
import { ERROR_CODES } from '@visitportal/spec';
// ['NOT_FOUND','INVALID_PARAMS','UNAUTHORIZED','RATE_LIMITED','INTERNAL']
```

## Full spec

See https://visitportal.dev/docs for the one-page Portal v0.1.1 spec.
Repo: https://github.com/0motionguy/portal

## License

Apache 2.0 (source) + CC0 (spec documents + vectors.json). See LICENSE.
