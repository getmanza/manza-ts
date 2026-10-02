// Mirror of spec/zazu/resources/customers_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Page, Zazu } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "customers/list",
  "customers/list_q_filtered",
  "customers/get",
  "customers/create",
  "customers/update",
  "customers/delete",
];

describe("Customers (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let zazu: Zazu;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    zazu = new Zazu({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await zazu.customers.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#list with q filter passes q through", async () => {
    const page = await zazu.customers.list({ q: "Acme" });
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single customer", async () => {
    const response = await zazu.customers.get(FIXTURE_IDS.ZAZU_FIXTURE_CUSTOMER_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates a customer", async () => {
    const response = await zazu.customers.create({
      customer_type: "business",
      company_name: "Zazu SDK Fixture Co (zazu-ruby-fixture-v1-spec)",
      email: "create-spec@zazu-ruby-fixture.example.com",
      ice_number: "000000000000000",
    });
    expect(response.status).toBe(201);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#update updates a customer", async () => {
    const response = await zazu.customers.update(FIXTURE_IDS.ZAZU_FIXTURE_CUSTOMER_ID, {
      email: "updated@example.com",
    });
    expect(response.status).toBe(200);
  });

  test("#delete deletes a customer", async () => {
    const response = await zazu.customers.delete(FIXTURE_IDS.ZAZU_FIXTURE_DELETABLE_CUSTOMER_ID);
    expect(response.status).toBe(204);
  });
});
