// Mirrors lib/manza/transfer_authorization.rb. Pure functions — no HTTP.
//
// The `payment.authorization_requested` webhook delivers the
// authorization id and a one-time nonce. Build the signature input
// from your own record of the transfer (not the webhook's
// signature_input_v2, which is there only to compare against), sign it
// with the authorizer endpoint's signing secret, and pass the result
// to Payments#authorize.
//
// This is the v2 input, which the API verifies for every request that
// is unpinned or sends `Manza-Version: 2026-11-13` or later. A client
// pinned to `Manza-Version: 2026-03-27` must sign v1 and stays on
// @getmanza/sdk 1.x.

import { ManzaArgumentError } from "./errors.js";

export const SIGNATURE_VERSION = "manza.transfer-authorization.v2";

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
  // The payment's rail as the API stores it (the create response's
  // `transfer_method`): required, and null (signed as an empty segment)
  // where the market offers no choice.
  transfer_method: string | null;
}

export interface PayeeForParams {
  external_account_id?: string | null | undefined;
  destination_account_id?: string | null | undefined;
}

export function signatureInput(fields: SignatureInputFields): string {
  if (typeof fields.amount !== "string") {
    throw new ManzaArgumentError(
      `amount must be the API's decimal string (got ${JSON.stringify(fields.amount)})`,
    );
  }
  // A v1 call fails here rather than as a failed signature at the API,
  // where five of them fail the challenge.
  if (fields.transfer_method === undefined) {
    throw new ManzaArgumentError(
      "transfer_method is required (null where the market offers no choice)",
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
    fields.transfer_method ?? "",
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
    throw new ManzaArgumentError(
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
