// Mirrors lib/manza/resources/base.rb. Carries a back-reference to the
// client and exposes thin HTTP helpers, plus pagination + path-encoding
// utilities every resource shares.

import type { Manza } from "../client.js";
import { ManzaArgumentError } from "../errors.js";
import { MAX_PER_PAGE, Page, type PageBody } from "../page.js";
import type { ManzaResponse } from "../response.js";

export interface ListParams {
  limit?: number | undefined;
  cursor?: string | null | undefined;
}

export abstract class ResourceBase {
  protected readonly client: Manza;

  constructor(client: Manza) {
    this.client = client;
  }

  protected httpGet<T>(path: string, params?: Record<string, unknown>): Promise<ManzaResponse<T>> {
    return this.client.request<T>("GET", path, { params });
  }

  protected httpPost<T>(path: string, body?: unknown): Promise<ManzaResponse<T>> {
    return this.client.request<T>("POST", path, { body });
  }

  protected httpPatch<T>(path: string, body?: unknown): Promise<ManzaResponse<T>> {
    return this.client.request<T>("PATCH", path, { body });
  }

  protected httpDelete<T>(path: string): Promise<ManzaResponse<T>> {
    return this.client.request<T>("DELETE", path);
  }

  protected async listPage<T>(
    path: string,
    params: Record<string, unknown> = {},
    listOpts: ListParams = {},
  ): Promise<Page<T>> {
    const limit = this.validateLimit(listOpts.limit);

    const fetcher = async (cursor: string | null): Promise<Page<T>> => {
      const query = compactObject({ ...params, limit, cursor });
      const response = await this.httpGet<PageBody<T>>(path, query);
      return new Page<T>(response, fetcher);
    };

    return fetcher(listOpts.cursor ?? null);
  }

  protected validateLimit(limit: number | undefined): number {
    if (limit === undefined || limit === null) return MAX_PER_PAGE;
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new ManzaArgumentError(
        `limit must be a positive integer (got ${JSON.stringify(limit)})`,
      );
    }
    if (limit > MAX_PER_PAGE) {
      throw new ManzaArgumentError(`limit cannot exceed ${MAX_PER_PAGE} (got ${limit})`);
    }
    return limit;
  }

  // Path joiner that percent-encodes segments and refuses blank ones.
  // Mirrors the encode_path tightening we did in manza-ruby — a blank
  // segment silently turns /things/:id into /things/ and dispatches
  // to the list endpoint, so we surface it loudly.
  protected encodePath(base: string, ...segments: string[]): string {
    const encoded = segments.map((s) => {
      const str = String(s);
      if (str.length === 0) {
        throw new ManzaArgumentError("path segment cannot be blank");
      }
      return str.replace(
        /[^A-Za-z0-9._~-]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
      );
    });
    return [base, ...encoded].join("/");
  }
}

function compactObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}
