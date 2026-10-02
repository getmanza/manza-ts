// Mirror of spec/manza/resources/webhook_endpoints_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza, Page } from "../../src/index.js";
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
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await manza.webhookEndpoints.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single webhook endpoint", async () => {
    const response = await manza.webhookEndpoints.get(FIXTURE_IDS.MANZA_FIXTURE_WEBHOOK_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates a webhook endpoint", async () => {
    const response = await manza.webhookEndpoints.create({
      url: "https://example.com/zazu-webhooks",
      events: ["payment_link.paid"],
      description: "SDK fixture endpoint",
    });
    expect(response.status).toBe(201);
  });

  test("#update updates a webhook endpoint", async () => {
    const response = await manza.webhookEndpoints.update(FIXTURE_IDS.MANZA_FIXTURE_WEBHOOK_ID, {
      description: "Updated description",
      events: ["payment_link.paid"],
    });
    expect(response.success).toBe(true);
  });

  test("#delete deletes a webhook endpoint", async () => {
    const response = await manza.webhookEndpoints.delete(
      FIXTURE_IDS.MANZA_FIXTURE_DELETABLE_WEBHOOK_ID,
    );
    expect(response.status).toBe(204);
  });

  test("#test fires a test event", async () => {
    const response = await manza.webhookEndpoints.test(FIXTURE_IDS.MANZA_FIXTURE_WEBHOOK_ID);
    expect(response.success).toBe(true);
  });

  test("#regenerateSecret rotates the webhook secret", async () => {
    const response = await manza.webhookEndpoints.regenerateSecret(
      FIXTURE_IDS.MANZA_FIXTURE_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });

  test("#enable enables an endpoint", async () => {
    const response = await manza.webhookEndpoints.enable(
      FIXTURE_IDS.MANZA_FIXTURE_DISABLED_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });

  test("#disable disables an endpoint", async () => {
    const response = await manza.webhookEndpoints.disable(
      FIXTURE_IDS.MANZA_FIXTURE_ENABLED_WEBHOOK_ID,
    );
    expect(response.success).toBe(true);
  });
});
