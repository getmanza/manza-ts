// Mirror of spec/manza/resources/transfer_drafts_spec.rb.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  Manza,
  ManzaArgumentError,
  ManzaConflictError,
  ManzaForbiddenError,
  ManzaValidationError,
} from "../../src/index.js";
import { startServer } from "../cassette-replay.js";
import { CASSETTE_BASE_URL, FIXTURE_IDS, TEST_API_KEY } from "../fixture-ids.js";

describe("TransferDrafts (cassette replay)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  // `authorize` and `authorize_same_key` share method + URI, and the
  // matcher strips `signature`, so msw can't tell them apart — they
  // belong in separate server scopes. See the isolated describes below.
  beforeAll(async () => {
    server = await startServer([
      "transfer_drafts/create",
      "transfer_drafts/create_duplicate",
      "transfer_drafts/get",
      "transfer_drafts/authorize",
      "transfer_drafts/authorize_bad_signature",
      "transfer_drafts/decline",
    ]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("#create creates a draft awaiting in-app approval", async () => {
    const response = await manza.transferDrafts.create({
      account_id: FIXTURE_IDS.MANZA_FIXTURE_ACCOUNT_ID,
      beneficiary_id: FIXTURE_IDS.MANZA_FIXTURE_BENEFICIARY_ID,
      amount: "150.00",
      payment_reference: "SDK fixture",
      client_reference: FIXTURE_IDS.MANZA_FIXTURE_CLIENT_REFERENCE,
    });

    expect(response.status).toBe(201);
    const body = response.body as { status: string; transfer: unknown; client_reference: string };
    expect(body.status).toBe("requested");
    expect(body.transfer).toBeNull();
    expect(body.client_reference).toBe(FIXTURE_IDS.MANZA_FIXTURE_CLIENT_REFERENCE);
  });

  test("#create raises ManzaConflictError with paymentId on a duplicate client_reference", async () => {
    try {
      await manza.transferDrafts.create({
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

  test("#get returns a single transfer draft", async () => {
    const response = await manza.transferDrafts.get(FIXTURE_IDS.MANZA_FIXTURE_TRANSFER_DRAFT_ID);
    const body = response.body as { id: unknown; status: unknown; authorization: unknown };
    expect(typeof body.id).toBe("string");
    expect(typeof body.status).toBe("string");
    expect(body.authorization).toBeDefined();
  });

  test("#authorize executes the draft", async () => {
    const response = await manza.transferDrafts.authorize(
      FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID,
      {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "any-non-blank-signature",
      },
    );

    const body = response.body as {
      status: string;
      transfer: { status: string } | null;
      authorization: { status: string };
    };
    expect(body.status).toBe("processing");
    expect(body.transfer?.status).toBe("submitted");
    expect(body.authorization.status).toBe("authorized");
  });

  test("#authorize rejects on a signature mismatch with invalid_signature", async () => {
    try {
      await manza.transferDrafts.authorize(FIXTURE_IDS.MANZA_FIXTURE_BAD_SIGNATURE_DRAFT_ID, {
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
      manza.transferDrafts.authorize(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID, {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "   ",
      }),
    ).toThrow(ManzaArgumentError);
  });

  test("#decline declines the challenge and deletes the draft", async () => {
    const response = await manza.transferDrafts.decline(
      FIXTURE_IDS.MANZA_FIXTURE_DECLINABLE_DRAFT_ID,
      {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_DECLINABLE_AUTHORIZATION_ID,
        reason: "SDK fixture",
      },
    );

    const body = response.body as { status: string; declined_at: string };
    expect(body.status).toBe("declined");
    expect(typeof body.declined_at).toBe("string");
  });
});

// Isolated scope — only authorize_same_key is loaded so there's no
// handler collision on POST /transfer_drafts/.../authorize.
describe("TransferDrafts#authorize same-key rejection (isolated)", () => {
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  let manza: Manza;

  beforeAll(async () => {
    server = await startServer(["transfer_drafts/authorize_same_key"]);
    manza = new Manza({ apiKey: TEST_API_KEY, baseUrl: CASSETTE_BASE_URL });
  });

  afterAll(() => server?.close());

  test("rejects with ManzaForbiddenError when the authorizer key equals the creator key", async () => {
    try {
      await manza.transferDrafts.authorize(FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_DRAFT_ID, {
        authorization_id: FIXTURE_IDS.MANZA_FIXTURE_AUTHORIZABLE_AUTHORIZATION_ID,
        signature: "any-non-blank-signature",
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
