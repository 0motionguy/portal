import maintainersJson from "./maintainers.json" with { type: "json" };
import reposJson from "./repos.json" with { type: "json" };

export interface Repo {
  name_with_owner: string;
  stars: number;
  delta_week: number;
  language: string;
  description: string;
  topics: string[];
  maintainer: string;
}

export interface Maintainer {
  handle: string;
  display_name: string;
  bio: string;
  repos: string[];
}

export interface SeedData {
  repos: Repo[];
  maintainers: Maintainer[];
}

export const repos: Repo[] = reposJson as Repo[];
export const maintainers: Maintainer[] = maintainersJson as Maintainer[];
export default { repos, maintainers } satisfies SeedData;
