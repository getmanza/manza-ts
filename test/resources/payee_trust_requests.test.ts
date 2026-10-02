// Mirror of spec/manza/resources/payee_trust_requests_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = ["payee_trust_requests/create", "payee_trust_requests/get"];

describe("PayeeTrustRequests (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#create requests trust for one or more external accounts", async () => {
    const response = await manza.payeeTrustRequests.create({
      external_account_ids: [FIXTURE_IDS.MANZA_FIXTURE_EXTERNAL_ACCOUNT_ID],
    });

    const body = response.body as {
      id: unknown;
      status: string;
      external_account_ids: string[];
    };
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("pending");
    expect(body.external_account_ids).toEqual([FIXTURE_IDS.MANZA_FIXTURE_EXTERNAL_ACCOUNT_ID]);
  });

  test("#get returns a single payee trust request", async () => {
    const response = await manza.payeeTrustRequests.get(
      FIXTURE_IDS.MANZA_FIXTURE_PAYEE_TRUST_REQUEST_ID,
    );

    const body = response.body as { id: unknown; status: unknown };
    expect(typeof body.id).toBe("string");
    expect(typeof body.status).toBe("string");
  });
});
