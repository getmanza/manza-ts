// Mirrors lib/zazu/resources/transfer_drafts.rb.
//
// API-initiated transfers. Creating a draft never executes a transfer
// by itself. A draft inside the entity's machine-authorization
// envelope (trusted payee, within limits) is sent to the enrolled
// transfer authorizer as a `payment.authorization_requested` webhook;
// answer it with authorize() or decline(), using an API key other
// than the one that created the draft. Every other draft goes to the
// in-app approval flow, where a manager or legal representative
// approves it. Poll get() (status: requested → processing →
// completed / failed) or subscribe to the `transfer.executed` webhook.

import { ZazuArgumentError } from "../errors.js";
import type { ZazuResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class TransferDrafts extends ResourceBase {
  // Required: account_id, amount, and exactly one of beneficiary_id
  // (external) or destination_account_id (own-account move). Optional:
  // external_account_id, currency_code, payment_reference,
  // internal_notes, client_reference (unique per entity, ≤128 chars;
  // a duplicate raises ZazuConflictError whose paymentId names the
  // existing draft).
  create(attributes: Record<string, unknown>): Promise<ZazuResponse> {
    return this.httpPost("api/transfer_drafts", attributes);
  }

  get(id: string): Promise<ZazuResponse> {
    return this.httpGet(this.encodePath("api/transfer_drafts", id));
  }

  // Executes the draft. authorizationId comes from the
  // payment.authorization_requested webhook; build signature with
  // TransferAuthorization. Requires the transfers:authorize scope on
  // a key other than the draft's creator (otherwise 403
  // same_key_forbidden). A blank signature is refused locally — the
  // API counts it as a failed attempt, and five fail the challenge.
  authorize(
    id: string,
    params: { authorization_id: string; signature: string },
  ): Promise<ZazuResponse> {
    if (!params.signature || params.signature.trim() === "") {
      throw new ZazuArgumentError("signature cannot be blank");
    }
    return this.httpPost(this.encodePath("api/transfer_drafts", id, "authorize"), {
      authorization_id: params.authorization_id,
      signature: params.signature,
    });
  }

  // Declines the challenge and deletes the draft. Returns the
  // authorization (status: "declined").
  decline(
    id: string,
    params: { authorization_id: string; reason?: string | null | undefined },
  ): Promise<ZazuResponse> {
    const body: Record<string, unknown> = { authorization_id: params.authorization_id };
    if (params.reason !== undefined && params.reason !== null) body.reason = params.reason;
    return this.httpPost(this.encodePath("api/transfer_drafts", id, "decline"), body);
  }
}
