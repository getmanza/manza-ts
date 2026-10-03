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
manza.beneficiaries.getExternalAccount(beneficiaryId, id);
manza.beneficiaries.createExternalAccount(beneficiaryId, { account_number });

manza.transferDrafts.create({ account_id, beneficiary_id, amount: "150.00", client_reference });
manza.transferDrafts.get(id);
manza.transferDrafts.authorize(id, { authorization_id, signature });
manza.transferDrafts.decline(id, { authorization_id, reason });

manza.payeeTrustRequests.create({ external_account_ids: [id] });
manza.payeeTrustRequests.get(id);
```

## Transfer authorization

The `payment.authorization_requested` webhook delivers an `authorization_id` and a one-time `nonce`. Build the signature input from your own record of the draft (not the webhook's `signature_input`, which is there only to compare against), sign it with the authorizer endpoint's signing secret, and pass the result to `transferDrafts.authorize`.

```ts
import { Manza, TransferAuthorization } from "@getmanza/sdk";

const input = TransferAuthorization.signatureInput({
  payment_id: draft.id,
  nonce,
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

await manza.transferDrafts.authorize(draft.id, {
  authorization_id: authorizationId,
  signature,
});
```

`TransferAuthorization.sign` is async — it uses the Web Crypto API so it works on Node, Bun, Deno, browsers, and Workers without a `node:crypto` import.

Use a key other than the one that created the draft — otherwise 403 `same_key_forbidden`. A blank signature raises `ManzaArgumentError` locally; the server counts a missing one as a failed attempt, and five fail the challenge.

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
| CLI | [getmanza/cli](https://github.com/getmanza/cli) | `npm install -g @getzazu/cli` or `brew install getzazu/tap/zazu` |

## License

MIT
