// Checks what the API shows of each setup step before you create a transfer,
// says how to fix the ones that fail, and flags what it cannot see:
//
//   bun preflight.ts          # for a 10.00 transfer
//   bun preflight.ts 250.00   # or, on Node: npx tsx preflight.ts 250.00
//
// ✓ passed, ✗ failed (exit status 1), ! cannot be checked through the API.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.js";
import {
  Manza,
  ManzaAuthenticationError,
  ManzaError,
  ManzaForbiddenError,
  ManzaNotFoundError,
} from "./sdk.js";

const SECRET_MIN_DAYS = 7;
// Hosts that hand out a new URL on every restart. An enrolled endpoint's
// URL is locked, so the next restart breaks the authorizer.
const UNSTABLE_TUNNEL_HOSTS = ["ngrok-free.app", "trycloudflare.com"];
const SUSPENSION_FIXES: Readonly<Record<string, string>> = {
  member: "an approver suspended it: resume it in Settings → Developer → Transfer approval",
  signature_failures:
    "five invalid signatures in a row: fix the signing, then an approver resumes it in the app",
  secret_expired:
    "an approver rotates the secret in the app (and resumes it if it stays suspended); " +
    "set the new one as MANZA_AUTHORIZER_SECRET",
  endpoint_disabled:
    "re-enable the webhook endpoint (webhookEndpoints.enable), or enrol a new one if it was " +
    "deleted; if it stays suspended, an approver resumes it in the app",
};

interface Authorizer {
  status: string;
  suspension_reason: string | null;
  currency_code: string;
  per_transfer_limit: string;
  daily_limit: string;
  daily_authorized_total: string;
  secret_expires_at: string;
  webhook_endpoint_id: string;
}

// An exact decimal: digits × 10^-scale. The API's amounts are decimal
// strings, and a float would round them.
interface Decimal {
  units: bigint;
  scale: number;
}

// Plain decimals only: create_transfer.ts sends the string as is, so
// "1/2" or "1e2" must not pass here.
function parseDecimal(value: unknown): Decimal | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return null;
  const fraction = match[2] ?? "";
  return { units: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

function apiDecimal(value: unknown): Decimal {
  const parsed = parseDecimal(value);
  if (!parsed) throw new TypeError(`not a decimal: ${JSON.stringify(value)}`);
  return parsed;
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.units * 10n ** BigInt(scale - a.scale),
    b.units * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

function greaterThan(a: Decimal, b: Decimal): boolean {
  const [x, y] = align(a, b);
  return x > y;
}

function minus(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

function formatAmount(d: Decimal): string {
  return (Number(d.units) / 10 ** d.scale).toFixed(2);
}

export interface PreflightOptions {
  env?: Record<string, string | undefined>;
  amount?: string;
  out?: (line: string) => void;
  now?: Date;
  fetch?: typeof fetch;
}

export class Preflight {
  readonly #env: Record<string, string | undefined>;
  readonly #rawAmount: string;
  readonly #amount: Decimal | null;
  readonly #out: (line: string) => void;
  readonly #now: Date;
  readonly #fetch: typeof fetch | undefined;
  #ok = true;
  #creator: Manza | undefined;
  #authorizerClient: Manza | undefined;

  constructor(options: PreflightOptions = {}) {
    this.#env = options.env ?? process.env;
    this.#rawAmount = options.amount ?? "10.00";
    const amount = parseDecimal(this.#rawAmount);
    this.#amount = amount && amount.units > 0n ? amount : null;
    this.#out = options.out ?? ((line) => console.log(line));
    this.#now = options.now ?? new Date();
    this.#fetch = options.fetch;
  }

  // Prints one line per step; true when no step failed.
  async run(): Promise<boolean> {
    if (!this.#amount) {
      this.#fail(
        `amount ${JSON.stringify(this.#rawAmount)} is not a positive decimal`,
        "pass an amount like 10.00 or 250.00",
      );
    }
    if (!this.#keys()) return this.#ok;

    await this.#creatorReachesEntity();
    const authorizer = await this.#enrolledAuthorizer();
    if (authorizer) {
      await this.#currencyMatches(authorizer);
      // An expired secret already failed the authorizer line, with its fix.
      if (authorizer.suspension_reason !== "secret_expired") this.#secretFresh(authorizer);
    }
    this.#secretSet();
    if (authorizer) {
      await this.#endpointEnabled(authorizer);
      if (this.#amount) this.#amountWithinLimits(authorizer, this.#amount);
    }
    await this.#payeeTrusted();
    return this.#ok;
  }

  // 1. Both keys (and the ids the other steps read) are set, the keys different.
  #keys(): boolean {
    const missing = [
      "MANZA_CREATOR_API_KEY",
      "MANZA_AUTHORIZER_API_KEY",
      "MANZA_ACCOUNT_ID",
      "MANZA_BENEFICIARY_ID",
    ].filter((name) => this.#value(name) === "");
    if (missing.length > 0) {
      this.#fail(`${missing.join(", ")} not set`, "set them in .env");
    } else if (this.#value("MANZA_CREATOR_API_KEY") === this.#value("MANZA_AUTHORIZER_API_KEY")) {
      this.#fail(
        "key A and key B are the same key",
        "use two different keys: the API refuses to let the key that created a transfer authorize it",
      );
    } else {
      this.#pass("key A and key B are set and different");
      return true;
    }
    return false;
  }

  // 2. Key A reaches the API.
  async #creatorReachesEntity(): Promise<void> {
    try {
      const entity = (await this.#creatorClient().entity.get()).body as { name?: unknown };
      this.#pass(`key A reaches the API (entity ${JSON.stringify(entity.name)})`);
    } catch (err) {
      if (!(err instanceof ManzaError)) throw err;
      this.#fail(
        `key A cannot read the entity: ${describe(err)}`,
        keyFix(err, "MANZA_CREATOR_API_KEY", "entity:read"),
      );
    }
  }

  // 3. Key B reads the authorizer, which must be active.
  async #enrolledAuthorizer(): Promise<Authorizer | null> {
    let authorizer: Authorizer;
    try {
      authorizer = (await this.#authorizer().transferAuthorizer.get()).body as Authorizer;
    } catch (err) {
      if (err instanceof ManzaNotFoundError) {
        this.#fail(
          "no transfer authorizer is enrolled",
          "enrol your webhook endpoint in Settings → Developer → Transfer approval",
        );
        return null;
      }
      if (!(err instanceof ManzaError)) throw err;
      this.#fail(
        `key B cannot read the transfer authorizer: ${describe(err)}`,
        keyFix(err, "MANZA_AUTHORIZER_API_KEY", "transfers:authorize"),
      );
      return null;
    }

    if (authorizer.status === "active") {
      this.#pass("transfer authorizer is active");
      // The read also answers transfers:read and transfers:write keys.
      this.#warn(
        "key B can read the authorizer, which does not show it can authorize",
        "check by hand that MANZA_AUTHORIZER_API_KEY has the transfers:authorize scope and an IP allowlist",
      );
    } else {
      const reason = authorizer.suspension_reason ?? "";
      this.#fail(
        `transfer authorizer is ${authorizer.status} (${reason})`,
        Object.hasOwn(SUSPENSION_FIXES, reason)
          ? (SUSPENSION_FIXES[reason] as string)
          : "see suspension_reason in the transfer authorization docs",
      );
    }
    return authorizer;
  }

  async #currencyMatches(authorizer: Authorizer): Promise<void> {
    const accountId = this.#value("MANZA_ACCOUNT_ID");
    let currency: unknown;
    try {
      currency = (
        (await this.#creatorClient().accounts.get(accountId)).body as {
          currency_code?: unknown;
        }
      ).currency_code;
    } catch (err) {
      if (!(err instanceof ManzaError)) throw err;
      this.#fail(
        `key A cannot read account ${JSON.stringify(accountId)}: ${describe(err)}`,
        keyFix(err, "MANZA_CREATOR_API_KEY", "accounts:read", "MANZA_ACCOUNT_ID"),
      );
      return;
    }
    if (currency === authorizer.currency_code) {
      this.#pass(`account currency ${currency} is the enrolled currency`);
      return;
    }
    this.#fail(
      `account currency ${currency} is not the enrolled currency ${authorizer.currency_code}`,
      `pay from a ${authorizer.currency_code} account (MANZA_ACCOUNT_ID), or enrol ${currency}`,
    );
  }

  #secretFresh(authorizer: Authorizer): void {
    const expiresAt = Date.parse(authorizer.secret_expires_at);
    const days = Math.floor((expiresAt - this.#now.getTime()) / 86_400_000);
    if (days >= SECRET_MIN_DAYS) {
      this.#pass(`signing secret expires in ${days} days`);
      return;
    }
    this.#fail(
      `signing secret ${days < 0 ? "expired" : `expires in ${days} days`} (${authorizer.secret_expires_at})`,
      "an approver should rotate the secret in Settings → Developer → Transfer approval; set the new one as " +
        "MANZA_AUTHORIZER_SECRET",
    );
  }

  // 4. The signing secret is set.
  #secretSet(): void {
    if (this.#value("MANZA_AUTHORIZER_SECRET") !== "") {
      this.#pass("MANZA_AUTHORIZER_SECRET is set");
      return;
    }
    this.#fail(
      "MANZA_AUTHORIZER_SECRET is not set",
      "set it to the signing secret shown at enrolment or at the last rotation",
    );
  }

  // 5. The enrolled webhook endpoint is enabled, on a URL that lasts.
  async #endpointEnabled(authorizer: Authorizer): Promise<void> {
    let endpoint: { id?: unknown; url?: unknown; status?: unknown };
    try {
      endpoint = (await this.#creatorClient().webhookEndpoints.get(authorizer.webhook_endpoint_id))
        .body as typeof endpoint;
    } catch (err) {
      if (err instanceof ManzaNotFoundError) {
        this.#fail(
          `the enrolled webhook endpoint ${authorizer.webhook_endpoint_id} was deleted`,
          "create an endpoint at a stable URL and enrol it in Settings → Developer → Transfer approval",
        );
        return;
      }
      if (!(err instanceof ManzaError)) throw err;
      this.#fail(
        `key A cannot read the enrolled webhook endpoint: ${describe(err)}`,
        keyFix(err, "MANZA_CREATOR_API_KEY", "webhook_endpoints:read"),
      );
      return;
    }

    if (endpoint.status === "active") {
      this.#pass(`webhook endpoint ${endpoint.url} is enabled`);
    } else {
      this.#fail(
        `webhook endpoint ${endpoint.url} is ${endpoint.status}`,
        `enable it (webhookEndpoints.enable(${JSON.stringify(endpoint.id)})); if the authorizer stays suspended, ` +
          "an approver resumes it in the app",
      );
    }
    const host = hostOf(endpoint.url);
    const unstable = UNSTABLE_TUNNEL_HOSTS.find(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    if (!unstable) return;

    this.#warn(
      `webhook endpoint is on ${unstable}, whose URL changes when the tunnel restarts`,
      "use a reserved domain or a named tunnel, then enrol an endpoint at that URL",
    );
  }

  // 6a. The test amount fits both limits.
  #amountWithinLimits(authorizer: Authorizer, amount: Decimal): void {
    const perTransfer = apiDecimal(authorizer.per_transfer_limit);
    const room = minus(
      apiDecimal(authorizer.daily_limit),
      apiDecimal(authorizer.daily_authorized_total),
    );
    if (greaterThan(amount, perTransfer)) {
      this.#fail(
        `${formatAmount(amount)} is over the limit per transfer (${formatAmount(perTransfer)})`,
        `send at most ${formatAmount(perTransfer)}, or have an approver raise the limit`,
      );
    } else if (greaterThan(amount, room)) {
      this.#fail(
        `${formatAmount(amount)} does not fit the last 24 hours' room (${formatAmount(room)} left)`,
        "wait for older authorizations to leave the 24-hour window, or have an approver raise the limit",
      );
    } else {
      this.#pass(`${formatAmount(amount)} is within the limit per transfer and the 24-hour room`);
    }
  }

  // 6b. The payee is trusted, or may be trusted on authorize.
  async #payeeTrusted(): Promise<void> {
    const beneficiaryId = this.#value("MANZA_BENEFICIARY_ID");
    let beneficiary: { external_accounts?: { id: string; default?: boolean; trusted?: boolean }[] };
    try {
      beneficiary = (await this.#creatorClient().beneficiaries.get(beneficiaryId))
        .body as typeof beneficiary;
    } catch (err) {
      if (!(err instanceof ManzaError)) throw err;
      this.#fail(
        `key A cannot read beneficiary ${JSON.stringify(beneficiaryId)}: ${describe(err)}`,
        keyFix(err, "MANZA_CREATOR_API_KEY", "beneficiaries:read", "MANZA_BENEFICIARY_ID"),
      );
      return;
    }

    const account = (beneficiary.external_accounts ?? []).find((a) => a.default);
    if (!account) {
      this.#fail(
        "beneficiary has no default bank account",
        "add one, or set a beneficiary that has one",
      );
      return;
    }
    if (account.trusted) {
      this.#pass(`payee ${account.id} is trusted`);
      return;
    }

    this.#warn(
      `payee ${account.id} is not trusted yet`,
      'it qualifies only with "Approve transfers to new payees" on in Settings → Developer → Transfer approval ' +
        "(not visible through the API), key A bound to an IP allowlist, and the amount within the limit per " +
        "transfer to a new payee, and only if its bank details were never trusted (revoked or edited " +
        "details always go to your approvers); otherwise have an approver trust it",
    );
  }

  #creatorClient(): Manza {
    this.#creator ??= this.#client("MANZA_CREATOR_API_KEY");
    return this.#creator;
  }

  #authorizer(): Manza {
    this.#authorizerClient ??= this.#client("MANZA_AUTHORIZER_API_KEY");
    return this.#authorizerClient;
  }

  #client(keyVar: string): Manza {
    const baseUrl = this.#value("MANZA_BASE_URL");
    return new Manza({
      apiKey: this.#value(keyVar),
      baseUrl: baseUrl === "" ? "https://ma.manza.finance" : baseUrl,
      ...(this.#fetch ? { fetch: this.#fetch } : {}),
    });
  }

  #value(name: string): string {
    return String(this.#env[name] ?? "");
  }

  #pass(message: string): void {
    this.#out(`✓ ${message}`);
  }

  #fail(message: string, fix: string): void {
    this.#ok = false;
    this.#out(`✗ ${message}: ${fix}`);
  }

  #warn(message: string, note: string): void {
    this.#out(`! ${message}: ${note}`);
  }
}

function describe(error: ManzaError): string {
  const kind = error.type ?? error.status; // neither on a connection failure
  return `${error.name}${kind === undefined || kind === null ? "" : ` ${kind}`}: ${error.message}`;
}

function keyFix(error: ManzaError, keyVar: string, scope: string, idVar?: string): string {
  if (error instanceof ManzaAuthenticationError)
    return `check ${keyVar}: the key is wrong or revoked`;
  if (error instanceof ManzaForbiddenError) {
    return `give the key the ${scope} scope, or add this machine's address to its IP allowlist`;
  }
  if (error instanceof ManzaNotFoundError) return `check ${idVar ?? "MANZA_BASE_URL"}`;
  return "check MANZA_BASE_URL and the network, then rerun";
}

function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return "";
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  loadEnv();
  const ok = await new Preflight({ amount: process.argv[2] ?? "10.00" }).run();
  // exitCode, not exit(): let stdout drain into a pipe first.
  process.exitCode = ok ? 0 : 1;
}
