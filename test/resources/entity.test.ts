// Mirror of spec/manza/resources/entity_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, TEST_API_KEY } from "../fixture-ids.js";

describe("Entity (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(["entity/get"]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#get returns the entity", async () => {
    const response = await manza.entity.get();
    expect(response.success).toBe(true);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });
});
