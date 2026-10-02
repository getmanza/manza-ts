// Mirrors lib/manza/client.rb. Runtime-agnostic HTTP entry point that
// uses the global `fetch` (Node 20+, Bun, Deno, browsers, Workers).

import { readEnv } from "./env.js";
import {
  ManzaAuthenticationError,
  ManzaConfigurationError,
  ManzaConflictError,
  ManzaConnectionError,
  type ManzaError,
  ManzaError as ManzaErrorBase,
  ManzaForbiddenError,
  ManzaNotFoundError,
  ManzaRateLimitError,
  ManzaServerError,
  ManzaValidationError,
} from "./errors.js";
import { Accounts } from "./resources/accounts.js";
import { Beneficiaries } from "./resources/beneficiaries.js";
import { CheckoutSessions } from "./resources/checkout_sessions.js";
import { Customers } from "./resources/customers.js";
import { Entity } from "./resources/entity.js";
import { Invoices } from "./resources/invoices.js";
import { PayeeTrustRequests } from "./resources/payee_trust_requests.js";
import { PaymentLinks } from "./resources/payment_links.js";
import { TransferDrafts } from "./resources/transfer_drafts.js";
import { WebhookEndpoints } from "./resources/webhook_endpoints.js";
import { ManzaResponse } from "./response.js";
import { VERSION } from "./version.js";

export interface ManzaClientOptions {
  apiKey?: string | undefined;
  baseUrl?: string;
  apiVersion?: string | undefined;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  params?: Record<string, unknown> | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
}

// Morocco production. South Africa: https://za.manza.finance.
const DEFAULT_BASE_URL = "https://ma.manza.finance";
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = `manza-ts/${VERSION}`;

export class Manza {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly apiVersion: string | null;
  readonly timeoutMs: number;
  readonly #fetch: typeof fetch;

  readonly accounts: Accounts;
  readonly beneficiaries: Beneficiaries;
  readonly checkoutSessions: CheckoutSessions;
  readonly customers: Customers;
  readonly entity: Entity;
  readonly invoices: Invoices;
  readonly payeeTrustRequests: PayeeTrustRequests;
  readonly paymentLinks: PaymentLinks;
  readonly transferDrafts: TransferDrafts;
  readonly webhookEndpoints: WebhookEndpoints;

  constructor(options: ManzaClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("API_KEY");
    if (!apiKey) {
      throw new ManzaConfigurationError("Missing apiKey. Pass apiKey or set MANZA_API_KEY.");
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? readEnv("BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiVersion = options.apiVersion ?? readEnv("API_VERSION") ?? null;
    this.timeoutMs = options.timeoutMs ?? (Number(readEnv("TIMEOUT_MS")) || DEFAULT_TIMEOUT_MS);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    this.accounts = new Accounts(this);
    this.beneficiaries = new Beneficiaries(this);
    this.checkoutSessions = new CheckoutSessions(this);
    this.customers = new Customers(this);
    this.entity = new Entity(this);
    this.invoices = new Invoices(this);
    this.payeeTrustRequests = new PayeeTrustRequests(this);
    this.paymentLinks = new PaymentLinks(this);
    this.transferDrafts = new TransferDrafts(this);
    this.webhookEndpoints = new WebhookEndpoints(this);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ManzaResponse<T>> {
    const url = this.#buildUrl(path, options.params);
    const headers = new Headers({
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    });
    if (this.apiVersion) headers.set("Manza-Version", this.apiVersion);
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) headers.set(k, v);
    }

    const init: RequestInit = { method: method.toUpperCase(), headers };
    if (options.body !== undefined && options.body !== null) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    let raw: Response;
    try {
      raw = await this.#fetch(url, init);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ManzaConnectionError(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw new ManzaConnectionError(
        `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const body = await parseBody<T>(raw);
    const response = new ManzaResponse(raw, body);
    if (response.success) return response;
    throw buildError(response);
  }

  #buildUrl(path: string, params?: Record<string, unknown>): string {
    const trimmed = path.replace(/^\/+/, "");
    const url = new URL(`${this.baseUrl}/${trimmed}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

async function parseBody<T>(raw: Response): Promise<T> {
  const ct = raw.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return undefined as T;
  const text = await raw.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

interface ErrorPayload {
  message?: string;
  type?: string;
  param?: string;
  payment_id?: string;
}

function errorPayload(body: unknown): ErrorPayload {
  if (!body || typeof body !== "object") return {};
  const e = (body as { error?: unknown }).error;
  if (!e || typeof e !== "object") return {};
  return e as ErrorPayload;
}

function buildError(response: ManzaResponse): ManzaError {
  const payload = errorPayload(response.body);
  const message = payload.message;
  const opts = {
    status: response.status,
    requestId: response.requestId,
    type: payload.type ?? null,
    param: payload.param ?? null,
    body: response.body,
    headers: response.headers,
  };

  switch (response.status) {
    case 400:
      return new ManzaValidationError(message ?? "Bad request", opts);
    case 401:
      return new ManzaAuthenticationError(message ?? "Authentication failed", opts);
    case 403:
      return new ManzaForbiddenError(message ?? "Forbidden", opts);
    case 404:
      return new ManzaNotFoundError(message ?? "Not found", opts);
    case 409:
      return new ManzaConflictError(message ?? "Conflict", {
        ...opts,
        paymentId: payload.payment_id ?? null,
      });
    case 422:
      return new ManzaValidationError(message ?? "Validation failed", opts);
    case 429: {
      const retryAfter = Number(response.headers.get("retry-after"));
      return new ManzaRateLimitError(message ?? "Rate limited", {
        ...opts,
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
      });
    }
  }

  if (response.status >= 500 && response.status < 600) {
    return new ManzaServerError(message ?? `Server error (${response.status})`, opts);
  }
  return new ManzaErrorBase(message ?? `Unexpected status ${response.status}`, opts);
}
