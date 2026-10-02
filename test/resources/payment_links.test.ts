// Mirror of spec/manza/resources/payment_links_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza, Page } from "../../src/index.js";
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
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await manza.paymentLinks.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single payment link", async () => {
    const response = await manza.paymentLinks.get(FIXTURE_IDS.MANZA_FIXTURE_PAYMENT_LINK_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates a payment link", async () => {
    const response = await manza.paymentLinks.create({
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      amount: "100.00",
      title: "SDK fixture",
      description: "Created by zazu-ruby fixture spec",
      link_type: "single",
    });
    expect(response.status).toBe(201);
  });

  test("#cancel cancels a payment link", async () => {
    const response = await manza.paymentLinks.cancel(
      FIXTURE_IDS.MANZA_FIXTURE_CANCELLABLE_PAYMENT_LINK_ID,
    );
    expect(response.success).toBe(true);
  });
});
