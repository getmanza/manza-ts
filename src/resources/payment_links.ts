// Mirrors lib/manza/resources/payment_links.rb.

import type { Page } from "../page.js";
import type { ManzaResponse } from "../response.js";
import { type ListParams, ResourceBase } from "./base.js";

export class PaymentLinks extends ResourceBase {
  list(params: ListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor } = params;
    return this.listPage("api/payment_links", {}, { limit, cursor });
  }

  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/payment_links", id));
  }

  create(attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPost("api/payment_links", attributes);
  }

  cancel(id: string): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/payment_links", id, "cancel"));
  }
}
