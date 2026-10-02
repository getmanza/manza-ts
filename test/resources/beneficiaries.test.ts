// Mirror of spec/manza/resources/beneficiaries_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Manza, Page } from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

const CASSETTES = [
  "beneficiaries/list",
  "beneficiaries/get",
  "beneficiaries/create",
  "beneficiaries/list_external_accounts",
  "beneficiaries/get_external_account",
  "beneficiaries/create_external_account",
];

describe("Beneficiaries (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(CASSETTES);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#list returns a Page of beneficiaries with their bank accounts", async () => {
    const page = await manza.beneficiaries.list();

    expect(page).toBeInstanceOf(Page);
    const first = page.data[0] as { external_accounts: unknown };
    expect(Array.isArray(first.external_accounts)).toBe(true);
  });

  test("#get returns a single beneficiary", async () => {
    const response = await manza.beneficiaries.get(FIXTURE_IDS.MANZA_FIXTURE_BENEFICIARY_ID);

    const body = response.body as { id: unknown; external_accounts: unknown };
    expect(typeof body.id).toBe("string");
    expect(Array.isArray(body.external_accounts)).toBe(true);
  });

  test("#create creates a business beneficiary", async () => {
    const response = await manza.beneficiaries.create({
      beneficiary_type: "business",
      company_name: "Zazu Fixture Beneficiary - spec (zazu-ruby-fixture)",
      email: "fixture-beneficiary-spec@example.com",
    });

    const body = response.body as { id: unknown; beneficiary_type: string };
    expect(typeof body.id).toBe("string");
    expect(body.beneficiary_type).toBe("business");
  });

  test("#listExternalAccounts returns a Page of the beneficiary's bank accounts", async () => {
    const page = await manza.beneficiaries.listExternalAccounts(
      FIXTURE_IDS.MANZA_FIXTURE_CREATED_BENEFICIARY_ID,
    );

    expect(page).toBeInstanceOf(Page);
    expect(Array.isArray(page.data)).toBe(true);
  });

  test("#getExternalAccount returns a single external account", async () => {
    const response = await manza.beneficiaries.getExternalAccount(
      FIXTURE_IDS.MANZA_FIXTURE_CREATED_BENEFICIARY_ID,
      FIXTURE_IDS.MANZA_FIXTURE_EXTERNAL_ACCOUNT_ID,
    );

    const body = response.body as { id: unknown };
    expect(typeof body.id).toBe("string");
  });

  test("#createExternalAccount adds a bank account to the beneficiary", async () => {
    const response = await manza.beneficiaries.createExternalAccount(
      FIXTURE_IDS.MANZA_FIXTURE_CREATED_BENEFICIARY_ID,
      {
        account_number: FIXTURE_IDS.MANZA_FIXTURE_NEW_ACCOUNT_NUMBER,
        name: "Fixture Secondary Account",
      },
    );

    const body = response.body as { id: unknown; name: string };
    expect(typeof body.id).toBe("string");
    expect(typeof body.name).toBe("string");
  });
});
