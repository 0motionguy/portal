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

export class ParamError extends Error {
  readonly code = "INVALID_PARAMS" as const;
  constructor(message: string) {
    super(message);
    this.name = "ParamError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ToolHandler {
  readonly name: string;
  handler(params: Record<string, unknown>): Promise<unknown>;
}
