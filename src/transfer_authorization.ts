// Mirrors lib/zazu/transfer_authorization.rb. Pure functions — no HTTP.
//
// The `payment.authorization_requested` webhook delivers the
// authorization id and a one-time nonce. Build the signature input
// from your own record of the transfer (not the webhook's
// signature_input, which is there only to compare against), sign it
// with the authorizer endpoint's signing secret, and pass the result
// to TransferDrafts#authorize.

import { ZazuArgumentError } from "./errors.js";

export const SIGNATURE_VERSION = "manza.transfer-authorization.v1";

export interface SignatureInputFields {
  payment_id: string;
  nonce: string;
  // The API's decimal string verbatim (e.g. "2500.0"). Not a number —
  // the server signs the string form, so a Number here would drift.
  amount: string;
  currency_code: string;
  account_id: string;
  payee: string;
  client_reference?: string | null | undefined;
}

export interface PayeeForParams {
  external_account_id?: string | null | undefined;
  destination_account_id?: string | null | undefined;
}

export function signatureInput(fields: SignatureInputFields): string {
  if (typeof fields.amount !== "string") {
    throw new ZazuArgumentError(
      `amount must be the API's decimal string (got ${JSON.stringify(fields.amount)})`,
    );
  }
  return [
    SIGNATURE_VERSION,
    fields.payment_id,
    fields.nonce,
    fields.amount,
    fields.currency_code,
    fields.account_id,
    fields.payee,
    fields.client_reference ?? "",
  ].join("|");
}

// Web Crypto HMAC-SHA256 → lowercase hex. Available on Node 20+, Bun,
// Deno, browsers, and Workers; no `node:crypto` import keeps the
// bundle runtime-agnostic.
export async function sign(params: { secret: string; signature_input: string }): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(params.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(params.signature_input));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function payeeFor(params: PayeeForParams): string {
  const ext = params.external_account_id ?? null;
  const own = params.destination_account_id ?? null;
  if ((ext === null) === (own === null)) {
    throw new ZazuArgumentError(
      "pass exactly one of external_account_id or destination_account_id",
    );
  }
  return own !== null ? `own:${own}` : `ext:${ext}`;
}

export const TransferAuthorization = {
  SIGNATURE_VERSION,
  signatureInput,
  sign,
  payeeFor,
} as const;
