// Mirror of spec/zazu/transfer_authorization_spec.rb.
//
// Fixed test vector shared across every SDK in the family — each
// implementation must produce exactly these hex digests from these
// inputs. Compare against:
//
//   printf '%s' '<input>' | openssl dgst -sha256 -hmac 'whsec_test_vector_secret'

import { describe, expect, test } from "bun:test";
import { TransferAuthorization, ZazuArgumentError } from "../src/index.js";

const SECRET = "whsec_test_vector_secret";
const FIELDS = {
  payment_id: "0199a1b2-0000-7000-8000-000000000001",
  nonce: "n0nce-0123456789abcdef",
  amount: "2500.0",
  currency_code: "MAD",
  account_id: "0199a1b2-0000-7000-8000-000000000002",
} as const;

describe("TransferAuthorization — external-account payee with a client_reference", () => {
  const input = TransferAuthorization.signatureInput({
    ...FIELDS,
    payee: TransferAuthorization.payeeFor({
      external_account_id: "0199a1b2-0000-7000-8000-000000000003",
    }),
    client_reference: "po_1",
  });

  test("builds the versioned, pipe-joined signature input", () => {
    expect(input).toBe(
      [
        TransferAuthorization.SIGNATURE_VERSION,
        "0199a1b2-0000-7000-8000-000000000001",
        "n0nce-0123456789abcdef",
        "2500.0",
        "MAD",
        "0199a1b2-0000-7000-8000-000000000002",
        "ext:0199a1b2-0000-7000-8000-000000000003",
        "po_1",
      ].join("|"),
    );
  });

  test("signs it to the shared vector", async () => {
    expect(await TransferAuthorization.sign({ secret: SECRET, signature_input: input })).toBe(
      "6e8eaec0f89a4eb3b22df1133b3d6dfebfa8505c34c58ed0ff192516e4223078",
    );
  });
});

describe("TransferAuthorization — own-account payee without a client_reference", () => {
  const input = TransferAuthorization.signatureInput({
    ...FIELDS,
    payee: TransferAuthorization.payeeFor({
      destination_account_id: "0199a1b2-0000-7000-8000-000000000004",
    }),
  });

  test("ends with an empty client_reference segment", () => {
    expect(input.endsWith("|own:0199a1b2-0000-7000-8000-000000000004|")).toBe(true);
  });

  test("signs it to the shared vector", async () => {
    expect(await TransferAuthorization.sign({ secret: SECRET, signature_input: input })).toBe(
      "af9440b1de1bebb51f381ce43e3d0d27b6a4ccb99dcd548c0b5435ff4fdd1895",
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
      }),
    ).toThrow(ZazuArgumentError);
  });
});

describe("TransferAuthorization.payeeFor", () => {
  test("refuses both ids at once", () => {
    expect(() =>
      TransferAuthorization.payeeFor({ external_account_id: "a", destination_account_id: "b" }),
    ).toThrow(ZazuArgumentError);
  });

  test("refuses neither id", () => {
    expect(() => TransferAuthorization.payeeFor({})).toThrow(ZazuArgumentError);
  });
});
