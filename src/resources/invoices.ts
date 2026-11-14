// Mirrors lib/manza/resources/invoices.rb.

import type { Page } from "../page.js";
import type { ManzaResponse } from "../response.js";
import { type ListParams, ResourceBase } from "./base.js";

export interface InvoiceListParams extends ListParams {
  // draft, pending_approval, declined, approved, sent, paid, overdue or
  // cancelled.
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

  // POST /api/invoices
  //
  // Required: customer_id, account_id (the entity's account the invoice
  // is paid into, from Accounts#list; without one the API answers 422
  // `state_error`, and an account that is not the entity's 422 with
  // `param` "account_id"), issue_date, due_date and items. Optional:
  // currency_code, reference, notes, payment_terms, send_to_email,
  // discounts, delivery_date (MA only) and generate_payment_link.
  //
  // `generate_payment_link: true` asks for a card payment link, made
  // from the invoice's account when the invoice is approved; it needs
  // the `payment_links:write` scope and is taken only while payment
  // links are enabled for the entity. A boolean, null (no link) or the
  // strings "true", "false", "1" and "0" are taken; any other value
  // rejects with ManzaValidationError (400) and nothing is created. It
  // replaces the removed createPaymentLink.
  //
  // The response carries `generate_payment_link`, the embedded
  // `account` (`id`, `name`, `currency_code`, and `rib` in Morocco or
  // `account_number` in South Africa) and `payment_link` once one
  // exists. A plan that caps invoices rejects with
  // ManzaPlanLimitReachedError.
  create(attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPost("api/invoices", attributes);
  }

  // PATCH /api/invoices/:id
  //
  // Takes the create fields, account_id and generate_payment_link
  // included (the same scope and entity rule apply), on an invoice that
  // is still editable.
  update(id: string, attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPatch(this.encodePath("api/invoices", id), attributes);
  }

  // DELETE /api/invoices/:id
  //
  // Only a `draft`, `pending_approval` or `declined` invoice that has no
  // number yet; any other rejects with ManzaValidationError
  // (`state_error`).
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
}
