// Mirror of spec/zazu/resources/webhook_endpoints_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Page, Zazu } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "webhook_endpoints/list",
  "webhook_endpoints/get",
  "webhook_endpoints/create",
  "webhook_endpoints/update",
  "webhook_endpoints/delete",
  "webhook_endpoints/test",
  "webhook_endpoints/regenerate_secret",
  "webhook_endpoints/enable",
  "webhook_endpoints/disable",
];

describe("WebhookEndpoints (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await zazu.webhookEndpoints.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single webhook endpoint", async () => {
    const response = await zazu.webhookEndpoints.get(FIXTURE_IDS.ZAZU_FIXTURE_WEBHOOK_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates a webhook endpoint", async () => {
    const response = await zazu.webhookEndpoints.create({
      url: "https://example.com/zazu-webhooks",
      events: ["payment_link.paid"],
      description: "SDK fixture endpoint",
    });
    expect(response.status).toBe(201);
  });

  test("#update updates a webhook endpoint", async () => {
    const response = await zazu.webhookEndpoints.update(FIXTURE_IDS.ZAZU_FIXTURE_WEBHOOK_ID, {
      description: "Updated description",
      events: ["payment_link.paid"],
    });
    expect(response.success).toBe(true);
  });

  test("#delete deletes a webhook endpoint", async () => {
    const response = await zazu.webhookEndpoints.delete(
      FIXTURE_IDS.ZAZU_FIXTURE_DELETABLE_WEBHOOK_ID,
    );
    expect(response.status).toBe(204);
  });

  test("#test fires a test event", async () => {
    const response = await zazu.webhookEndpoints.test(FIXTURE_IDS.ZAZU_FIXTURE_WEBHOOK_ID);
    expect(response.success).toBe(true);
  });

  test("#regenerateSecret rotates the webhook secret", async () => {
    const response = await zazu.webhookEndpoints.regenerateSecret(
      FIXTURE_IDS.ZAZU_FIXTURE_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });

  test("#enable enables an endpoint", async () => {
    const response = await zazu.webhookEndpoints.enable(
      FIXTURE_IDS.ZAZU_FIXTURE_DISABLED_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });

  test("#disable disables an endpoint", async () => {
    const response = await zazu.webhookEndpoints.disable(
      FIXTURE_IDS.ZAZU_FIXTURE_ENABLED_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });
});
