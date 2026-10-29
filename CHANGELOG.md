# Changelog

All notable changes to `@getmanza/sdk` (formerly `@getzazu/sdk`) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  routed and why; `preflight.ts` checks every setup step and prints the
  fix. Not shipped in the npm package.
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
