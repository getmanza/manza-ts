// Mirror of manza-ruby's spec/examples/transfer_authorizer_spec.rb.
//
// Drives the example's authorizer handler directly with a signed copy of
// the documented `payment.authorization_requested` payload (getmanza/app
// WebhookEvents::PaymentAuthorizationRequested.example_payload, verbatim).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthorizer, type Logger } from "../../examples/transfer_authorizer/authorizer.js";
import { Ledger, type LedgerEntry } from "../../examples/transfer_authorizer/ledger.js";
import { Manza, TransferAuthorization, Webhook } from "../../src/index.js";
import { type StubReply, stubFetch } from "./stub-fetch.js";

const SECRET = "whsec_example_authorizer_secret";
const BASE_URL = "https://staging.manza.example";
const DRAFT_ID = "01958e51-7c5a-7000-8000-000000000012";
const AUTHORIZATION_ID = "01958e51-7c5a-7000-8000-000000000011";
const AUTHORIZE_URL = `${BASE_URL}/api/payments/${DRAFT_ID}/authorize`;
const DECLINE_URL = `${BASE_URL}/api/payments/${DRAFT_ID}/decline`;

const examplePayload = () => ({
  event: "payment.authorization_requested",
  event_id: "01958e51-7c5a-7000-8000-000000000010",
  created_at: "2026-10-01T12:00:00Z",
  data: {
    authorization: {
      id: "01958e51-7c5a-7000-8000-000000000011",
      nonce: "9f86d081884c7d659a2feaa0c55ad015",
      expires_at: "2026-10-01T13:00:00Z",
      signature_version: "manza.transfer-authorization.v1",
    },
    payment: {
      id: "01958e51-7c5a-7000-8000-000000000012",
      amount: "2500.0",
      currency_code: "ZAR",
      account_id: "01958e51-7c5a-7000-8000-000000000013",
      payee: "ext:01958e51-7c5a-7000-8000-000000000014",
      beneficiary_id: "01958e51-7c5a-7000-8000-000000000015",
      external_account_id: "01958e51-7c5a-7000-8000-000000000014",
      destination_account_id: null,
      payment_reference: "INV-2026-001",
      client_reference: "po_8812",
      payee_trusted: false as boolean | undefined,
    },
    signature_input:
      "manza.transfer-authorization.v1|01958e51-7c5a-7000-8000-000000000012|" +
      "9f86d081884c7d659a2feaa0c55ad015|2500.0|ZAR|01958e51-7c5a-7000-8000-000000000013|" +
      "ext:01958e51-7c5a-7000-8000-000000000014|po_8812",
  },
});

const LEDGER_ENTRY: LedgerEntry = {
  payment_id: "01958e51-7c5a-7000-8000-000000000012",
  amount: "2500.0",
  currency_code: "ZAR",
  account_id: "01958e51-7c5a-7000-8000-000000000013",
  payee: "ext:01958e51-7c5a-7000-8000-000000000014",
};

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  ({ status, body, headers }) satisfies StubReply;

describe("transfer authorizer example", () => {
  let dir: string;
  let ledger: Ledger;
  let lines: string[];
  let stub: ReturnType<typeof stubFetch>;
  let jobs: Promise<void>[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "manza-authorizer-"));
    ledger = new Ledger(join(dir, "ledger.json"));
    lines = [];
    stub = stubFetch();
    jobs = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const log = () => lines.join("\n");
  const logger: Logger = {
    info: (m) => lines.push(`INFO ${m}`),
    warn: (m) => lines.push(`WARN ${m}`),
    error: (m) => lines.push(`ERROR ${m}`),
  };

  async function deliver(
    body: string,
    { signature, allowNewPayees = true }: { signature?: string; allowNewPayees?: boolean } = {},
  ) {
    const handle = createAuthorizer({
      client: new Manza({ apiKey: "key-b", baseUrl: BASE_URL, fetch: stub.fetch }),
      secret: SECRET,
      ledger,
      executor: (job) => {
        jobs.push(job());
      },
      logger,
      ledgerWaitMs: 0,
      retryDelayMs: 0,
      allowNewPayees,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await handle(body, {
      "content-type": "application/json",
      "x-manza-signature":
        signature ?? (await Webhook.sign({ payload: body, timestamp, secret: SECRET })),
      "x-manza-timestamp": timestamp,
    });
    await Promise.all(jobs);
    return response;
  }

  async function expectedSignature() {
    const input = TransferAuthorization.signatureInput({
      ...LEDGER_ENTRY,
      nonce: "9f86d081884c7d659a2feaa0c55ad015",
      client_reference: "po_8812",
    });
    return TransferAuthorization.sign({ secret: SECRET, signature_input: input });
  }

  const callsTo = (url: string) => stub.calls.filter((c) => c.url === url);

  describe("with a matching ledger entry", () => {
    beforeEach(() => {
      ledger.record("po_8812", LEDGER_ENTRY);
    });

    test("signs from the ledger and authorizes with key B", async () => {
      stub.on("POST", AUTHORIZE_URL, json(200, { id: DRAFT_ID, status: "processing" }));

      const response = await deliver(JSON.stringify(examplePayload()));

      expect(response.status).toBe(200);
      expect(stub.calls).toEqual([
        {
          method: "POST",
          url: AUTHORIZE_URL,
          authorization: "Bearer key-b",
          body: { authorization_id: AUTHORIZATION_ID, signature: await expectedSignature() },
        },
      ]);
      for (const word of ["verified", "ledger match", "signed", "authorized"]) {
        expect(log()).toContain(word);
      }
    });

    test("logs the API error type and request id when authorize fails", async () => {
      stub.on(
        "POST",
        AUTHORIZE_URL,
        json(
          422,
          { error: { message: "Signature does not match", type: "invalid_signature" } },
          { "x-request-id": "req_123" },
        ),
      );

      const response = await deliver(JSON.stringify(examplePayload()));

      expect(response.status).toBe(200);
      expect(log()).toContain("invalid_signature");
      expect(log()).toContain("req_123");
    });

    test("logs both signature inputs and does not authorize when the webhook's differs", async () => {
      const payload = examplePayload();
      const original = payload.data.signature_input;
      payload.data.signature_input = "something-else";

      await deliver(JSON.stringify(payload));

      expect(stub.calls).toEqual([]);
      expect(log()).toContain("something-else");
      expect(log()).toContain(original);
    });

    test("retries authorize after a transient failure", async () => {
      stub.on("POST", AUTHORIZE_URL, json(503), json(200, { status: "processing" }));

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(AUTHORIZE_URL)).toHaveLength(2);
      expect(log()).toContain("retrying");
      expect(log()).toContain("authorized");
    });

    test("gives up after three attempts", async () => {
      stub.on("POST", AUTHORIZE_URL, json(503));

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(AUTHORIZE_URL)).toHaveLength(3);
      expect(log()).toContain("API error ManzaServerError");
    });

    test("retries authorize while the API answers authorization_busy", async () => {
      stub.on(
        "POST",
        AUTHORIZE_URL,
        json(409, { error: { type: "authorization_busy" } }),
        json(200, { status: "processing" }),
      );

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(AUTHORIZE_URL)).toHaveLength(2);
      expect(log()).toContain("retrying");
      expect(log()).toContain("authorized");
    });

    test("does not retry another conflict", async () => {
      stub.on("POST", AUTHORIZE_URL, json(409, { error: { type: "already_answered" } }));

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(AUTHORIZE_URL)).toHaveLength(1);
      expect(log()).toContain("API error ManzaConflictError");
    });

    test("does not retry a validation error", async () => {
      stub.on("POST", AUTHORIZE_URL, json(422, { error: { type: "invalid_signature" } }));

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(AUTHORIZE_URL)).toHaveLength(1);
    });

    test("logs that a new payee will be trusted on authorize", async () => {
      stub.on("POST", AUTHORIZE_URL, json(200, { status: "processing" }));

      await deliver(JSON.stringify(examplePayload()));

      expect(log()).toContain(
        "new payee ext:01958e51-7c5a-7000-8000-000000000014, will be trusted on authorize",
      );
    });

    test("does not log a new payee when the payee is already trusted", async () => {
      stub.on("POST", AUTHORIZE_URL, json(200, { status: "processing" }));
      const payload = examplePayload();
      payload.data.payment.payee_trusted = true;

      await deliver(JSON.stringify(payload));

      expect(log()).not.toContain("new payee");
    });

    describe("with ALLOW_NEW_PAYEES=false", () => {
      test("declines a webhook that does not say whether the payee is trusted", async () => {
        stub.on("POST", DECLINE_URL, json(200));
        const payload = examplePayload();
        payload.data.payment.payee_trusted = undefined; // JSON.stringify drops the key

        await deliver(JSON.stringify(payload), { allowNewPayees: false });

        const [call] = callsTo(DECLINE_URL);
        expect(callsTo(DECLINE_URL)).toHaveLength(1);
        expect(call?.body?.authorization_id).toBe(AUTHORIZATION_ID);
        expect(String(call?.body?.reason)).toContain("new payee");
      });

      test("declines a transfer to a payee that is not trusted yet", async () => {
        stub.on("POST", DECLINE_URL, json(200, { id: AUTHORIZATION_ID, status: "declined" }));

        await deliver(JSON.stringify(examplePayload()), { allowNewPayees: false });

        expect(callsTo(DECLINE_URL)).toHaveLength(1);
        expect(String(callsTo(DECLINE_URL)[0]?.body?.reason)).toContain("new payee");
        expect(callsTo(AUTHORIZE_URL)).toHaveLength(0);
        expect(log()).toContain("declined");
        expect(log()).toContain("new payee");
      });

      test("authorizes a trusted payee", async () => {
        stub.on("POST", AUTHORIZE_URL, json(200, { status: "processing" }));
        const payload = examplePayload();
        payload.data.payment.payee_trusted = true;

        await deliver(JSON.stringify(payload), { allowNewPayees: false });

        expect(callsTo(AUTHORIZE_URL)).toHaveLength(1);
      });
    });
  });

  describe("with a ledger mismatch", () => {
    test("declines with a reason naming the field", async () => {
      ledger.record("po_8812", { ...LEDGER_ENTRY, amount: "25000.0" });
      stub.on("POST", DECLINE_URL, json(200, { id: AUTHORIZATION_ID, status: "declined" }));

      const response = await deliver(JSON.stringify(examplePayload()));

      expect(response.status).toBe(200);
      expect(stub.calls).toHaveLength(1);
      const [call] = stub.calls;
      expect(call?.url).toBe(DECLINE_URL);
      expect(call?.body?.authorization_id).toBe(AUTHORIZATION_ID);
      expect(String(call?.body?.reason)).toContain("amount");
      expect(log()).toContain("declined");
    });
  });

  describe("without a ledger entry", () => {
    test("declines a client_reference this authorizer never issued", async () => {
      stub.on("POST", DECLINE_URL, json(200));

      await deliver(JSON.stringify(examplePayload()));

      expect(callsTo(DECLINE_URL)).toHaveLength(1);
      expect(String(callsTo(DECLINE_URL)[0]?.body?.reason)).toContain("po_8812");
    });
  });

  describe("with a bad signature", () => {
    test("answers 401 and calls nothing", async () => {
      const response = await deliver(JSON.stringify(examplePayload()), {
        signature: "0".repeat(64),
      });

      expect(response.status).toBe(401);
      expect(stub.calls).toEqual([]);
      expect(log()).toContain("rejected a delivery: invalid webhook signature");
    });
  });

  describe("with a signed body that is not a JSON object", () => {
    test("answers 401 and calls nothing", async () => {
      const response = await deliver("[]");

      expect(response.status).toBe(401);
      expect(stub.calls).toEqual([]);
    });
  });

  describe("with another event", () => {
    test("answers 200 and calls nothing", async () => {
      const response = await deliver(
        JSON.stringify({ event: "test.ping", event_id: "0199a1b2-0000-7000-8000-000000000010" }),
      );

      expect(response.status).toBe(200);
      expect(stub.calls).toEqual([]);
      expect(log()).toContain("ignoring test.ping");
    });
  });
});
