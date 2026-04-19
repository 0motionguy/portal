export type ErrorCode =
  | "NOT_FOUND"
  | "INVALID_PARAMS"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalError";
  }
}

export class PortalNotFound extends PortalError {
  readonly url: string;
  readonly reason: unknown;
  constructor(url: string, reason: unknown) {
    super(`could not fetch Portal at ${url}: ${describe(reason)}`);
    this.name = "PortalNotFound";
    this.url = url;
    this.reason = reason;
  }
}

export class ManifestInvalid extends PortalError {
  readonly url: string;
  readonly errors: readonly string[];
  constructor(url: string, errors: readonly string[]) {
    super(`manifest at ${url} is invalid: ${summarize(errors)}`);
    this.name = "ManifestInvalid";
    this.url = url;
    this.errors = errors;
  }
}

export class ToolNotInManifest extends PortalError {
  readonly tool: string;
  readonly available: readonly string[];
  constructor(tool: string, available: readonly string[]) {
    super(
      `tool '${tool}' is not in the manifest. Available: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "ToolNotInManifest";
    this.tool = tool;
    this.available = available;
  }
}

export class CallFailed extends PortalError {
  readonly tool: string;
  readonly code: ErrorCode;
  constructor(tool: string, code: ErrorCode, message: string) {
    super(`call to '${tool}' failed (${code}): ${message}`);
    this.name = "CallFailed";
    this.tool = tool;
    this.code = code;
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function summarize(errs: readonly string[]): string {
  if (errs.length === 0) return "(no details)";
  return errs.slice(0, 3).join("; ");
}
