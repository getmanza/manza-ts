// Mirror of spec/manza/resources/transfer_authorizer_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, TEST_API_KEY } from "../fixture-ids.js";

describe("TransferAuthorizer (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(["transfer_authorizer/get"]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#get returns the enrolled authorizer's status, limits and usage", async () => {
    const response = await manza.transferAuthorizer.get();

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body.status).toBe("active");
    expect(body.suspension_reason).toBeNull();
    expect(body.currency_code).toBe("MAD");
    for (const key of [
      "per_transfer_limit",
      "daily_limit",
      "daily_authorized_total",
      "secret_expires_at",
      "webhook_endpoint_id",
      "enrolled_at",
    ]) {
      expect(body).toHaveProperty(key);
    }
  });
});
