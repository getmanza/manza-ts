// Mirrors lib/manza/webhook.rb. Verifies incoming webhook deliveries.
// Pure functions — no HTTP.
//
// Every delivery carries `X-Manza-Signature` (hex HMAC-SHA256 of
// "<timestamp>.<raw body>" under the endpoint's signing secret) and
// `X-Manza-Timestamp` (Unix seconds, fresh on every attempt). The
// legacy `X-Zazu-*` names carry the same values.
//
// Pass the **raw request body**, never re-serialized JSON:
//
//   const event = await Webhook.constructEvent({ payload: rawBody, headers: req.headers, secret });
//   event.event // "payment.authorization_requested"
//
// Async because Web Crypto is: no `node:crypto` import keeps the SDK
// runtime-agnostic (Node 20+, Bun, Deno, browsers, Workers).

import { ManzaArgumentError } from "./errors.js";
import { sign as hmacSha256Hex } from "./transfer_authorization.js";

export const DEFAULT_TOLERANCE = 300; // seconds

// A Fetch `Headers`, or a plain object such as Node's IncomingHttpHeaders
// (repeated headers arrive as arrays; the first value is read).
export type WebhookHeaders =
  | Headers
  | Record<string, string | number | readonly string[] | null | undefined>;

export interface WebhookSignParams {
  payload: string;
  timestamp: string | number;
  secret: string;
}

export interface WebhookVerifyParams {
  payload: string;
  signature: string;
  timestamp: string | number;
  secret: string;
  // Seconds either side of `now`. `null` skips the timestamp check: only
  // for replaying a captured delivery in a local tool or test, never on a
  // live endpoint.
  tolerance?: number | null | undefined;
  now?: Date | undefined;
}

export interface WebhookConstructEventParams {
  payload: string;
  headers: WebhookHeaders;
  secret: string;
  tolerance?: number | null | undefined;
  now?: Date | undefined;
}

// Hex HMAC-SHA256 of "<timestamp>.<payload>". For tests and local tools.
export function sign(params: WebhookSignParams): Promise<string> {
  if (params.secret === "") {
    return Promise.reject(new ManzaArgumentError("secret cannot be empty"));
  }
  return hmacSha256Hex({
    secret: params.secret,
    signature_input: `${params.timestamp}.${params.payload}`,
  });
}

// true when the signature matches (constant time) and the timestamp is
// within `tolerance` seconds of `now`. Never throws on bad input;
// resolves false.
export async function verify(params: WebhookVerifyParams): Promise<boolean> {
  return (
    (await signatureMatches(params.payload, params.signature, params.timestamp, params.secret)) &&
    timestampFresh(params.timestamp, params.tolerance, params.now)
  );
}

// Reads X-Manza-Signature / X-Manza-Timestamp from the headers
// (case-insensitive, X-Zazu-* fallback, Rack HTTP_X_MANZA_* form too),
// verifies them, and resolves to the parsed JSON object. Rejects with
// ManzaArgumentError when a header is missing, the signature does not
// match, the timestamp is outside tolerance, or the body is not a JSON
// object.
export async function constructEvent(
  params: WebhookConstructEventParams,
): Promise<Record<string, unknown>> {
  const normalized = normalizeHeaders(params.headers);
  const signature = header(normalized, "signature");
  const timestamp = header(normalized, "timestamp");

  if (!(await signatureMatches(params.payload, signature, timestamp, params.secret))) {
    throw new ManzaArgumentError("invalid webhook signature");
  }
  if (!timestampFresh(timestamp, params.tolerance, params.now)) {
    throw new ManzaArgumentError("webhook timestamp outside tolerance");
  }

  let event: unknown;
  try {
    event = JSON.parse(params.payload);
  } catch {
    throw new ManzaArgumentError("webhook payload is not JSON");
  }
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new ManzaArgumentError("webhook payload is not a JSON object");
  }
  return event as Record<string, unknown>;
}

async function signatureMatches(
  payload: unknown,
  signature: unknown,
  timestamp: unknown,
  secret: unknown,
): Promise<boolean> {
  if (typeof payload !== "string" || typeof secret !== "string" || secret === "") return false;
  if (typeof signature !== "string") return false;
  if (typeof timestamp !== "string" && typeof timestamp !== "number") return false;
  if (parseTimestamp(timestamp) === null) return false;

  const expected = await sign({ payload, timestamp, secret });
  return constantTimeEqual(expected, signature);
}

// Compares every character, so the time taken does not reveal how much
// of a forged signature was right.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function timestampFresh(
  timestamp: unknown,
  tolerance: number | null | undefined,
  now: Date | undefined,
): boolean {
  if (tolerance === null) return true;

  const seconds = parseTimestamp(timestamp);
  if (seconds === null) return false;
  const nowSeconds = Math.floor((now ?? new Date()).getTime() / 1000);
  return Math.abs(nowSeconds - seconds) <= (tolerance ?? DEFAULT_TOLERANCE);
}

function parseTimestamp(timestamp: unknown): number | null {
  if (typeof timestamp === "number") return Number.isInteger(timestamp) ? timestamp : null;
  if (typeof timestamp !== "string" || !/^[+-]?\d+$/.test(timestamp.trim())) return null;
  return Number.parseInt(timestamp, 10);
}

function normalizeHeaders(headers: WebhookHeaders): Map<string, string> {
  const entries: [string, unknown][] = [];
  if (headers instanceof Headers) {
    headers.forEach((value, name) => {
      entries.push([name, value]);
    });
  } else {
    entries.push(...Object.entries(headers ?? {}));
  }
  const normalized = new Map<string, string>();
  for (const [name, raw] of entries) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) continue;
    normalized.set(
      name
        .replace(/^HTTP_/i, "")
        .replace(/_/g, "-")
        .toLowerCase(),
      String(value),
    );
  }
  return normalized;
}

function header(normalized: Map<string, string>, suffix: "signature" | "timestamp"): string {
  const manza = `x-manza-${suffix}`;
  const value = normalized.has(manza) ? normalized.get(manza) : normalized.get(`x-zazu-${suffix}`);
  if (value) return value;

  const name = suffix.charAt(0).toUpperCase() + suffix.slice(1);
  throw new ManzaArgumentError(`missing X-Manza-${name} header`);
}

export const Webhook = {
  DEFAULT_TOLERANCE,
  sign,
  verify,
  constructEvent,
} as const;
