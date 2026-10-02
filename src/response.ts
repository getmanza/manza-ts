// Mirrors lib/manza/response.rb. Thin wrapper over Fetch's Response so
// callers don't have to care about JSON parsing, header casing, etc.

export class ManzaResponse<TBody = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: TBody;
  readonly raw: Response;

  constructor(raw: Response, body: TBody) {
    this.raw = raw;
    this.status = raw.status;
    this.headers = raw.headers;
    this.body = body;
  }

  get success(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  get requestId(): string | null {
    return this.headers.get("x-request-id");
  }
}
