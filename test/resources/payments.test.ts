// Mirror of spec/manza/resources/payments_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  Manza,
  ManzaArgumentError,
  ManzaConflictError,
  ManzaForbiddenError,
  ManzaValidationError,
  TransferAuthorization,
} from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

describe("Payments (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  // `authorize` and `authorize_same_key` share method + URI, and the
  // matcher strips `signature`, so msw can't tell them apart — they
  // belong in separate server scopes. See the isolated describes below.
  beforeAll(async () => {
    server = await startServer([
      "payments/create",
      "payments/create_duplicate",
      "payments/get",
      "payments/get_refused",
      "payments/authorize",
      "payments/authorize_bad_signature",
      "payments/authorize_new_payee",
      "payments/decline",
    ]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#create creates a draft carrying the client_reference", async () => {
    const response = await manza.payments.create({
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      beneficiary_id: FIXTURE_IDS.MANZA_FIXTURE_BENEFICIARY_ID,
      amount: "10.00",
      payment_reference: "SDK fixture",
      internal_notes: "[zazu-ruby-fixture] create spec - do not approve",
      client_reference: FIXTURE_IDS.MANZA_FIXTURE_CLIENT_REFERENCE,
    });

    expect(response.status).toBe(201);
    const body = response.body as {
      status: string;
      transfer: unknown;
      client_reference: string;
      authorization: { status: string };
    };
    expect(body.status).toBe("requested");
    expect(body.client_reference).toBe(FIXTURE_IDS.MANZA_FIXTURE_CLIENT_REFERENCE);
    // Inside the envelope: the challenge went to the authorizer.
    expect(body.authorization.status).toBe("pending");
    expect(body.transfer).toBeNull();
  });

  test("#create raises ManzaConflictError with paymentId on a duplicate client_reference", async () => {
    try {
      await manza.payments.create({
        account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
        beneficiary_id: FIXTURE_IDS.MANZA_FIXTURE_BENEFICIARY_ID,
        amount: "10.00",
        client_reference: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_CLIENT_REFERENCE,
      });
      throw new Error("expected ManzaConflictError");
    } catch (err) {
      expect(err).toBeInstanceOf(ManzaConflictError);
      const e = err as ManzaConflictError;
      expect(e.status).toBe(409);
      expect(e.type).toBe("duplicate_client_reference");
      expect(e.paymentId).toBe(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID);
    }
  });

  test("#get returns a single payment", async () => {
    const response = await manza.payments.get(FIXTURE_IDS.MANZA_FIXTURE_TRANSFER_DRAFT_ID);
    const body = response.body as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("transfer");
  });

  test("#get carries a refused authorization and its refusal_reason", async () => {
    const response = await manza.payments.get(FIXTURE_IDS.MANZA_FIXTURE_REFUSED_DRAFT_ID);
    const body = response.body as {
      id: string;
      authorization: { status: string; refusal_reason: string };
    };
    expect(body.id).toBe(FIXTURE_IDS.MANZA_FIXTURE_REFUSED_DRAFT_ID);
    expect(body.authorization.status).toBe("refused");
    expect(body.authorization.refusal_reason).toBe("over_transfer_limit");
  });

  test("#authorize executes the draft", async () => {
    const response = await manza.payments.authorize(
      FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID,
      {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "any-non-blank-signature",
      },
    );

    expect(response.status).toBe(200);
    const body = response.body as {
      id: string;
      status: string;
      transfer: { status: string } | null;
      authorization: { status: string };
    };
    expect(body.id).toBe(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID);
    expect(body.status).toBe("processing");
    expect(body.transfer?.status).toBe("submitted");
    expect(body.authorization.status).toBe("authorized");
  });

  // The fresh bank account was never trusted; with "Approve transfers to
  // new payees" on, the authorizer approves it and the signature trusts it.
  test("#authorize executes a transfer to a new payee", async () => {
    const draftId = FIXTURE_IDS.MANZA_FIXTURE_NEW_PAYEE_DRAFT_ID;
    const input = TransferAuthorization.signatureInput({
      payment_id: draftId,
      nonce: FIXTURE_IDS.MANZA_FIXTURE_NEW_PAYEE_NONCE,
      amount: "10.0",
      currency_code: "MAD",
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      payee: TransferAuthorization.payeeFor({
        external_account_id: FIXTURE_IDS.MANZA_FIXTURE_EXTERNAL_ACCOUNT_ID,
      }),
      client_reference: FIXTURE_IDS.MANZA_FIXTURE_NEW_PAYEE_CLIENT_REFERENCE,
    });

    const response = await manza.payments.authorize(draftId, {
      authorization_id: FIXTURE_IDS.MANZA_FIXTURE_NEW_PAYEE_AUTHORIZATION_ID,
      signature: await TransferAuthorization.sign({
        secret: "whsec_replay",
        signature_input: input,
      }),
    });

    expect(response.status).toBe(200);
    const body = response.body as { id: string; authorization: { status: string } };
    expect(body.id).toBe(draftId);
    expect(body.authorization.status).toBe("authorized");
  });

  test("#authorize rejects on a signature mismatch with invalid_signature", async () => {
    try {
      await manza.payments.authorize(FIXTURE_IDS.MANZA_FIXTURE_BAD_SIGNATURE_DRAFT_ID, {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_BAD_SIGNATURE_AUTHORIZATION_ID,
        signature: "0".repeat(64),
      });
      throw new Error("expected ManzaValidationError");
    } catch (err) {
      expect(err).toBeInstanceOf(ManzaValidationError);
      const e = err as ManzaValidationError;
      expect(e.status).toBe(422);
      expect(e.type).toBe("invalid_signature");
    }
  });

  test("#authorize raises ManzaArgumentError on a blank signature (no HTTP)", () => {
    expect(() =>
      manza.payments.authorize(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID, {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "   ",
      }),
    ).toThrow(ManzaArgumentError);
  });

  test("#decline declines the challenge and deletes the draft", async () => {
    const response = await manza.payments.decline(FIXTURE_IDS.MANZA_FIXTURE_DECLINABLE_DRAFT_ID, {
      authorization_id: FIXTURE_IDS.MANZA_FIXTURE_DECLINABLE_AUTHORIZATION_ID,
      reason: "SDK fixture",
    });

    expect(response.status).toBe(200);
    const body = response.body as { id: string; status: string; declined_at: string };
    expect(body.id).toBe(FIXTURE_IDS.MANZA_FIXTURE_DECLINABLE_AUTHORIZATION_ID);
    expect(body.status).toBe("declined");
    expect(typeof body.declined_at).toBe("string");
  });
});

// Isolated scope — only authorize_same_key is loaded so there's no
// handler collision on POST /api/payments/.../authorize.
describe("Payments#authorize same-key rejection (isolated)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(["payments/authorize_same_key"]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("rejects with ManzaForbiddenError when the authorizer key equals the creator key", async () => {
    try {
      await manza.payments.authorize(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID, {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "0".repeat(64),
      });
      throw new Error("expected ManzaForbiddenError");
    } catch (err) {
      expect(err).toBeInstanceOf(ManzaForbiddenError);
      const e = err as ManzaForbiddenError;
      expect(e.status).toBe(403);
      expect(e.type).toBe("same_key_forbidden");
    }
  });
});
