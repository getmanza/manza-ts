// Mirrors lib/manza/resources/invoices.rb.

import type { Page } from "../page.js";
import type { ManzaResponse } from "../response.js";
import { type ListParams, ResourceBase } from "./base.js";

export interface InvoiceListParams extends ListParams {
  status?: string;
  customer_id?: string;
}

export class Invoices extends ResourceBase {
  list(params: InvoiceListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor, ...rest } = params;
    return this.listPage("api/invoices", rest, { limit, cursor });
  }

  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/invoices", id));
  }

  create(attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPost("api/invoices", attributes);
  }

  update(id: string, attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPatch(this.encodePath("api/invoices", id), attributes);
  }

  delete(id: string): Promise<ManzaResponse> {
    return this.httpDelete(this.encodePath("api/invoices", id));
  }

  // State-transition endpoints below mirror the pending specs in the
  // Ruby SDK. They are exposed but the public API does not yet have
  // the underlying transitions wired up — see getmanza/app issue #2174.
  send(id: string): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/invoices", id, "send"));
  }

  markAsPaid(id: string, attributes: Record<string, unknown> = {}): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/invoices", id, "mark_as_paid"), attributes);
  }

  cancel(id: string): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/invoices", id, "cancel"));
  }

  creditNote(id: string, attributes: Record<string, unknown> = {}): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/invoices", id, "credit_note"), attributes);
  }

  createPaymentLink(id: string, attributes: Record<string, unknown> = {}): Promise<ManzaResponse> {
    return this.httpPost(this.encodePath("api/invoices", id, "payment_link"), attributes);
  }
}
