# Changelog

All notable changes to `@getmanza/sdk` (formerly `@getzazu/sdk`) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-11-14

Mirrors manza-ruby 2.0.0 and replays `cassettes-v2.0.0`: synced to the
Manza API at getmanza/app `906ec486e5` (API version `2026-11-13`). A major
release: see Migrating from 1.x below.

### Removed

- **Breaking:** `manza.invoices.createPaymentLink` (`POST
  /api/invoices/:id/payment_link`). The API retired the endpoint: ask for
  the link with `generate_payment_link: true` on `invoices.create` or
  `invoices.update` instead.
- **Breaking:** the v1 transfer-authorization signer.
  `TransferAuthorization` builds only the v2 input (below).

### Changed

- **Breaking:** `TransferAuthorization.SIGNATURE_VERSION` is
  `manza.transfer-authorization.v2`, and `signatureInput` takes a required
  `transfer_method` (`string | null`), appended after `client_reference`
  (`""` when `null`):
  `manza.transfer-authorization.v2|payment_id|nonce|amount|currency_code|account_id|payee|client_reference|transfer_method`.
  Leaving it out fails to compile, and throws `ManzaArgumentError` from
  plain JavaScript, before anything is sent. The API verifies v2 for
  every request that is unpinned or sends `Manza-Version: 2026-11-13` or
  later; only `2026-03-27` still verifies v1. Pass the payment's
  `transfer_method` as the API returned it.
- The example authorizer (`examples/transfer_authorizer`) records the
  create response's `transfer_method` in its ledger, checks it against the
  webhook's `payment.transfer_method`, signs v2, and compares its input
  with the webhook's `signature_input_v2`. `LedgerEntry` has a required
  `transfer_method`; an entry without one reads as `null`.
- Invoice docs: `account_id` is required on `invoices.create` (without
  one the API answers 422 `state_error`; an account that is not the
  entity's, 422 with `param` `account_id`), and `invoices.update` takes it
  too. An invoice's `status` may be `declined`, and `invoices.delete` also
  takes a `declined` invoice that has no number.

### Added

- `ManzaPlanLimitReachedError`, a `ManzaValidationError` thrown for a 422
  whose `type` is `plan_limit_reached` (a plan cap, which the API used to
  answer with a 500). `kind`, `current` and `max` read the cap from the
  error body.
- `generate_payment_link` on `invoices.create` and `invoices.update`
  (needs the `payment_links:write` scope; taken only while payment links
  are enabled for the entity). Invoice responses carry
  `generate_payment_link` and the embedded `account`.
- `transfer_method` on `payments.create`: `eft` or `rtc` in South Africa,
  `standard` or `instant` in Morocco; one the market does not offer
  rejects with `ManzaValidationError` with `param` `transfer_method`.
  Payment responses carry `transfer_method` (the rail sent, the provider's
  default when left out, `null` where the market offers no choice).
- Documented: the authorization `refusal_reason` `rail_limit_exceeded`
  (status `superseded`): an authorized transfer over its rail's limit at
  execution, sent to the approvers; the authorize call rejects with a 422
  `ManzaValidationError` (`state_error`). A non-boolean
  `generate_payment_link` rejects with `ManzaValidationError` (400).
- Documented: the `payment.authorization_requested` webhook's
  `signature_input_v2` and `payment.transfer_method`, and
  `transferAuthorizer.get()`'s `trust_new_payees` and `new_payee_limit`.

### Fixed (API side, no wire change)

- `accounts.listTransactions` and `accounts.getTransaction` return posted
  movements only (getmanza/app 818432457a); the SDK is unchanged.

### Changed (cassettes)

- The replay tests pin `cassettes-v2.0.0` (was `v1.3.0`). Every cassette
  was re-recorded against staging; the changed or new requests are
  `invoices/create` (with `account_id`, `generate_payment_link: true` and
  new dates), `invoices/create_invalid_generate_payment_link` (new, 400),
  `invoices/create_without_account` (new, 422 `state_error`),
  `invoices/update` (with `account_id` and `generate_payment_link: true`),
  `payments/create` (with `transfer_method: "standard"`) and
  `payments/create_invalid_transfer_method` (new, 422 on
  `transfer_method`). See manza-ruby's CHANGELOG at 2.0.0.

### Migrating from 1.x

- **`createPaymentLink` is gone.** Replace
  `manza.invoices.createPaymentLink(id, { account_id })` with
  `manza.invoices.update(id, { account_id, generate_payment_link: true })`,
  or pass `generate_payment_link: true` on create. `update` resolves to
  the invoice, not a link: the link is made from the invoice's account
  when the invoice is approved, and appears in the invoice's
  `payment_link`. `update` takes only an invoice that is still `draft`,
  `pending_approval` or `declined` (any other rejects with
  `ManzaValidationError`, `state_error`); for an invoice already approved
  or sent, there is no API path to attach a link to it:
  `manza.paymentLinks.create({ account_id, amount, ... })` makes a
  standalone link instead.
- **`account_id` is required on invoice create.** Pass the account the
  invoice is paid into (`manza.accounts.list()`); 1.x calls without it now
  reject with `ManzaValidationError`.
- **v2 signatures only.** Add `transfer_method: payment.transfer_method`
  to every `TransferAuthorization.signatureInput` call, and compare with
  the webhook's `signature_input_v2` instead of `signature_input`. A
  client pinned to `Manza-Version: 2026-03-27` (`apiVersion` or
  `MANZA_API_VERSION`) is verified v1 and must stay on `@getmanza/sdk`
  1.x; unpin it, or pin `2026-11-13`, to move to 2.0.
- **Plan caps.** A `catch` that tests `instanceof ManzaServerError` around
  creates that may hit a plan cap no longer catches it: test
  `instanceof ManzaPlanLimitReachedError` (or its parent
  `ManzaValidationError`), and do not retry it.

## [1.1.0]

Mirrors manza-ruby 1.3.0 (with 1.2.0) and replays `cassettes-v1.3.0`.

### Added

- `Webhook` verifies incoming webhook deliveries: `Webhook.verify` (resolves
  to a boolean), `Webhook.constructEvent` (resolves to the parsed event,
  rejects with `ManzaArgumentError`) and `Webhook.sign`. Reads
  `X-Manza-Signature` / `X-Manza-Timestamp` in any case from a Fetch
  `Headers` or a plain object (Node's `req.headers`), with the legacy
  `X-Zazu-*` names as a fallback; compares in constant time and checks the
  timestamp within 5 minutes (`tolerance: null` skips it, for local replay
  only). Async, on Web Crypto. Passes the shared fixed vector every SDK
  reuses. No new error class.
- `manza.payments` (`Payments`): `create`, `get`, `authorize` and
  `decline` on the API's canonical paths, `POST /api/payments`,
  `GET /api/payments/:id`, `POST /api/payments/:id/authorize` and
  `POST /api/payments/:id/decline`. The API renamed transfer drafts to
  payments; request and response bodies are unchanged, and so is the
  `TransferAuthorization` signature input.
- `manza.transferAuthorizer.get()` (`GET /api/transfer_authorizer`): the
  enrolled authorizer's `status`, `suspension_reason`, limits,
  `daily_authorized_total`, `secret_expires_at` and `webhook_endpoint_id`.
  Rejects with `ManzaNotFoundError` when none is enrolled.
- Documented the new pass-through fields: a draft's `authorization` carries
  `refusal_reason` (status `refused` when it went to the approvers at
  create time), bank accounts carry `trusted`, and the challenge webhook's
  `payment.payee_trusted` says whether the payee was trusted already.
- `examples/transfer_authorizer/`: a runnable two-key transfer authorizer
  on `node:http` (Bun, or Node through `tsx`): `server.ts` verifies the
  webhook, checks a JSON ledger, signs and authorizes (or declines, also
  for a new payee with `ALLOW_NEW_PAYEES=false`) and retries 409
  `authorization_busy`; `create_transfer.ts` prints where the draft was
  routed and why; `preflight.ts` checks what the API shows of each setup
  step, prints the fix for each that fails and warns about what it cannot
  see (key B's scope and IP allowlist, the new-payee option). Not shipped
  in the npm package.
- README: "Machine-authorized transfers" with "Setup, step by step", the
  webhook verifier and the signing snippet.

### Deprecated

- `manza.transferDrafts` and `TransferDrafts`. Both keep working for all of
  1.x: the accessor is `manza.payments` itself and the export names the
  same class, so the old name now calls `/api/payments` too. The server
  keeps `/api/transfer_drafts` as a permanent alias.

### Changed (cassettes)

- The replay tests pin `cassettes-v1.3.0` (was `v1.0.0`). The payment
  cassettes moved from `transfer_drafts/` to `payments/`; the
  `payments/create` and `beneficiaries/create` request bodies changed
  (see manza-ruby's CHANGELOG at 1.2.0 and 1.3.0).

## [1.0.0]

Renamed from Zazu to Manza; the first release under the new name is 1.0.0.

### Changed (breaking)

- Package `@getzazu/sdk` is now `@getmanza/sdk`.
- `Zazu` client is now `Manza`; every `Zazu*Error` is now `Manza*Error`
  (`ZazuError` → `ManzaError`, `ZazuValidationError` → `ManzaValidationError`, …).
- `ZazuResponse` is now `ManzaResponse`.
- The version header is `Manza-Version` (was `Zazu-Version`).
- The User-Agent is `manza-ts/<version>` (was `zazu-ts/<version>`).
- Repository moved to `getmanza/manza-ts`.

### Deprecated

- `ZAZU_API_KEY`, `ZAZU_BASE_URL`, `ZAZU_API_VERSION` and `ZAZU_TIMEOUT_MS` still
  work as a fallback for all of 1.x, with a one-time deprecation warning per
  variable. Use the `MANZA_*` names; the fallback is removed in 2.0.

### Migration guide

| Before | After |
|---|---|
| `bun add @getzazu/sdk` | `bun add @getmanza/sdk` |
| `import { Zazu } from "@getzazu/sdk"` | `import { Manza } from "@getmanza/sdk"` |
| `new Zazu({ apiKey })` | `new Manza({ apiKey })` |
| `err instanceof ZazuValidationError` | `err instanceof ManzaValidationError` |
| `ZAZU_API_KEY` | `MANZA_API_KEY` |
| `ZAZU_BASE_URL` | `MANZA_BASE_URL` |
| `ZAZU_API_VERSION` | `MANZA_API_VERSION` |
| `ZAZU_TIMEOUT_MS` | `MANZA_TIMEOUT_MS` |

## [0.3.0]

Mirrors zazu-ruby v0.3.0. Default `baseUrl` moved to `https://ma.manza.finance`
(production); the South-Africa host is `https://za.manza.finance`.

### Added

- `ZazuConflictError` (10th error class) — 409 responses now surface here, with
  `paymentId` set from `error.payment_id` so a duplicate `client_reference`
  points at the existing draft.
- `transferDrafts.authorize(id, { authorization_id, signature })` and
  `transferDrafts.decline(id, { authorization_id, reason? })`. A blank
  signature raises `ZazuArgumentError` before any HTTP call — the server
  counts a missing one as a failed attempt.
- `TransferAuthorization` namespace (`signatureInput`, `sign`, `payeeFor`,
  `SIGNATURE_VERSION`) for building the versioned, pipe-joined input and
  computing its lowercase-hex HMAC-SHA256. Pure functions, no HTTP.
  Verified against the shared fixed vector in `zazu-ruby`. `sign` is
  **async** (Web Crypto, no `node:crypto` import) so it runs on every
  target runtime — Node 20+, Bun, Deno, browsers, Workers.
- `beneficiaries.create`, `beneficiaries.listExternalAccounts`,
  `beneficiaries.getExternalAccount`, `beneficiaries.createExternalAccount`.
- `payeeTrustRequests` resource — `create({ external_account_ids })` and `get`.
- `transfer_drafts.create` now accepts `client_reference` (unique per entity,
  ≤128 chars).

### Changed

- Default `baseUrl`: `https://zazu.ma` → `https://ma.manza.finance`.
- 400 responses now raise `ZazuValidationError` (previously fell through to
  the base `ZazuError`).

## [0.2.1]

Version alignment: the whole SDK family now releases in lockstep with zazu-ruby. Includes the transferDrafts + beneficiaries resources from 0.2.x.

### Added

- `checkoutSessions` resource — `create` and `get` mirror `Zazu::Resources::CheckoutSessions` in zazu-ruby v0.2.0

## [0.1.0]

Initial release.

### Added

- Runtime-agnostic `Zazu` client built on native `fetch`
- Resource modules: `accounts`, `customers`, `entity`, `invoices`, `paymentLinks`, `webhookEndpoints`
- Cursor-based `Page<T>` with async iterator
- Nine-class error hierarchy mirroring `zazu-ruby`
- Cassette-replay test harness driven by the Ruby SDK's release tarball
