// The creator process (key A). Creates a transfer draft, writes it to the
// ledger from the API's response, and says where the API routed it.
//
//   bun create_transfer.ts          # 10.00
//   bun create_transfer.ts 250.00   # or, on Node: npx tsx create_transfer.ts 250.00

import { join } from "node:path";
import { HERE, loadEnv } from "./env.js";
import { Ledger } from "./ledger.js";
import { type Authorization, describeRouting } from "./routing.js";
import { Manza, ManzaArgumentError, ManzaError, TransferAuthorization } from "./sdk.js";

interface Draft {
  id: string;
  amount: string;
  currency_code: string;
  account_id: string;
  external_account_id: string | null;
  destination_account_id: string | null;
  authorization: Authorization | null;
}

function abort(message: string): never {
  console.error(message);
  process.exit(1);
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) abort(`Set ${name} in .env`);
  return value;
}

const show = (value: unknown): string => JSON.stringify(value) ?? "undefined";

loadEnv();

const amount = process.argv[2] ?? "10.00";
const random = crypto.getRandomValues(new Uint8Array(6));
const clientReference = `example-${[...random].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
const ledger = new Ledger(join(HERE, "ledger.json"));
const creator = new Manza({ apiKey: env("MANZA_CREATOR_API_KEY") });

let draft: Draft;
try {
  const response = await creator.payments.create({
    account_id: env("MANZA_ACCOUNT_ID"),
    beneficiary_id: env("MANZA_BENEFICIARY_ID"),
    amount,
    payment_reference: "Transfer authorizer example",
    client_reference: clientReference,
  });
  draft = response.body as Draft;
} catch (err) {
  if (!(err instanceof ManzaError)) throw err;
  // A timeout may still have created the draft: look for this client_reference
  // in the app before rerunning, or the rerun creates a second transfer.
  abort(
    `create failed for client_reference ${clientReference}: ${err.name}: ${err.message} ` +
      `(type ${show(err.type)}, request_id ${show(err.requestId)})`,
  );
}

let payee: string;
try {
  payee = TransferAuthorization.payeeFor({
    external_account_id: draft.destination_account_id ? null : draft.external_account_id,
    destination_account_id: draft.destination_account_id,
  });
} catch (err) {
  if (!(err instanceof ManzaArgumentError)) throw err;
  abort(
    `payment ${draft.id} names neither an external_account_id nor a destination_account_id, so it was not ` +
      "written to the ledger: if it reaches the authorizer, the authorizer declines it",
  );
}

try {
  ledger.record(clientReference, {
    payment_id: draft.id,
    amount: draft.amount,
    currency_code: draft.currency_code,
    account_id: draft.account_id,
    payee,
  });
} catch (err) {
  abort(
    `payment ${draft.id} (client_reference ${clientReference}) was created but not written to the ledger ` +
      `(${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}): if it reaches the authorizer, the authorizer declines it`,
  );
}
console.log(
  `created payment ${draft.id}: ${draft.amount} ${draft.currency_code} to ${payee} (client_reference ${clientReference})`,
);

console.log(describeRouting(draft.authorization));
