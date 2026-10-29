// Mirror of manza-ruby's spec/examples/preflight_spec.rb: drives the
// example's preflight against stubs of the documented responses.

import { beforeEach, describe, expect, test } from "bun:test";
import { Preflight } from "../../examples/transfer_authorizer/preflight.js";
import { type StubReply, stubFetch } from "./stub-fetch.js";

const BASE_URL = "https://staging.manza.example";
const ACCOUNT_ID = "01958e51-7c5a-7000-8000-000000000013";
const BENEFICIARY_ID = "01958e51-7c5a-7000-8000-000000000015";
const ENDPOINT_ID = "01958e51-7c5a-7000-8000-000000000020";
const NOW = new Date(Date.UTC(2026, 9, 20, 12));

const URLS = {
  entity: `${BASE_URL}/api/entity`,
  authorizer: `${BASE_URL}/api/transfer_authorizer`,
  account: `${BASE_URL}/api/accounts/${ACCOUNT_ID}`,
  endpoint: `${BASE_URL}/api/webhook_endpoints/${ENDPOINT_ID}`,
  beneficiary: `${BASE_URL}/api/beneficiaries/${BENEFICIARY_ID}`,
};

const json = (status: number, body: unknown): StubReply => ({ status, body });
const error = (status: number, type: string, message = "refused") =>
  json(status, { error: { type, message } });

describe("transfer authorizer preflight", () => {
  let env: Record<string, string>;
  let authorizer: Record<string, unknown>;
  let endpoint: Record<string, unknown>;
  let payee: Record<string, unknown>;
  let stub: ReturnType<typeof stubFetch>;

  beforeEach(() => {
    env = {
      MANZA_BASE_URL: BASE_URL,
      MANZA_CREATOR_API_KEY: "key-a",
      MANZA_AUTHORIZER_API_KEY: "key-b",
      MANZA_AUTHORIZER_SECRET: "whsec_example",
      MANZA_ACCOUNT_ID: ACCOUNT_ID,
      MANZA_BENEFICIARY_ID: BENEFICIARY_ID,
    };
    authorizer = {
      status: "active",
      suspension_reason: null,
      currency_code: "MAD",
      per_transfer_limit: "1000.0",
      daily_limit: "5000.0",
      daily_authorized_total: "100.0",
      secret_expires_at: "2027-01-18T00:00:00Z",
      webhook_endpoint_id: ENDPOINT_ID,
      enrolled_at: "2026-10-01T08:30:00Z",
    };
    endpoint = { id: ENDPOINT_ID, url: "https://authorizer.example.com/", status: "active" };
    payee = { id: "01958e51-7c5a-7000-8000-000000000014", default: true, trusted: true };
    stub = stubFetch();
  });

  // Routes are set at run time so a test can change the bodies first.
  function stubDefaults(overrides: Partial<Record<keyof typeof URLS, StubReply>>) {
    const defaults: Record<keyof typeof URLS, StubReply> = {
      entity: json(200, { id: "e1", name: "Acme" }),
      authorizer: json(200, authorizer),
      account: json(200, { id: ACCOUNT_ID, currency_code: "MAD" }),
      endpoint: json(200, endpoint),
      beneficiary: json(200, { id: BENEFICIARY_ID, external_accounts: [payee] }),
    };
    for (const name of Object.keys(URLS) as (keyof typeof URLS)[]) {
      stub.on("GET", URLS[name], overrides[name] ?? defaults[name]);
    }
  }

  async function run({
    amount = "10.00",
    ...overrides
  }: { amount?: string } & Partial<Record<keyof typeof URLS, StubReply>> = {}) {
    stubDefaults(overrides);
    const lines: string[] = [];
    const ok = await new Preflight({
      env,
      amount,
      out: (line) => lines.push(line),
      now: NOW,
      fetch: stub.fetch,
    }).run();
    return { ok, lines, output: lines.join("\n") };
  }

  const failures = (lines: string[]) => lines.filter((l) => l.startsWith("✗"));
  const warnings = (lines: string[]) => lines.filter((l) => l.startsWith("!"));

  test("passes every step when the setup is complete, reading with the right key", async () => {
    const { ok, lines } = await run();

    expect(ok).toBe(true);
    expect(failures(lines)).toEqual([]);
    expect(lines.filter((l) => l.startsWith("✓"))).toHaveLength(9);
    for (const call of stub.calls) {
      const key = call.url === URLS.authorizer ? "key-b" : "key-a";
      expect(call.authorization).toBe(`Bearer ${key}`);
    }
  });

  test("fails when a key is missing", async () => {
    env.MANZA_AUTHORIZER_API_KEY = "";
    const { ok, lines } = await run();

    expect(ok).toBe(false);
    expect(failures(lines)[0]).toContain("MANZA_AUTHORIZER_API_KEY");
    expect(stub.calls).toEqual([]);
  });

  test("fails when the account or beneficiary id is missing", async () => {
    env.MANZA_BENEFICIARY_ID = "";
    const { ok, lines } = await run();

    expect(ok).toBe(false);
    expect(failures(lines)[0]).toContain("MANZA_BENEFICIARY_ID");
    expect(stub.calls).toEqual([]);
  });

  test("fails when the amount is not a decimal, and runs the other checks", async () => {
    const { ok, lines, output } = await run({ amount: "ten" });

    expect(ok).toBe(false);
    expect(failures(lines)).toHaveLength(1);
    expect(failures(lines)[0]).toContain('"ten"');
    expect(failures(lines)[0]).toContain("10.00");
    expect(output).toContain("✓ transfer authorizer is active");
    expect(output).not.toContain("limit per transfer and");
  });

  test("fails when the amount is not positive", async () => {
    for (const amount of ["-5", "0", "1/2", "1e2"]) {
      const { lines } = await run({ amount });

      expect(failures(lines)[0]).toContain(JSON.stringify(amount));
      expect(failures(lines)[0]).toContain("positive");
    }
  });

  test("stops before any request on a missing key, even with a bad amount", async () => {
    env.MANZA_CREATOR_API_KEY = "";
    const { lines } = await run({ amount: "0" });

    expect(failures(lines)).toHaveLength(2);
    expect(stub.calls).toEqual([]);
  });

  test("fails when both keys are the same", async () => {
    env.MANZA_AUTHORIZER_API_KEY = "key-a";
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("different");
  });

  test("fails when key A cannot reach the entity", async () => {
    const { lines } = await run({ entity: error(401, "authentication_error") });

    expect(failures(lines)[0]).toContain("key A");
    expect(failures(lines)[0]).toContain("MANZA_CREATOR_API_KEY");
  });

  test("fails when no authorizer is enrolled", async () => {
    const { lines } = await run({ authorizer: error(404, "not_found_error") });

    expect(failures(lines)[0]).toContain("no transfer authorizer is enrolled");
    expect(failures(lines)[0]).toContain("Transfer approval");
  });

  test("fails when key B cannot read the authorizer", async () => {
    const { lines } = await run({ authorizer: error(403, "insufficient_scope") });

    for (const part of ["key B", "insufficient_scope", "transfers:authorize"]) {
      expect(failures(lines)[0]).toContain(part);
    }
  });

  test("fails when key A cannot read the account", async () => {
    const { lines } = await run({ account: error(403, "insufficient_scope") });

    expect(failures(lines)[0]).toContain("key A");
    expect(failures(lines)[0]).toContain("accounts:read");
  });

  test("fails when key A cannot read the enrolled webhook endpoint", async () => {
    const { lines } = await run({ endpoint: error(403, "insufficient_scope") });

    expect(failures(lines)[0]).toContain("key A");
    expect(failures(lines)[0]).toContain("webhook_endpoints:read");
  });

  test("fails when key A cannot read the beneficiary", async () => {
    const { lines } = await run({ beneficiary: error(404, "not_found_error") });

    expect(failures(lines)[0]).toContain("key A");
    expect(failures(lines)[0]).toContain("MANZA_BENEFICIARY_ID");
  });

  test("fails once, on the authorizer line, when the secret has expired", async () => {
    Object.assign(authorizer, {
      status: "suspended",
      suspension_reason: "secret_expired",
      secret_expires_at: "2026-10-19T00:00:00Z",
    });
    const { lines } = await run();

    expect(failures(lines)).toHaveLength(1);
    expect(failures(lines)[0]).toContain("suspended (secret_expired)");
    expect(failures(lines)[0]).toContain("rotates the secret");
  });

  test("fails when the enrolled webhook endpoint was deleted", async () => {
    const { lines } = await run({ endpoint: error(404, "not_found_error") });

    expect(failures(lines)[0]).toContain("was deleted");
    expect(failures(lines)[0]).toContain("enrol");
  });

  test("fails with the suspension reason and its fix", async () => {
    Object.assign(authorizer, { status: "suspended", suspension_reason: "endpoint_disabled" });
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("suspended (endpoint_disabled)");
    expect(failures(lines)[0]).toContain("re-enable");
  });

  test("fails when the account's currency is not the enrolled one", async () => {
    const { lines } = await run({ account: json(200, { id: ACCOUNT_ID, currency_code: "ZAR" }) });

    expect(failures(lines)[0]).toContain("ZAR");
    expect(failures(lines)[0]).toContain("MAD");
  });

  test("fails when the secret expires within 7 days", async () => {
    authorizer.secret_expires_at = "2026-10-23T00:00:00Z";
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("secret expires");
    expect(failures(lines)[0]).toContain("rotate");
  });

  test("fails when the signing secret is not set", async () => {
    env.MANZA_AUTHORIZER_SECRET = "";
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("MANZA_AUTHORIZER_SECRET");
  });

  test("fails when the enrolled webhook endpoint is disabled", async () => {
    endpoint.status = "disabled";
    const { lines } = await run();

    for (const part of ["disabled", "enable", "if the authorizer stays suspended"]) {
      expect(failures(lines)[0]).toContain(part);
    }
  });

  test("warns when the endpoint is on a URL that changes when the tunnel restarts", async () => {
    endpoint.url = "https://abc123.ngrok-free.app/";
    const { ok, lines } = await run();

    expect(ok).toBe(true);
    expect(warnings(lines)[0]).toContain("ngrok-free.app");
    expect(warnings(lines)[0]).toContain("reserved domain");
  });

  test("fails when the amount is over the limit per transfer", async () => {
    const { lines } = await run({ amount: "1500.00" });

    expect(failures(lines)[0]).toContain("limit per transfer");
  });

  test("fails when the amount does not fit in the last 24 hours' room", async () => {
    authorizer.daily_authorized_total = "4995.0";
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("24 hours");
    expect(failures(lines)[0]).toContain("5.00 left");
  });

  test("compares amounts exactly, not as floats", async () => {
    authorizer.per_transfer_limit = "0.3";
    const { lines } = await run({ amount: "0.30" });

    expect(failures(lines)).toEqual([]);
  });

  test("warns that a new payee needs the toggle, which the API does not show", async () => {
    payee.trusted = false;
    const { ok, lines } = await run();

    expect(ok).toBe(true);
    for (const part of ["not trusted yet", "Approve transfers to new payees", "IP allowlist"]) {
      expect(warnings(lines)[0]).toContain(part);
    }
  });

  test("fails when the beneficiary has no default bank account", async () => {
    payee.default = false;
    const { lines } = await run();

    expect(failures(lines)[0]).toContain("default bank account");
  });
});
