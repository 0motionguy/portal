import type { SeedData } from "./types.ts";
import { fixture } from "./fixture.ts";

let cached: SeedData | null = null;

const dataModulePath = "./data/index.ts";

export async function loadSeed(): Promise<SeedData> {
  if (cached) return cached;
  try {
    const mod = (await import(/* @vite-ignore */ dataModulePath)) as Partial<SeedData> & {
      default?: SeedData;
    };
    const candidate: SeedData = {
      repos: mod.repos ?? mod.default?.repos ?? [],
      maintainers: mod.maintainers ?? mod.default?.maintainers ?? [],
    };
    if (candidate.repos.length > 0 && candidate.maintainers.length > 0) {
      cached = candidate;
      return cached;
    }
  } catch {
    // fall through to fixture
  }
  cached = fixture;
  return cached;
}
