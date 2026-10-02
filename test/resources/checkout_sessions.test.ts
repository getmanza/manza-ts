// Mirror of spec/zazu/resources/checkout_sessions_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Zazu } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = ["checkout_sessions/create", "checkout_sessions/get"];

describe("CheckoutSessions (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#create creates a checkout session", async () => {
    const response = await zazu.checkoutSessions.create({
      account_id: FIXTURE_IDS.ZAZU_FIXTURE_ACCOUNT_ID,
      amount: "100.00",
      success_url: "https://example.com/zazu-fixture-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://example.com/zazu-fixture-cancel",
      description: "Created by zazu-ruby fixture spec",
      customer_email: "fixture@example.com",
      metadata: { order_id: "ORD-FIXTURE" },
    });
    expect(response.status).toBe(201);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
    expect((response.body as { status: unknown }).status).toBe("open");
  });

  test("#get returns a single checkout session", async () => {
    const response = await zazu.checkoutSessions.get(FIXTURE_IDS.ZAZU_FIXTURE_CHECKOUT_SESSION_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
    expect(typeof (response.body as { status: unknown }).status).toBe("string");
  });
});
