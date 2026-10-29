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
  // webhook_endpoint_id and enrolled_at. It does not show whether new
  // payees are approved. Rejects with ManzaNotFoundError when no
  // authorizer is enrolled.
  get(): Promise<ManzaResponse> {
    return this.httpGet("api/transfer_authorizer");
  }
}
