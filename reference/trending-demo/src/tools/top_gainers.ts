import { loadSeed } from "../seed.ts";
import { ParamError, type ToolHandler } from "../types.ts";

export const top_gainers: ToolHandler = {
  name: "top_gainers",
  async handler(params) {
    const limitRaw = params.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
      throw new ParamError("param 'limit' must be a number");
    }
    const limit = Math.trunc(limitRaw);
    if (limit < 1 || limit > 50) {
      throw new ParamError("param 'limit' must be between 1 and 50");
    }

    let language: string | undefined;
    if (params.language !== undefined) {
      if (typeof params.language !== "string") {
        throw new ParamError("param 'language' must be a string");
      }
      language = params.language;
    }

    const seed = await loadSeed();
    const pool = language
      ? seed.repos.filter((r) => r.language.toLowerCase() === language.toLowerCase())
      : seed.repos;
    const sorted = [...pool].sort((a, b) => b.delta_week - a.delta_week);
    return sorted.slice(0, limit);
  },
};
