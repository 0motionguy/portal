import type { DispatchResult, ErrorCode } from "./types.ts";

export const STATUS_BY_CODE = {
  NOT_FOUND: 404,
  INVALID_PARAMS: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, 400 | 401 | 404 | 429 | 500>;

export class ManifestBuildError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`manifest invalid: ${errors.join("; ")}`);
    this.name = "ManifestBuildError";
    this.errors = errors;
  }
}

export abstract class ProviderCallError extends Error {
  abstract readonly code: ErrorCode;
  readonly status: 400 | 401 | 404 | 429 | 500;
  readonly headers?: Record<string, string>;

  protected constructor(
    message: string,
    status: 400 | 401 | 404 | 429 | 500,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    if (headers !== undefined) this.headers = headers;
  }
}

export class InvalidParamsError extends ProviderCallError {
  readonly code = "INVALID_PARAMS" as const;

  constructor(message: string) {
    super(message, STATUS_BY_CODE.INVALID_PARAMS);
    this.name = "InvalidParamsError";
  }
}

export class NotFoundError extends ProviderCallError {
  readonly code = "NOT_FOUND" as const;

  constructor(message: string) {
    super(message, STATUS_BY_CODE.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ProviderCallError {
  readonly code = "UNAUTHORIZED" as const;

  constructor(message: string) {
    super(message, STATUS_BY_CODE.UNAUTHORIZED);
    this.name = "UnauthorizedError";
  }
}

export class RateLimitedError extends ProviderCallError {
  readonly code = "RATE_LIMITED" as const;

  constructor(message: string, opts: { retryAfter?: string | number } = {}) {
    const headers =
      opts.retryAfter === undefined ? undefined : { "Retry-After": String(opts.retryAfter) };
    super(message, STATUS_BY_CODE.RATE_LIMITED, headers);
    this.name = "RateLimitedError";
  }
}

export class InternalError extends ProviderCallError {
  readonly code = "INTERNAL" as const;

  constructor(message: string) {
    super(message, STATUS_BY_CODE.INTERNAL);
    this.name = "InternalError";
  }
}

export function invalidParams(message: string): InvalidParamsError {
  return new InvalidParamsError(message);
}

export function notFound(message: string): NotFoundError {
  return new NotFoundError(message);
}

export function unauthorized(message: string): UnauthorizedError {
  return new UnauthorizedError(message);
}

export function rateLimited(
  message: string,
  opts: { retryAfter?: string | number } = {},
): RateLimitedError {
  return new RateLimitedError(message, opts);
}

export function internal(message: string): InternalError {
  return new InternalError(message);
}

export function normalizeThrownError(err: unknown): DispatchResult {
  if (err instanceof ProviderCallError) {
    return toDispatchResult(err.status, { ok: false, error: err.message, code: err.code }, err.headers);
  }

  if (isErrorWithKnownCode(err)) {
    return toDispatchResult(
      STATUS_BY_CODE[err.code],
      {
        ok: false,
        error: typeof err.message === "string" ? err.message : `provider error (${err.code})`,
        code: err.code,
      },
      getHeaders(err),
    );
  }

  return toDispatchResult(STATUS_BY_CODE.INTERNAL, {
    ok: false,
    error: describe(err),
    code: "INTERNAL",
  });
}

function isErrorWithKnownCode(
  err: unknown,
): err is { code: ErrorCode; message?: unknown; headers?: unknown } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string" &&
    isErrorCode((err as { code: string }).code)
  );
}

function getHeaders(err: { headers?: unknown }): Record<string, string> | undefined {
  if (!isStringRecord(err.headers)) return undefined;
  return err.headers;
}

function isStringRecord(x: unknown): x is Record<string, string> {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  return Object.values(x).every((v) => typeof v === "string");
}

function isErrorCode(x: string): x is ErrorCode {
  return x in STATUS_BY_CODE;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function toDispatchResult(
  status: 400 | 401 | 404 | 429 | 500,
  body: DispatchResult["body"],
  headers?: Record<string, string>,
): DispatchResult {
  if (headers === undefined) {
    return { status, body };
  }
  return { status, body, headers };
}
