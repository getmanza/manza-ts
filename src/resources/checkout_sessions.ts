// Mirrors lib/manza/resources/checkout_sessions.rb.

import type { ManzaResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class CheckoutSessions extends ResourceBase {
  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/checkout_sessions", id));
  }

  create(attributes: Record<string, unknown>): Promise<ManzaResponse> {
    return this.httpPost("api/checkout_sessions", attributes);
  }
}
