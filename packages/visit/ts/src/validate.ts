import { leanValidate } from "@visitportal/spec/lean-validator";
import { ManifestInvalid } from "./errors.ts";
import type { Manifest } from "./types.ts";

export function assertValidManifest(url: string, obj: unknown): asserts obj is Manifest {
  const r = leanValidate(obj);
  if (!r.ok) throw new ManifestInvalid(url, r.errors);
}
