# Changelog

All notable changes to `@getzazu/sdk` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
