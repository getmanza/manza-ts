# @getzazu/sdk

TypeScript SDK for the [Zazu API](https://zazu.ma). Runtime-agnostic — runs on Node 20+, Bun, Deno, browsers, and Cloudflare Workers using native `fetch`.

```bash
bun add @getzazu/sdk    # or npm / pnpm / yarn
```

## Quick start

```ts
import { Zazu } from "@getzazu/sdk";

const zazu = new Zazu({ apiKey: process.env.ZAZU_API_KEY });

const entity = await zazu.entity.get();
console.log(entity.body);

const customers = await zazu.customers.list({ q: "Acme" });
for (const c of customers.data) console.log(c);

// Walk every page lazily
for await (const customer of customers.records()) {
  console.log(customer);
}
```

Environment variables `ZAZU_API_KEY`, `ZAZU_BASE_URL`, `ZAZU_API_VERSION`, and `ZAZU_TIMEOUT_MS` are read by default (Node/Bun only — browsers must pass options explicitly).

## Resources

```ts
zazu.entity.get();

zazu.accounts.list({ currency_code: "MAD" });
zazu.accounts.get(accountId);
zazu.accounts.listTransactions(accountId);
zazu.accounts.getTransaction(accountId, transactionId);

zazu.customers.list({ q: "Acme" });
zazu.customers.get(id);
zazu.customers.create({ ... });
zazu.customers.update(id, { ... });
zazu.customers.delete(id);

zazu.invoices.list();
zazu.invoices.create({ ... });
// state-transition methods exist but the underlying public API is
// not yet wired up — see zazu/app issue #2174.

zazu.paymentLinks.list();
zazu.paymentLinks.create({ ... });
zazu.paymentLinks.cancel(id);

zazu.webhookEndpoints.list();
zazu.webhookEndpoints.create({ url, events: [...] });
zazu.webhookEndpoints.test(id);
zazu.webhookEndpoints.regenerateSecret(id);
zazu.webhookEndpoints.enable(id);
zazu.webhookEndpoints.disable(id);

zazu.checkoutSessions.create({ account_id, amount, success_url, cancel_url });
zazu.checkoutSessions.get(id);

zazu.beneficiaries.list();
zazu.beneficiaries.get(id);
zazu.beneficiaries.create({ beneficiary_type: "individual", person_name: "Jane Doe" });
zazu.beneficiaries.listExternalAccounts(beneficiaryId);
zazu.beneficiaries.getExternalAccount(beneficiaryId, id);
zazu.beneficiaries.createExternalAccount(beneficiaryId, { account_number });

zazu.transferDrafts.create({ account_id, beneficiary_id, amount: "150.00", client_reference });
zazu.transferDrafts.get(id);
zazu.transferDrafts.authorize(id, { authorization_id, signature });
zazu.transferDrafts.decline(id, { authorization_id, reason });

zazu.payeeTrustRequests.create({ external_account_ids: [id] });
zazu.payeeTrustRequests.get(id);
```

## Transfer authorization

The `payment.authorization_requested` webhook delivers an `authorization_id` and a one-time `nonce`. Build the signature input from your own record of the draft (not the webhook's `signature_input`, which is there only to compare against), sign it with the authorizer endpoint's signing secret, and pass the result to `transferDrafts.authorize`.

```ts
import { Zazu, TransferAuthorization } from "@getzazu/sdk";

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

await zazu.transferDrafts.authorize(draft.id, {
  authorization_id: authorizationId,
  signature,
});
```

`TransferAuthorization.sign` is async — it uses the Web Crypto API so it works on Node, Bun, Deno, browsers, and Workers without a `node:crypto` import.

Use a key other than the one that created the draft — otherwise 403 `same_key_forbidden`. A blank signature raises `ZazuArgumentError` locally; the server counts a missing one as a failed attempt, and five fail the challenge.

## Errors

Ten concrete subclasses; discriminate with `instanceof`.

```ts
import { ZazuValidationError, ZazuRateLimitError, ZazuNotFoundError } from "@getzazu/sdk";

try {
  await zazu.customers.create({ ... });
} catch (e) {
  if (e instanceof ZazuValidationError) {
    console.error(e.param, e.body);
  } else if (e instanceof ZazuRateLimitError) {
    console.warn(`Retry after ${e.retryAfter}s`);
  } else if (e instanceof ZazuNotFoundError) {
    /* ... */
  } else {
    throw e;
  }
}
```

## Wire format

Response bodies are returned as-is from the API — `snake_case` keys, no auto-camelCasing. The same shape ships across every Zazu SDK (Ruby, TypeScript, Python, ...) so the cassette contract is one-to-one.

## Cassette-replay testing

Tests replay the canonical cassettes recorded by [zazu-ruby](https://github.com/getzazu/zazu-ruby). The cassettes are downloaded at CI time from the Ruby SDK's release tarball, parsed via `js-yaml`, and replayed with [msw](https://mswjs.io). Same interactions, same assertions, every language.

```bash
bun run fetch:cassettes
bun test
```

## Sibling SDKs

- [zazu-ruby](https://github.com/getzazu/zazu-ruby) — reference implementation (records the cassettes)
- zazu-python, zazu-php, zazu-go, zazu-crystal, zazu-elixir — coming up

## License

MIT
