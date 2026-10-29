# @getmanza/sdk

TypeScript SDK for the [Manza API](https://get-manza.com). Runtime-agnostic — runs on Node 20+, Bun, Deno, browsers, and Cloudflare Workers using native `fetch`.

```bash
bun add @getmanza/sdk    # or npm / pnpm / yarn
```

## Quick start

```ts
import { Manza } from "@getmanza/sdk";

const manza = new Manza({ apiKey: process.env.MANZA_API_KEY });

const entity = await manza.entity.get();
console.log(entity.body);

const customers = await manza.customers.list({ q: "Acme" });
for (const c of customers.data) console.log(c);

// Walk every page lazily
for await (const customer of customers.records()) {
  console.log(customer);
}
```

Environment variables `MANZA_API_KEY`, `MANZA_BASE_URL`, `MANZA_API_VERSION`, and `MANZA_TIMEOUT_MS` are read by default (Node/Bun only — browsers must pass options explicitly). The legacy `ZAZU_*` names still work for all of 1.x as a fallback and log a one-time deprecation warning. Upgrading from `@getzazu/sdk`? See the migration guide in [CHANGELOG.md](CHANGELOG.md).

## Resources

```ts
manza.entity.get();

manza.accounts.list({ currency_code: "MAD" });
manza.accounts.get(accountId);
manza.accounts.listTransactions(accountId);
manza.accounts.getTransaction(accountId, transactionId);

manza.customers.list({ q: "Acme" });
manza.customers.get(id);
manza.customers.create({ ... });
manza.customers.update(id, { ... });
manza.customers.delete(id);

manza.invoices.list();
manza.invoices.create({ ... });
// state-transition methods exist but the underlying public API is
// not yet wired up — see getmanza/app issue #2174.

manza.paymentLinks.list();
manza.paymentLinks.create({ ... });
manza.paymentLinks.cancel(id);

manza.webhookEndpoints.list();
manza.webhookEndpoints.create({ url, events: [...] });
manza.webhookEndpoints.test(id);
manza.webhookEndpoints.regenerateSecret(id);
manza.webhookEndpoints.enable(id);
manza.webhookEndpoints.disable(id);

manza.checkoutSessions.create({ account_id, amount, success_url, cancel_url });
manza.checkoutSessions.get(id);

manza.beneficiaries.list();
manza.beneficiaries.get(id);
manza.beneficiaries.create({ beneficiary_type: "individual", person_name: "Jane Doe" });
manza.beneficiaries.listExternalAccounts(beneficiaryId);
manza.beneficiaries.getExternalAccount(beneficiaryId, id); // "trusted": true once a trusted payee
manza.beneficiaries.createExternalAccount(beneficiaryId, { account_number });

manza.payeeTrustRequests.create({ external_account_ids: [id] });
manza.payeeTrustRequests.get(id);

manza.payments.create({ account_id, beneficiary_id, amount: "2500.00", client_reference });
// client_reference is unique per entity; a duplicate raises ManzaConflictError
manza.payments.get(id); // authorization: status, refusal_reason
manza.payments.authorize(id, { authorization_id, signature });
manza.payments.decline(id, { authorization_id, reason });
// manza.transferDrafts is a deprecated alias of manza.payments (same object, /api/payments)

manza.transferAuthorizer.get(); // status, suspension_reason, limits, daily_authorized_total; ManzaNotFoundError: none enrolled
```

## Machine-authorized transfers

A draft inside your entity's authorization envelope (trusted payee, or a new one when you allow it, within limits) is sent to your enrolled authorizer endpoint as a `payment.authorization_requested` webhook carrying an `authorization.id` and a one-time `nonce`. Your system checks it against its own ledger, signs it and authorizes it with a **different API key** from the one that created it. [`examples/transfer_authorizer/`](examples/transfer_authorizer/) runs the whole flow. The [transfer authorization docs](https://ma.manza.finance/docs/api/transfer-authorization) have the full reference.

### Setup, step by step

1. **Feature flags.** Ask support to enable API transfers and transfer authorization (`release_api_webhook_authorization`) on your workspace.
2. **Two API keys.** Key A creates drafts (`transfers:write`; `beneficiaries:request_trust` for step 6; `entity:read`, `accounts:read`, `webhook_endpoints:read` and `beneficiaries:read` for the preflight in step 7). Key B answers the challenges (`transfers:authorize`). The creating key is always refused with 403 `same_key_forbidden`, so keep key B and the signing secret on the system that holds your ledger. Bind key B to an IP allowlist: authorizing from a key without one is refused with 403 `unrestricted_api_key`. Bind key A to one too if you allow new payees (step 6): a draft to a new payee from a key without an allowlist goes to your approvers (`unrestricted_api_key`).
3. **A stable public URL.** Your authorizer needs an HTTPS URL that never changes: an enrolled endpoint's URL is locked. Use a reserved ngrok domain (`ngrok http --url=your-name.ngrok.app 4599`) or a named Cloudflare tunnel (`cloudflared tunnel create`, then `cloudflared tunnel route dns`). Never a free ngrok URL: it changes on every restart.
4. **Create the webhook endpoint** at that URL:

   ```ts
   await manza.webhookEndpoints.create({ url: "https://your-name.ngrok.app/", events: ["transfer.executed"] });
   ```

5. **Enrol it in the app**: Settings → Developer → Transfer approval. Pick the endpoint, the currency and both limits, confirm with your two-factor code, and copy the signing secret: it is shown once. Enrolment is what routes the challenges: `payment.authorization_requested` goes only to the enrolled endpoint and cannot be subscribed to through `events`.
6. **Allow new payees, or trust each payee.** Turn on *Approve transfers to new payees* at enrolment (or later, same page, with your two-factor code) and set the *Limit per transfer to a new payee*. Your authorizer may then approve a transfer to bank details your workspace never trusted, up to that limit, and its signature trusts them: the webhook's `payment.payee_trusted` is `false` for such a transfer. Bank details whose trust was revoked, or that were edited after trusting, still go to your approvers. Without the option, an approver marks the beneficiary's bank account as trusted from the Beneficiaries list, or you ask them to:

   ```ts
   await manza.payeeTrustRequests.create({ external_account_ids: ["01a1..."] });
   ```

   `trusted` on `manza.beneficiaries.getExternalAccount` says which it is. The API does not show whether the option is on.
7. **Run the preflight, then the example** (from `examples/transfer_authorizer/`, after `bun install` at the repository root and filling in `.env`): `bun preflight.ts` checks what the API shows of steps 1–6 and prints a fix for each that fails. What it cannot see, check by hand: that key B is bound to an IP allowlist, and, for a payee not trusted yet, that *Approve transfers to new payees* is on and key A is bound to an IP allowlist too (it warns, it does not fail). Then `bun server.ts` in one terminal, `bun create_transfer.ts` in another (on Node, `npx tsx` in place of `bun`).
8. **Troubleshooting**: a draft that goes to your approvers instead has an `authorization` with a `refusal_reason`: status `refused` when it did not qualify (`create_transfer.ts` prints the reason in words), or `expired` (`expired`), `superseded` (`stale`) or `failed` (`signature_failed`, five invalid signatures) when a challenge was sent and closed without an authorize; `manza.transferAuthorizer.get()` shows a suspension and its `suspension_reason`. An authorize answered 409 `authorization_busy` (a bank-detail edit, trust or trust revocation on the same payee was in flight) is safe to retry. The reasons, and an API error's `type`, are in the [transfer authorization docs](https://ma.manza.finance/docs/api/transfer-authorization).

### Verifying the webhook

Pass the **raw request body**, never re-serialized JSON. `Webhook.constructEvent` reads `X-Manza-Signature` and `X-Manza-Timestamp` (any case, from a Fetch `Headers` or a plain object such as Node's `req.headers`, or the legacy `X-Zazu-*` names), checks the signature in constant time and the timestamp within 5 minutes, and resolves to the parsed event. It rejects with `ManzaArgumentError` otherwise:

```ts
import { ManzaArgumentError, Webhook } from "@getmanza/sdk";

let event: Record<string, unknown>;
try {
  event = await Webhook.constructEvent({ payload: rawBody, headers: req.headers, secret: signingSecret });
} catch (err) {
  if (err instanceof ManzaArgumentError) return reply(401, err.message);
  throw err;
}
```

`Webhook.verify({ payload, signature, timestamp, secret })` resolves to a boolean instead. Both accept `tolerance: null` to skip the timestamp check. Use it only to replay a captured delivery in a local tool or test, never on a live endpoint: without the check, anyone holding a captured delivery can replay it. `Webhook.sign({ payload, timestamp, secret })` signs a delivery for your tests. All three are async: they use the Web Crypto API, so they run on Node, Bun, Deno, browsers and Workers.

### Signing the challenge

Sign the draft from **your own record** of it (not the webhook's `signature_input`, which is there only to compare against) with the endpoint's signing secret:

```ts
import { Manza, TransferAuthorization } from "@getmanza/sdk";

const input = TransferAuthorization.signatureInput({
  payment_id: draft.id,
  nonce: webhook.data.authorization.nonce,
  amount: draft.amount, // The API's decimal string verbatim ("2500.0"), not a number.
  currency_code: draft.currency_code,
  account_id: draft.account_id,
  payee: TransferAuthorization.payeeFor({ external_account_id: draft.external_account_id }),
  client_reference: draft.client_reference,
});

const signature = await TransferAuthorization.sign({
  secret: signingSecret,
  signature_input: input,
});

const authorizer = new Manza({ apiKey: process.env.MANZA_AUTHORIZER_API_KEY });
await authorizer.payments.authorize(draft.id, {
  authorization_id: webhook.data.authorization.id,
  signature,
});
```

`TransferAuthorization.sign` is async for the same Web Crypto reason. A blank signature raises `ManzaArgumentError` locally and is never sent. A wrong one raises `ManzaValidationError` (`type` `invalid_signature`). Five on one challenge send the draft to your in-app approvers; five in a row suspend the authorizer.

## Errors

Ten concrete subclasses; discriminate with `instanceof`.

```ts
import { ManzaValidationError, ManzaRateLimitError, ManzaNotFoundError } from "@getmanza/sdk";

try {
  await manza.customers.create({ ... });
} catch (e) {
  if (e instanceof ManzaValidationError) {
    console.error(e.param, e.body);
  } else if (e instanceof ManzaRateLimitError) {
    console.warn(`Retry after ${e.retryAfter}s`);
  } else if (e instanceof ManzaNotFoundError) {
    /* ... */
  } else {
    throw e;
  }
}
```

## Wire format

Response bodies are returned as-is from the API — `snake_case` keys, no auto-camelCasing. The same shape ships across every Manza SDK (Ruby, TypeScript, Python, ...) so the cassette contract is one-to-one.

## Cassette-replay testing

Tests replay the canonical cassettes recorded by [manza-ruby](https://github.com/getmanza/manza-ruby). The cassettes are downloaded at CI time from the Ruby SDK's release tarball, parsed via `js-yaml`, and replayed with [msw](https://mswjs.io). Same interactions, same assertions, every language.

```bash
bun run fetch:cassettes
bun test
```

## The SDK family

| SDK | Repository | Install |
|---|---|---|
| Ruby (reference implementation, records the cassettes) | [getmanza/manza-ruby](https://github.com/getmanza/manza-ruby) | `gem "manza"` |
| TypeScript / JavaScript | [getmanza/manza-ts](https://github.com/getmanza/manza-ts) (this repo) | `npm install @getmanza/sdk` |
| Python | [getmanza/manza-python](https://github.com/getmanza/manza-python) | `pip install manza` |
| Go | [getmanza/manza-go](https://github.com/getmanza/manza-go) | `go get github.com/getmanza/manza-go` |
| PHP | [getmanza/manza-php](https://github.com/getmanza/manza-php) | `composer require manza/manza-php` |
| Rust | [getmanza/manza-rust](https://github.com/getmanza/manza-rust) | `cargo add manza` |
| Crystal | [getmanza/manza-crystal](https://github.com/getmanza/manza-crystal) | shard `manza` (`github: getmanza/manza-crystal`) |
| Elixir | [getmanza/manza-elixir](https://github.com/getmanza/manza-elixir) | `{:manza, "~> 1.0"}` |
| CLI | [getmanza/cli](https://github.com/getmanza/cli) | `npm install -g @getzazu/cli` or `brew install getmanza/tap/zazu` |

## License

MIT
