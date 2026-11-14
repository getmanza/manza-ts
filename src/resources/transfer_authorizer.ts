// Mirrors lib/manza/resources/transfer_authorizer.rb.
//
// The entity's enrolled transfer authorizer, read-only. Enrolment,
// limits, the "Approve transfers to new payees" option and resume stay
// in the app behind a second factor. A singular resource: no list, no id.
//
//   (await manza.transferAuthorizer.get()).body.status  // "active"

import type { ManzaResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class TransferAuthorizer extends ResourceBase {
  // GET /api/transfer_authorizer
  //
  // Any key with transfers:read, transfers:write or transfers:authorize.
  // Returns status (active / suspended), suspension_reason (member,
  // signature_failures, secret_expired, endpoint_disabled; null when
  // active), currency_code, per_transfer_limit, daily_limit,
  // daily_authorized_total (the last 24 hours), secret_expires_at,
  // webhook_endpoint_id, enrolled_at, trust_new_payees (whether "Approve
  // transfers to new payees" is on) and new_payee_limit (the ceiling for
  // a transfer to a new payee, a decimal string; null while
  // trust_new_payees is off). Rejects with ManzaNotFoundError when no
  // authorizer is enrolled.
  get(): Promise<ManzaResponse> {
    return this.httpGet("api/transfer_authorizer");
  }
}
