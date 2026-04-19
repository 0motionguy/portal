import type { ToolHandler } from "../types.ts";
import { top_gainers } from "./top_gainers.ts";
import { search_repos } from "./search_repos.ts";
import { maintainer_profile } from "./maintainer_profile.ts";

const list: ToolHandler[] = [top_gainers, search_repos, maintainer_profile];

export const registry: ReadonlyMap<string, ToolHandler> = new Map(
  list.map((t) => [t.name, t]),
);
