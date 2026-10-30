// Mirrors lib/manza/resources/payments.rb.
//
// API-initiated transfers, called payments (formerly transfer drafts;
// `/api/transfer_drafts` stays a permanent server-side alias). Creating
// a draft never executes a transfer by itself. A draft inside the
// entity's machine-authorization envelope (trusted payee, within
// limits) is sent to the enrolled transfer authorizer as a
// `payment.authorization_requested` webhook; answer it with authorize()
// or decline(), using an API key other than the one that created the
// draft. Every other draft goes to the in-app approval flow, where a
// manager or legal representative approves it. Poll get() (status:
// requested → processing → completed / failed) or subscribe to the
// `transfer.executed` webhook to follow execution.
//
// A draft's `authorization` says which way it went: `pending` (a
// challenge was sent), `authorized`, `declined` (the draft is deleted),
// or one of two outcomes that send the draft to the in-app approvers,
// each with a `refusal_reason`:
//
// - `refused`: it did not qualify, at create time (no webhook is sent)
//   or again when the challenge was answered: `untrusted_payee`,
//   `unrestricted_api_key`, `over_new_payee_limit`,
//   `over_transfer_limit`, `over_daily_limit`, `currency_mismatch`,
//   `suspended` or `secret_expired`.
// - `expired` / `superseded` / `failed`: a challenge was sent and closed
//   without an authorize: `expired` (no answer within the hour),
//   `stale` (the draft, its payee's bank details or the endpoint changed
//   while it was open) or `signature_failed` (five invalid signatures).
//   One exception: the in-app approval that finalizes the draft while
//   its challenge is open supersedes it (`stale`), and the draft
//   executes or is scheduled; the draft's own `status` shows which.
//
// `authorization` is null when no authorizer was enrolled.
//
// With "Approve transfers to new payees" on (enrolment, in the app), a
// draft to bank details the entity never trusted is challenged too, up
// to the new-payee limit, when the creating key has an IP allowlist;
// authorizing it also trusts the payee.

import { ManzaArgumentError } from "../errors.js";
import type { ManzaResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class Payments extends ResourceBase {
  // POST /api/payments
  //
  // Required: account_id, amount, and exactly one of beneficiary_id
  // (external transfer) or destination_account_id (own-account move).
  // Optional: external_account_id, currency_code, payment_reference,
  // internal_notes, client_reference (unique per entity, at most 128
  // characters; a duplicate raises ManzaConflictError whose paymentId
  // names the existing draft).
  create(attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPost("api/payments", attributes);
  }

  // GET /api/payments/:id
  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/payments", id));
  }

  // POST /api/payments/:id/authorize
  //
  // Executes the draft. authorization_id comes from the
  // payment.authorization_requested webhook; build signature with
  // TransferAuthorization. Requires the transfers:authorize scope on a
  // key other than the draft's creator (otherwise 403
  // same_key_forbidden), bound to an IP allowlist (otherwise 403
  // unrestricted_api_key). A 409 ManzaConflictError with type
  // authorization_busy means a bank-detail edit, trust or trust
  // revocation on the payee was in flight: retry. A blank signature
  // throws ManzaArgumentError and is never sent: the API would count it
  // as a failed attempt. Five invalid signatures fail the challenge.
  authorize(
    id: string,
    params: { authorization_id: string; signature: string },
  ): Promise<ManzaResponse> {
    if (!params.signature || params.signature.trim() === "") {
      throw new ManzaArgumentError("signature cannot be blank");
    }
    return this.httpPost(this.encodePath("api/payments", id, "authorize"), {
      authorization_id: params.authorization_id,
      signature: params.signature,
    });
  }

  // POST /api/payments/:id/decline
  //
  // Declines the challenge and deletes the draft. Returns the
  // authorization (status: "declined", declined_at, and a null
  // refusal_reason).
  decline(
    id: string,
    params: { authorization_id: string; reason?: string | null | undefined },
  ): Promise<ManzaResponse> {
    const body: Record<string, unknown> = { authorization_id: params.authorization_id };
    if (params.reason !== undefined && params.reason !== null) body.reason = params.reason;
    return this.httpPost(this.encodePath("api/payments", id, "decline"), body);
  }
}
