# @getmanza/sdk

TypeScript SDK for the Manza API. Runtime-agnostic — runs on Node 20+, Bun, Deno, browsers, and Cloudflare Workers using native `fetch`.

## Stack

| Concern | Tool | Notes |
|---|---|---|
| Language | TypeScript 5.x, strict + `exactOptionalPropertyTypes` | `tsconfig.json` |
| Build / package mgmt / test runner | Bun 1.3+ | `bun build`, `bun test`, `bun install` |
| Lint + format | Biome 2.x | `biome.json`. Replaces eslint + prettier |
| Type-check | `tsc --noEmit` | Bun doesn't do this; we keep tsc for it |
| HTTP | Native `fetch` + `AbortController` | No undici / node-fetch fallback |
| Cassette replay (tests) | msw + `js-yaml` | Reads manza-ruby's release tarball |
| Release | `bin/release` | manza SDK release kit (byte-identical across SDK repos; repo-specific bits in `scripts/version` + `scripts/release-check`); OIDC trusted publishing |

## Public API surface

Mirrors `manza-ruby` one-to-one:

- `Manza` client, ten resources: `accounts`, `beneficiaries`, `checkoutSessions`, `customers`, `entity`, `invoices`, `payeeTrustRequests`, `paymentLinks`, `transferDrafts`, `webhookEndpoints`
- Cursor-based `Page<T>` with async iterator (`page.records()`)
- 10-class `ManzaError` hierarchy — discriminate via `instanceof`, never status-code matching
- Wire-format response bodies are returned as-is (snake_case keys). **No auto-camelCasing.**

## How to work in this codebase

1. **Tests come first.** Every change to `src/` ships with a test. Cassette-replay tests are the contract — they enforce the same wire-format across Ruby, TS, and future SDKs.
2. **Use the SDK's primitives.** `Page<T>`, `ManzaError` subclasses, `fixture_id()` helper. Don't hand-roll fetch loops or parse `error.message`.
3. **Snake-case stays.** Response keys are wire-format. We don't camelCase them on the way out.
4. **Lint must be green.** `bun run lint` runs Biome with `--error-on-warnings`. Don't add `// biome-ignore` to silence — fix the issue.

## Critical rules

- **Bun for tooling, not Node.** Local dev, CI, build, test — all Bun. Node is supported as a *runtime* target for the published package, not as a dev dependency.
- **`bun run check:all` before every commit.** Runs typecheck + lint + test. CI runs the same commands.
- **No long-lived `NPM_TOKEN`.** Releases publish via npm OIDC trusted publishing through the `release` GitHub environment. Verify the binding on https://www.npmjs.com/package/@getmanza/sdk/access if it ever drifts.
- **Cassettes come from manza-ruby.** `bun run fetch:cassettes` downloads the tarball. The Ruby SDK records, every other SDK replays.
- **Snake-case wire format.** API request/response bodies use snake_case. Don't transform them.
- **No new error classes without updating manza-ruby.** The 10-class hierarchy is shared across SDKs. Adding to it means coordinating both repos.
- **Never escape backticks in PR bodies.** With `<<'EOF'` (single-quoted heredoc) the shell passes everything through verbatim — typing `` \` `` produces literal `` \` `` in the rendered PR. See "PR descriptions" below.

## PR descriptions

Write PR description bodies in plain Markdown. **Do not escape backticks** with `` \` `` — GitHub renders `` \` `` literally as a backslash followed by a backtick, producing output like `` \`Page<T>\` `` instead of the monospace `Page<T>` the reader expects.

The usual cause is writing the description inside a bash heredoc (`gh pr create --body "$(cat <<'EOF' ... EOF)"`) and then reflexively escaping every backtick because of shell-quoting muscle memory. With `<<'EOF'` (single-quoted delimiter) the shell does NOT interpret anything inside the heredoc — backticks, dollars, and backslashes all pass through verbatim. So write them exactly as you want them rendered:

```bash
# Good — renders as `Page<T>` in monospace
gh pr create --body "$(cat <<'EOF'
Uses the `Page<T>` helper.
EOF
)"

# Bad — renders as \`Page<T>\` literally in the PR body
gh pr create --body "$(cat <<'EOF'
Uses the \`Page<T>\` helper.
EOF
)"
```

Same rule for code blocks — write triple-backticks unescaped. The single-quoted heredoc delimiter is doing all the shell-escaping work. If you find yourself typing `` \` `` inside a PR body, stop and remove the backslash.

## Striving for excellence

These are the Karpathy guidelines we apply on every change. They reduce common LLM coding mistakes.

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Senior engineer test: would they call this overcomplicated?

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that *your* changes orphaned. Don't remove pre-existing dead code unless asked.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan with verification at each step.

## Development workflow

```bash
# One-time setup
bun install
bun run fetch:cassettes

# Daily loop
bun test path/to/file.test.ts    # while iterating
bun run check:all                # before commit (typecheck + lint + test)
bun run lint:fix                 # auto-apply Biome safe fixes

# Build verification
bun run build                    # produces dist/index.js (ESM), .cjs, .d.ts

# Release (after PR merge, from a clean, up-to-date main)
bin/release list        # last releases + what patch/minor/major would give
bin/release --dry-run   # version + changes since the last tag, publishes nothing
bin/release minor       # or patch (default), major, an explicit 0.3.0; --force re-creates
# → bumps package.json + src/version.ts, runs check:all, pushes main, publishes the GH release
# → release.yml workflow handles npm publish + sigstore attestation
```

## Models

Sessions run on `opus` (Opus 5.5) with `fable` (Fable 5.1) as the advisor (`.claude/settings.json`). Fable is spent where judgment matters most: plans are written on Fable, the advisor is consulted at decision points (before choosing an approach, a schema or public API, a migration, a dependency, anything irreversible, and when a failure repeats), and the `fable-validator` agent checks every finished implementation before its pull request opens (`/lfg`, Phase 6.5). Commands pin their tier by alias, never by full model ID: `opus` for orchestration, security, full PR review, payments and production debugging; `sonnet` for the implementation specialists and TDD; `haiku` for mechanical scans. Every spawned agent names its `model:`; one that does not runs on `sonnet` (`CLAUDE_CODE_SUBAGENT_MODEL`), never on the session's model. Plan mode cannot take a model of its own: it runs on Opus and asks the advisor.

## Slash commands

These live in `.claude/commands/` and are available in any Claude Code session:

| Command | When |
|---|---|
| `/lfg <issue or feature>` | Full autonomous workflow with TDD + verification |
| `/github-review-pr <PR#>` | Full PR review pass — failures first, then comments |
| `/github-review-failures <PR#>` | Just fix CI failures on a PR |
| `/github-review-comments <PR#>` | Just respond to reviewer comments on a PR |
| `/coderabbit-review <PR#>` | Specifically address CodeRabbit findings (verify, fix valid, push back on stale/wrong) |

## Cross-SDK contract

`manza-ruby` is the reference implementation:

- Records cassettes against `staging.manza.ma`
- Ships them as a release tarball (`cassettes-vX.Y.Z.tar.gz`) on each version
- All other SDKs (`manza-ts`, future `manza-python`, `manza-go`, `manza-php`, `manza-crystal`, `manza-elixir`, `manza-rust`) replay these cassettes in their own test harness

If the contract breaks (e.g., new request shape), it's a coordinated change across at least two repos: manza-ruby and manza-ts.

## Repository links

- Ruby SDK (reference): https://github.com/getmanza/manza-ruby
- This repo: https://github.com/getmanza/manza-ts
- npm package: https://www.npmjs.com/package/@getmanza/sdk
- CLI consumer: https://github.com/getmanza/cli
