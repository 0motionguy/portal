// Public surface of @visitportal/spec. Adopters import from the package
// root; the deeper subpath exports (./schema, ./vectors, ./runner,
// ./lean-validator) remain available for callers that prefer them.

export {
  runSmokeConformance,
  validateManifest,
  validateAgainstVectors,
  runVectorSuite,
  getVectors,
  ERROR_CODES,
} from "./conformance/runner.js";

export type {
  ErrorCode,
  ValidationResult,
  ValidationErrors,
  VectorsFile,
  VectorReport,
  OfflineReport,
  LiveReport,
} from "./conformance/runner.js";

export { leanValidate } from "./conformance/lean-validator.js";
export type { LeanResult } from "./conformance/lean-validator.js";
