// Mirror of spec/zazu/resources/entity_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Zazu } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, TEST_API_KEY } from "../fixture-ids.js";

describe("Entity (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(["entity/get"]);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#get returns the entity", async () => {
    const response = await zazu.entity.get();
    expect(response.success).toBe(true);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });
});
