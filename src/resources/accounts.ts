// Mirrors lib/manza/resources/accounts.rb.

import type { Page } from "../page.js";
import type { ManzaResponse } from "../response.js";
import { type ListParams, ResourceBase } from "./base.js";

export interface AccountListParams extends ListParams {
  status?: string;
  currency_code?: string;
}

export interface TransactionListParams extends ListParams {
  operation?: string;
  posted_after?: string | Date;
  posted_before?: string | Date;
}

export class Accounts extends ResourceBase {
  list(params: AccountListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor, ...rest } = params;
    return this.listPage("api/accounts", rest, { limit, cursor });
  }

  get(id: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/accounts", id));
  }

  listTransactions(accountId: string, params: TransactionListParams = {}): Promise<Page<unknown>> {
    const { limit, cursor, posted_after, posted_before, ...rest } = params;
    return this.listPage(
      this.encodePath("api/accounts", accountId, "transactions"),
      {
        ...rest,
        posted_after: serializeTime(posted_after),
        posted_before: serializeTime(posted_before),
      },
      { limit, cursor },
    );
  }

  getTransaction(accountId: string, transactionId: string): Promise<ManzaResponse> {
    return this.httpGet(this.encodePath("api/accounts", accountId, "transactions", transactionId));
  }
}

function serializeTime(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
}
