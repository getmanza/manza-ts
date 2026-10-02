---
description: "Use when CI checks are failing on a PR — fetches failure logs, diagnoses root causes, implements fixes, pushes until CI is green."
model: opus
argument-hint: "PR number (e.g., 1690 or #1690)"
allowed-tools: Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh pr diff:*), Bash(gh api:*), Bash(gh run view:*), Bash(git log:*), Bash(git diff:*), Bash(git push:*), Bash(git commit:*), Bash(git add:*), Bash(bun:*), Read, Write, Edit, Glob, Grep, Agent
---

# Fix GitHub CI Failures: $ARGUMENTS

Diagnose and fix CI failures. Work systematically: identify failures → read logs → diagnose root cause → fix locally → verify → push.

## Phase 0: Determine the PR

Number → PR. `#N` → strip `#`. Empty → current branch (`gh pr view --json number`).

## Phase 1: Inventory failures

```bash
gh pr checks <PR>
```

For each failing check, get the run id and load the failed logs:

```bash
gh run view <run-id> --log-failed
```

Categorize:
- **Test failures** — assertion failed, snapshot mismatch, timeout
- **Lint failures** — Biome rule violation, unused imports
- **Typecheck failures** — `tsc --noEmit` errors
- **Build failures** — `bun build` or `tsc -p tsconfig.build.json` failed
- **Cassette replay failures** — msw rejected an unmatched request
- **Release / publish failures** — npm trusted-publishing OIDC, sigstore
- **Security failures** — `npm audit signatures` or similar

## Phase 2: Diagnose

Read the actual error message, not the surrounding noise. The first stacktrace line that points at our code is usually the culprit.

For each failure:

### Reproduce locally

```bash
# Test
bun test path/to/file.test.ts

# Lint
bun run lint

# Typecheck
bun run typecheck

# Build
bun run build

# Full pipeline
bun run check:all
```

If you can't reproduce locally, the failure is environmental (CI-only):
- Different Node/Bun version → check `.bun-version`, workflow `bun-version`
- Missing dependency → did `bun install --frozen-lockfile` run before the failing step?
- Race condition → re-running the job fixes it
- Network → external service (cassette tarball, npm registry) hiccup
- Secret missing → e.g. trusted-publishing OIDC environment not configured

### Find the root cause

Apply the five-whys ladder until you reach a fix point that prevents the same class of failure recurring. Don't:

- Disable the failing test
- Add a `// biome-ignore` to silence the linter
- Cast away the type error with `as any`
- `npm install` a missing transitive dep instead of fixing your import

These hide the failure; the underlying bug returns elsewhere.

## Phase 3: Fix and verify

### 3.1 Implement the fix

Touch only what the failure cites, plus what the fix requires.

### 3.2 Run the equivalent local check

The CI step that failed has a local equivalent — run it, get green:

| CI step | Local equivalent |
|---|---|
| `bun run typecheck` | `bun run typecheck` |
| `bun run lint` | `bun run lint` |
| `bun test` | `bun test` |
| `bun run build` | `bun run build` |
| `bun run fetch:cassettes` | `bun run fetch:cassettes` |
| Smoke test against staging | requires secrets — skip locally, verify via post-push CI |

### 3.3 Run the full pipeline

```bash
bun run check:all
```

### 3.4 Commit + push

```bash
git add <files>
git commit -m "fix(ci): <what was failing>

<root cause and how this addresses it>"
git push origin <branch>
```

Use `fix:` for prod fixes, `chore(ci):` for workflow / config changes.

## Phase 4: Watch the next run

```bash
gh pr checks <PR> --watch
# or
gh run watch <run-id> --exit-status
```

Track until green. If the same step fails again with a different error, repeat. If it fails the same way, your fix is wrong — revert and rethink.

## Phase 5: Verify and document

```bash
gh pr checks <PR>            # all green
gh pr view <PR> --json mergeable,reviewDecision
```

If the failure was CI-config drift (workflow YAML out of sync with reality), also update relevant docs:
- `.bun-version`
- `package.json` `engines`
- `CLAUDE.md` if a convention changed

## Common patterns and fixes

### Cassette replay says "no handler matched"

The recorded request shape drifted from what the SDK now sends. Either:
- Re-record cassettes via manza-ruby and ship a new SDK version
- Adjust the harness's URL matcher (path-only vs full URL, sorted vs ordered query)

### Trusted-publishing returned 404 from npm

`setup-node`'s `registry-url` wrote `_authToken=` to `.npmrc` and OIDC was skipped. Drop `registry-url`, run `npx npm@latest publish` so OIDC kicks in.

### Provenance signed but publish failed

The trusted-publisher binding on npmjs.com must match `(repo, workflow, environment)` exactly. Check https://www.npmjs.com/package/<pkg>/access.

## Karpathy guidelines

- **Think before coding** — read the actual error, don't pattern-match on the first guess.
- **Goal-driven execution** — the green CI check is the verification.
- **Surgical changes** — fix the failing class of error, not adjacent things.
