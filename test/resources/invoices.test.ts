// Mirror of spec/manza/resources/invoices_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza, ManzaValidationError, Page } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "invoices/list",
  "invoices/get",
  "invoices/create",
  "invoices/create_without_account",
  "invoices/create_invalid_generate_payment_link",
  "invoices/update",
  "invoices/delete",
];

interface InvoiceBody {
  generate_payment_link: boolean;
  account: { id: string };
}

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

  // Fixed dates keep the recorded body stable (manza-ruby re-records with
  // dates the API accepts in the recording month).
  test("#create creates an invoice paid into the account, asking for a payment link", async () => {
    const response = await manza.invoices.create({
      customer_id: FIXTURE_IDS.MANZA_FIXTURE_CUSTOMER_ID,
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      currency_code: "MAD",
      issue_date: "2026-11-14",
      due_date: "2026-12-14",
      generate_payment_link: true,
      items: [{ description: "SDK fixture line", quantity: 1, unit_price: "100.00" }],
    });

    expect(response.status).toBe(201);
    const body = response.body as InvoiceBody;
    expect(body.generate_payment_link).toBe(true);
    expect(body.account.id).toBe(FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID);
  });

  // An invoice is paid into one of the entity's accounts: a create without
  // one is refused as not approvable (`type` "state_error"). An account_id
  // that is not the entity's is refused with `param` "account_id".
  test("#create without an account_id rejects with ManzaValidationError", async () => {
    try {
      await manza.invoices.create({
        customer_id: FIXTURE_IDS.MANZA_FIXTURE_CUSTOMER_ID,
        currency_code: "MAD",
        issue_date: "2026-05-03",
        due_date: "2026-06-03",
        items: [{ description: "SDK fixture line", quantity: 1, unit_price: "100.00" }],
      });
      throw new Error("expected ManzaValidationError");
    } catch (err) {
      expect(err).toBeInstanceOf(ManzaValidationError);
      const e = err as ManzaValidationError;
      expect(e.status).toBe(422);
      expect(e.type).toBe("state_error");
      // The account refusal, not a date one (also state_error).
      expect(e.param).toBeNull();
      expect(e.message).toMatch(/compte bancaire|bank account/i);
    }
  });

  // Only a boolean (or "true"/"false"/"1"/"0") is taken: any other text
  // is refused before anything is created.
  test("#create with a non-boolean generate_payment_link rejects with status 400", async () => {
    try {
      await manza.invoices.create({
        customer_id: FIXTURE_IDS.MANZA_FIXTURE_CUSTOMER_ID,
        account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
        currency_code: "MAD",
        issue_date: "2026-05-03",
        due_date: "2026-06-03",
        generate_payment_link: "yes please",
        items: [{ description: "SDK fixture line", quantity: 1, unit_price: "100.00" }],
      });
      throw new Error("expected ManzaValidationError");
    } catch (err) {
      expect(err).toBeInstanceOf(ManzaValidationError);
      const e = err as ManzaValidationError;
      expect(e.status).toBe(400);
      expect(e.message).toContain("generate_payment_link");
    }
  });

  test("#update updates an invoice", async () => {
    const response = await manza.invoices.update(FIXTURE_IDS.MANZA_FIXTURE_INVOICE_ID, {
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      notes: "updated by SDK fixture spec",
      generate_payment_link: true,
    });

    expect(response.status).toBe(200);
    const body = response.body as InvoiceBody;
    expect(body.generate_payment_link).toBe(true);
    expect(body.account.id).toBe(FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID);
  });

  test("#delete deletes an invoice", async () => {
    const response = await manza.invoices.delete(FIXTURE_IDS.MANZA_FIXTURE_DELETABLE_INVOICE_ID);
    expect(response.status).toBe(204);
  });

  test("has no createPaymentLink: generate_payment_link on create or update replaced it", () => {
    expect("createPaymentLink" in manza.invoices).toBe(false);
  });

  // State-transition specs (send/markAsPaid/cancel/creditNote) are
  // pending in manza-ruby — no cassettes exist yet. We'll add them when
  // the public API gains an approve endpoint (getmanza/app issue #2174).
});
