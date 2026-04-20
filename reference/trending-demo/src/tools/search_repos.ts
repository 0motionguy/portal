import { loadSeed } from "../seed.ts";
import { ParamError, type ToolHandler } from "../types.ts";

export const search_repos: ToolHandler = {
  name: "search_repos",
  async handler(params) {
    const queryRaw = params.query;
    if (typeof queryRaw !== "string" || queryRaw.trim().length === 0) {
      throw new ParamError("param 'query' must be a non-empty string");
    }
    const query = queryRaw.toLowerCase();

    let limit = 10;
    if (params.limit !== undefined) {
      if (typeof params.limit !== "number" || !Number.isFinite(params.limit)) {
        throw new ParamError("param 'limit' must be a number");
      }
      limit = Math.trunc(params.limit);
      if (limit < 1) throw new ParamError("param 'limit' must be >= 1");
      if (limit > 50) limit = 50;
    }

    const seed = await loadSeed();
    const matches = seed.repos.filter((r) => {
      if (r.name_with_owner.toLowerCase().includes(query)) return true;
      if (r.description.toLowerCase().includes(query)) return true;
      return r.topics.some((t) => t.toLowerCase().includes(query));
    });
    matches.sort((a, b) => b.delta_week - a.delta_week);
    return matches.slice(0, limit);
  },
};
