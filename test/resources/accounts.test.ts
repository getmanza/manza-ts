// Mirror of spec/zazu/resources/accounts_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Page, Zazu, ZazuArgumentError, ZazuResponse } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "accounts/list",
  "accounts/list_currency_filtered",
  "accounts/get",
  "accounts/list_transactions",
  "accounts/get_transaction",
];

describe("Accounts (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => {
    server?.close();
  });

  test("#list returns a Page of accounts", async () => {
    const page = await zazu.accounts.list();
    expect(page).toBeInstanceOf(Page);
    expect(Array.isArray(page.data)).toBe(true);
  });

  test("#list with currency_code filter passes the filter through", async () => {
    const page = await zazu.accounts.list({ currency_code: "MAD" });
    expect(page).toBeInstanceOf(Page);
  });

  test("#list raises before sending a request when limit > 100", async () => {
    expect(() => zazu.accounts.list({ limit: 500 })).toThrow(ZazuArgumentError);
  });

  test("#get returns a single account", async () => {
    const response = await zazu.accounts.get(FIXTURE_IDS.ZAZU_FIXTURE_ACCOUNT_ID);
    expect(response).toBeInstanceOf(ZazuResponse);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#listTransactions returns a Page of transactions", async () => {
    const page = await zazu.accounts.listTransactions(FIXTURE_IDS.ZAZU_FIXTURE_ACCOUNT_ID);
    expect(page).toBeInstanceOf(Page);
    expect(Array.isArray(page.data)).toBe(true);
  });

  test("#getTransaction returns a single transaction", async () => {
    const response = await zazu.accounts.getTransaction(
      FIXTURE_IDS.ZAZU_FIXTURE_ACCOUNT_ID,
      FIXTURE_IDS.ZAZU_FIXTURE_TRANSACTION_ID,
    );
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });
});
