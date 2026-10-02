// Mirrors lib/manza/resources/payee_trust_requests.rb.
//
// Requests to trust payees for machine-authorized transfers. The API
// key can only ask: a member holding payment-authorize permission
// approves the request in the Manza app. Status: pending → approved /
// declined / cancelled. There is no list, update, or delete.

import type { ManzaResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class PayeeTrustRequests extends ResourceBase {
  // At most 100 external_account_ids per request.
  create(params: { external_account_ids: string[] }): Promise<ManzaResponse> {
    return this.httpPost("api/payee_trust_requests", {
      external_account_ids: params.external_account_ids,
    });
  }

  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/payee_trust_requests", id));
  }
}
