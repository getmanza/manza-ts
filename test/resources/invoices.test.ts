// Mirror of spec/manza/resources/invoices_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza, Page } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "invoices/list",
  "invoices/get",
  "invoices/create",
  "invoices/update",
  "invoices/delete",
];

describe("Invoices (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page", async () => {
    const page = await manza.invoices.list();
    expect(page).toBeInstanceOf(Page);
  });

  test("#get returns a single invoice", async () => {
    const response = await manza.invoices.get(FIXTURE_IDS.MANZA_FIXTURE_INVOICE_ID);
    expect(typeof (response.body as { id: unknown }).id).toBe("string");
  });

  test("#create creates an invoice", async () => {
    const response = await manza.invoices.create({
      customer_id: FIXTURE_IDS.MANZA_FIXTURE_CUSTOMER_ID,
      currency_code: "MAD",
      issue_date: "2026-05-03",
      due_date: "2026-06-03",
      items: [{ description: "SDK fixture line", quantity: 1, unit_price: "100.00" }],
    });
    expect(response.status).toBe(201);
  });

  test("#update updates an invoice", async () => {
    const response = await manza.invoices.update(FIXTURE_IDS.MANZA_FIXTURE_INVOICE_ID, {
      notes: "updated by SDK fixture spec",
    });
    expect(response.status).toBe(200);
  });

  test("#delete deletes an invoice", async () => {
    const response = await manza.invoices.delete(FIXTURE_IDS.MANZA_FIXTURE_DELETABLE_INVOICE_ID);
    expect(response.status).toBe(204);
  });

  // State-transition specs (send/markAsPaid/cancel/creditNote/
  // createPaymentLink) are pending in manza-ruby — no cassettes
  // exist yet. We'll add them when the public API gains an approve
  // endpoint (getmanza/app issue #2174).
});
