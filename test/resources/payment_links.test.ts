// Mirror of spec/zazu/resources/payment_links_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Page, Zazu } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "payment_links/list",
  "payment_links/get",
  "payment_links/create",
  "payment_links/cancel",
];

describe("PaymentLinks (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await zazu.paymentLinks.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single payment link", async () => {
    const response = await zazu.paymentLinks.get(FIXTURE_IDS.ZAZU_FIXTURE_PAYMENT_LINK_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates a payment link", async () => {
    const response = await zazu.paymentLinks.create({
      account_id: FIXTURE_IDS.ZAZU_FIXTURE_ACCOUNT_ID,
      amount: "100.00",
      title: "SDK fixture",
      description: "Created by zazu-ruby fixture spec",
      link_type: "single",
    });
    expect(response.status).toBe(201);
  });

  test("#cancel cancels a payment link", async () => {
    const response = await zazu.paymentLinks.cancel(
      FIXTURE_IDS.ZAZU_FIXTURE_CANCELLABLE_PAYMENT_LINK_ID,
    );
    expect(response.success).toBe(true);
  });
});
