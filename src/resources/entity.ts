// Mirrors lib/manza/resources/entity.rb.

import type { ManzaResponse } from "../response.js";
import { ResourceBase } from "./base.js";

export class Entity extends ResourceBase {
  get(): Promise<ManzaResponse> {
    return this.httpGet("api/entity");
  }
}
