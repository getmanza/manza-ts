// Mirror of spec/manza/transfer_authorization_spec.rb.
//
// Fixed test vector shared across every SDK in the family — each
// implementation must produce exactly these hex digests from these
// inputs. Compare against:
//
//   printf '%s' '<input>' | openssl dgst -sha256 -hmac 'whsec_test_vector_secret'

import { describe, expect, test } from "bun:test";
import { ManzaArgumentError, TransferAuthorization } from "../src/index.js";

const SECRET = "whsec_test_vector_secret";
const FIELDS = {
  payment_id: "0199a1b2-0000-7000-8000-000000000001",
  nonce: "n0nce-0123456789abcdef",
  amount: "2500.0",
  currency_code: "MAD",
  account_id: "0199a1b2-0000-7000-8000-000000000002",
} as const;

test("TransferAuthorization signs version v2", () => {
  expect(TransferAuthorization.SIGNATURE_VERSION).toBe("manza.transfer-authorization.v2");
});

describe("TransferAuthorization — external-account payee with a client_reference and a transfer_method", () => {
  const input = TransferAuthorization.signatureInput({
    ...FIELDS,
    payee: TransferAuthorization.payeeFor({
      external_account_id: "0199a1b2-0000-7000-8000-000000000003",
    }),
    client_reference: "po_1",
    transfer_method: "eft",
  });

  test("builds the versioned, pipe-joined signature input with the transfer_method last", () => {
    expect(input).toBe(
      "manza.transfer-authorization.v2|0199a1b2-0000-7000-8000-000000000001|n0nce-0123456789abcdef|" +
        "2500.0|MAD|0199a1b2-0000-7000-8000-000000000002|ext:0199a1b2-0000-7000-8000-000000000003|po_1|eft",
    );
  });

  test("signs it to the shared vector", async () => {
    expect(await TransferAuthorization.sign({ secret: SECRET, signature_input: input })).toBe(
      "904da7d0b73b2c919ffa1ae64d262ce5825ee4d2c8420fd70a3d257353e6c43a",
    );
  });
});

describe("TransferAuthorization — a null transfer_method", () => {
  const input = TransferAuthorization.signatureInput({
    ...FIELDS,
    payee: TransferAuthorization.payeeFor({
      external_account_id: "0199a1b2-0000-7000-8000-000000000003",
    }),
    client_reference: "po_1",
    transfer_method: null,
  });

  test("ends with an empty transfer_method segment", () => {
    expect(input.endsWith("|ext:0199a1b2-0000-7000-8000-000000000003|po_1|")).toBe(true);
  });

  test("signs it to the shared vector", async () => {
    expect(await TransferAuthorization.sign({ secret: SECRET, signature_input: input })).toBe(
      "029dd12924a846d7af2f4aecb61e4f4f9bd64d37315230864fb03917adc29edf",
    );
  });
});

describe("TransferAuthorization — own-account payee without a client_reference or a transfer_method", () => {
  const input = TransferAuthorization.signatureInput({
    ...FIELDS,
    payee: TransferAuthorization.payeeFor({
      destination_account_id: "0199a1b2-0000-7000-8000-000000000004",
    }),
    transfer_method: null,
  });

  test("ends with two empty segments", () => {
    expect(input.endsWith("|own:0199a1b2-0000-7000-8000-000000000004||")).toBe(true);
  });

  test("signs it to the shared vector", async () => {
    expect(await TransferAuthorization.sign({ secret: SECRET, signature_input: input })).toBe(
      "a21ccf43b94f23d7a595a36bd788c27c7adbc5686a5ad4427b22d9957568c9fb",
    );
  });
});

describe("TransferAuthorization.signatureInput", () => {
  test("refuses a non-string amount, which would not match the server's decimal string", () => {
    expect(() =>
      TransferAuthorization.signatureInput({
        ...FIELDS,
        amount: 2500 as unknown as string,
        payee: "ext:x",
        transfer_method: null,
      }),
    ).toThrow(ManzaArgumentError);
  });

  // A v1 call (no transfer_method) fails here, not as a failed signature
  // attempt at the API, where five of them fail the challenge.
  test("requires transfer_method, null included", () => {
    const v1Fields = { ...FIELDS, payee: "ext:x" };
    expect(() =>
      TransferAuthorization.signatureInput(
        v1Fields as unknown as Parameters<typeof TransferAuthorization.signatureInput>[0],
      ),
    ).toThrow(/transfer_method/);
    expect(() =>
      TransferAuthorization.signatureInput(
        v1Fields as unknown as Parameters<typeof TransferAuthorization.signatureInput>[0],
      ),
    ).toThrow(ManzaArgumentError);
  });
});

describe("TransferAuthorization.payeeFor", () => {
  test("refuses both ids at once", () => {
    expect(() =>
      TransferAuthorization.payeeFor({ external_account_id: "a", destination_account_id: "b" }),
    ).toThrow(ManzaArgumentError);
  });

  test("refuses neither id", () => {
    expect(() => TransferAuthorization.payeeFor({})).toThrow(ManzaArgumentError);
  });
});
