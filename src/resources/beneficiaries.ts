// Mirrors lib/zazu/resources/beneficiaries.rb.
//
// Saved transfer recipients. Each beneficiary embeds its bank
// accounts; the one flagged `default` is used when a transfer names
// only the beneficiary_id. There is no update or delete via the API.

import type { Page } from "../page.js";
import type { ZazuResponse } from "../response.js";
import { type ListParams, ResourceBase } from "./base.js";

export class Beneficiaries extends ResourceBase {
  list(params: ListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor } = params;
    return this.listPage("api/beneficiaries", {}, { limit, cursor });
  }

  get(id: string): Promise<ZazuResponse> {
    return this.httpGet(this.encodePath("api/beneficiaries", id));
  }

  // Keys: beneficiary_type ("individual" | "business"; inferred from
  // person_name / company_name when omitted), person_name,
  // company_name, email, phone_number. Shares a 10/minute limit with
  // createExternalAccount.
  create(attributes: Record<string, unknown>): Promise<ZazuResponse> {
    return this.httpPost("api/beneficiaries", attributes);
  }

  listExternalAccounts(beneficiaryId: string, params: ListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor } = params;
    return this.listPage(
      this.encodePath("api/beneficiaries", beneficiaryId, "external_accounts"),
      {},
      { limit, cursor },
    );
  }

  getExternalAccount(beneficiaryId: string, id: string): Promise<ZazuResponse> {
    return this.httpGet(
      this.encodePath("api/beneficiaries", beneficiaryId, "external_accounts", id),
    );
  }

  // Required: account_number. Optional: name, country_code,
  // currency_code, account_type ("bank" only), bank_identifier
  // (required in ZA, rejected in MA where it is derived from the RIB).
  createExternalAccount(
    beneficiaryId: string,
    attributes: Record<string, unknown>,
  ): Promise<ZazuResponse> {
    return this.httpPost(
      this.encodePath("api/beneficiaries", beneficiaryId, "external_accounts"),
      attributes,
    );
  }
}
