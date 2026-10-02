// Mirrors lib/manza/errors.rb. Nine concrete error classes plus the
// abstract base. Discriminate via `instanceof`, not string match.

export interface ManzaErrorOptions {
  status?: number;
  requestId?: string | null;
  type?: string | null;
  param?: string | null;
  body?: unknown;
  // Full response headers from the failed request. Carried so callers
  // can inspect things the public API surfaces only via headers
  // (e.g. Manza-Version, Retry-After, X-RateLimit-*).
  headers?: Headers | null;
}

export class ManzaError extends Error {
  readonly status: number | undefined;
  readonly requestId: string | null;
  readonly type: string | null;
  readonly param: string | null;
  readonly body: unknown;
  readonly headers: Headers | null;

  constructor(message: string, options: ManzaErrorOptions = {}) {
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

export class ManzaConfigurationError extends ManzaError {}
export class ManzaConnectionError extends ManzaError {}
export class ManzaAuthenticationError extends ManzaError {}
export class ManzaForbiddenError extends ManzaError {}
export class ManzaNotFoundError extends ManzaError {}
export class ManzaValidationError extends ManzaError {}
export class ManzaRateLimitError extends ManzaError {
  readonly retryAfter: number | null;

  constructor(message: string, options: ManzaErrorOptions & { retryAfter?: number | null } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter ?? null;
  }
}
export class ManzaServerError extends ManzaError {}
export class ManzaArgumentError extends ManzaError {}
// 409 — the request conflicts with an existing resource. For a
// duplicate `client_reference` on a transfer draft (type
// "duplicate_client_reference"), `paymentId` names the existing draft.
export class ManzaConflictError extends ManzaError {
  readonly paymentId: string | null;

  constructor(message: string, options: ManzaErrorOptions & { paymentId?: string | null } = {}) {
    super(message, options);
    this.paymentId = options.paymentId ?? null;
  }
}
