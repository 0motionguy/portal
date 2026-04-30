import type { DispatchResult, ErrorCode } from "./types.ts";

export const STATUS_BY_CODE = {
  NOT_FOUND: 404,
  INVALID_PARAMS: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PAYMENT_REQUIRED: 402, // PE-002 extension
} as const satisfies Record<ErrorCode, 400 | 401 | 402 | 404 | 429 | 500>;

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
  readonly status: 400 | 401 | 402 | 404 | 429 | 500;
  readonly headers?: Record<string, string>;
  // PE-002 extension hook: subclasses can attach extra body fields (e.g. the
  // x402 challenge envelope on PaymentRequiredError). Keys are merged into
  // the response body alongside { ok, error, code }.
  readonly bodyExtras?: Record<string, unknown>;

  protected constructor(
    message: string,
    status: 400 | 401 | 402 | 404 | 429 | 500,
    headers?: Record<string, string>,
    bodyExtras?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    if (headers !== undefined) this.headers = headers;
    if (bodyExtras !== undefined) this.bodyExtras = bodyExtras;
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

// Portal Extension PE-002 — paid tools.
// Throwing this from a ToolHandler emits HTTP 402 with the x402 challenge
// embedded in the response body's `x402` field, alongside the standard
// { ok: false, error, code: "PAYMENT_REQUIRED" } envelope.
export class PaymentRequiredError extends ProviderCallError {
  readonly code = "PAYMENT_REQUIRED" as const;

  constructor(
    challenge: {
      x402Version?: number;
      accepts: ReadonlyArray<Record<string, unknown>>;
      resource?: Record<string, unknown>;
    },
    message = "payment required",
  ) {
    const body = {
      x402: {
        x402Version: challenge.x402Version ?? 1,
        accepts: challenge.accepts,
        ...(challenge.resource ? { resource: challenge.resource } : {}),
      },
    };
    super(message, STATUS_BY_CODE.PAYMENT_REQUIRED, undefined, body);
    this.name = "PaymentRequiredError";
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

// PE-002 factory.
export function paymentRequired(
  challenge: {
    x402Version?: number;
    accepts: ReadonlyArray<Record<string, unknown>>;
    resource?: Record<string, unknown>;
  },
  message?: string,
): PaymentRequiredError {
  return message === undefined
    ? new PaymentRequiredError(challenge)
    : new PaymentRequiredError(challenge, message);
}

export function normalizeThrownError(err: unknown): DispatchResult {
  if (err instanceof ProviderCallError) {
    const body: DispatchResult["body"] = {
      ok: false,
      error: err.message,
      code: err.code,
      ...(err.bodyExtras ?? {}),
    };
    return toDispatchResult(err.status, body, err.headers);
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
  status: 400 | 401 | 402 | 404 | 429 | 500,
  body: DispatchResult["body"],
  headers?: Record<string, string>,
): DispatchResult {
  if (headers === undefined) {
    return { status, body };
  }
  return { status, body, headers };
}
