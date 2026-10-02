// Mirrors lib/zazu/errors.rb. Nine concrete error classes plus the
// abstract base. Discriminate via `instanceof`, not string match.

export interface ZazuErrorOptions {
  status?: number;
  requestId?: string | null;
  type?: string | null;
  param?: string | null;
  body?: unknown;
  // Full response headers from the failed request. Carried so callers
  // can inspect things the public API surfaces only via headers
  // (e.g. Zazu-Version, Retry-After, X-RateLimit-*).
  headers?: Headers | null;
}

export class ZazuError extends Error {
  readonly status: number | undefined;
  readonly requestId: string | null;
  readonly type: string | null;
  readonly param: string | null;
  readonly body: unknown;
  readonly headers: Headers | null;

  constructor(message: string, options: ZazuErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = options.status;
    this.requestId = options.requestId ?? null;
    this.type = options.type ?? null;
    this.param = options.param ?? null;
    this.body = options.body;
    this.headers = options.headers ?? null;
  }
}

export class ZazuConfigurationError extends ZazuError {}
export class ZazuConnectionError extends ZazuError {}
export class ZazuAuthenticationError extends ZazuError {}
export class ZazuForbiddenError extends ZazuError {}
export class ZazuNotFoundError extends ZazuError {}
export class ZazuValidationError extends ZazuError {}
export class ZazuRateLimitError extends ZazuError {
  readonly retryAfter: number | null;

  constructor(message: string, options: ZazuErrorOptions & { retryAfter?: number | null } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter ?? null;
  }
}
export class ZazuServerError extends ZazuError {}
export class ZazuArgumentError extends ZazuError {}
// 409 — the request conflicts with an existing resource. For a
// duplicate `client_reference` on a transfer draft (type
// "duplicate_client_reference"), `paymentId` names the existing draft.
export class ZazuConflictError extends ZazuError {
  readonly paymentId: string | null;

  constructor(message: string, options: ZazuErrorOptions & { paymentId?: string | null } = {}) {
    super(message, options);
    this.paymentId = options.paymentId ?? null;
  }
}
