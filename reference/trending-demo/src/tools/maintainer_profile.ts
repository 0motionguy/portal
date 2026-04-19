import { NotFoundError, ParamError, type ToolHandler } from "../types.ts";
import { loadSeed } from "../seed.ts";

export const maintainer_profile: ToolHandler = {
  name: "maintainer_profile",
  async handler(params) {
    const handleRaw = params.handle;
    if (typeof handleRaw !== "string" || handleRaw.trim().length === 0) {
      throw new ParamError("param 'handle' must be a non-empty string");
    }
    const handle = handleRaw.toLowerCase();

    const seed = await loadSeed();
    const maintainer = seed.maintainers.find((m) => m.handle.toLowerCase() === handle);
    if (!maintainer) {
      throw new NotFoundError(`maintainer '${handleRaw}' not found`);
    }

    const repoIndex = new Map(seed.repos.map((r) => [r.name_with_owner, r]));
    const hydratedRepos = maintainer.repos
      .map((name) => repoIndex.get(name))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    return {
      handle: maintainer.handle,
      display_name: maintainer.display_name,
      bio: maintainer.bio,
      repos: hydratedRepos,
    };
  },
};
