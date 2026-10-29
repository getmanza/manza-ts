// A request handler that answers `payment.authorization_requested`
// webhooks with key B (the authorizer key):
//
//   1. Verify the delivery (401 when the signature or timestamp is bad).
//   2. Find the draft in your own ledger by its client_reference.
//   3. Missing or different from what you created → decline with a reason.
//   4. A payee not trusted yet (`payee_trusted: false`, only with "Approve
//      transfers to new payees" on) is trusted by the authorize, unless
//      `allowNewPayees: false` (ALLOW_NEW_PAYEES=false) declines it.
//   5. Otherwise sign the challenge from the ledger and authorize it.
//
// It answers 200 first and does steps 2-5 on the executor (after the
// response by default): the delivery has a timeout, and a retried
// webhook is safe because authorize replays idempotently.
//
// Framework-free: server.ts wires it to node:http; README.md shows Express.

import type { LedgerEntry } from "./ledger.js";
import {
  type Manza,
  ManzaArgumentError,
  ManzaConflictError,
  ManzaConnectionError,
  ManzaError,
  ManzaRateLimitError,
  ManzaServerError,
  TransferAuthorization,
  Webhook,
  type WebhookHeaders,
} from "./sdk.js";

export const EVENT = "payment.authorization_requested";

// Ledger field → webhook `data.payment` field. All must match.
const CHECKED_FIELDS = [
  ["payment_id", "id"],
  ["amount", "amount"],
  ["currency_code", "currency_code"],
  ["account_id", "account_id"],
  ["payee", "payee"],
] as const;

// Failures worth another try: the API did not answer, asked us to slow
// down, or was busy with a bank-detail edit, trust or revocation on the
// same payee (409 `authorization_busy`). Authorize and decline replay
// idempotently, so a retry is safe.
const TRANSIENT_ERRORS = [ManzaServerError, ManzaConnectionError, ManzaRateLimitError];
const BUSY = "authorization_busy";
const ATTEMPTS = 3;
const MAX_RETRY_AFTER_S = 30; // a challenge expires, so never wait long

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export type Executor = (job: () => Promise<void>) => void;

export interface AuthorizerOptions {
  client: Manza;
  secret: string;
  ledger: { find(clientReference: string): LedgerEntry | null };
  executor?: Executor;
  logger?: Logger;
  // How long to wait for the ledger entry: the webhook can arrive before
  // create_transfer.ts has written it from the create response.
  ledgerWaitMs?: number;
  // Base delay between attempts.
  retryDelayMs?: number;
  // false declines transfers to payees not trusted yet.
  allowNewPayees?: boolean;
}

export interface AuthorizerResponse {
  status: number;
  body: string;
}

export type AuthorizerHandler = (
  rawBody: string,
  headers: WebhookHeaders,
) => Promise<AuthorizerResponse>;

interface Payment {
  id: string;
  amount: string;
  currency_code: string;
  account_id: string;
  payee: string;
  client_reference: string;
  payee_trusted?: boolean | null;
  [field: string]: unknown;
}

interface ChallengeData {
  payment: Payment;
  authorization: { id: string; nonce: string };
  signature_input: string;
}

const consoleLogger: Logger = {
  info: (m) => console.log(`${new Date().toISOString()} INFO ${m}`),
  warn: (m) => console.warn(`${new Date().toISOString()} WARN ${m}`),
  error: (m) => console.error(`${new Date().toISOString()} ERROR ${m}`),
};

const show = (value: unknown): string => JSON.stringify(value) ?? "undefined";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAuthorizer(options: AuthorizerOptions): AuthorizerHandler {
  const { client, secret, ledger } = options;
  const executor: Executor =
    options.executor ??
    ((job) => {
      setTimeout(() => void job(), 0);
    });
  const logger = options.logger ?? consoleLogger;
  const ledgerWaitMs = options.ledgerWaitMs ?? 10_000;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  const allowNewPayees = options.allowNewPayees ?? true;

  const respond = (status: number): AuthorizerResponse => ({
    status,
    body: status === 200 ? "ok" : "unauthorized",
  });

  async function verify(rawBody: string, headers: WebhookHeaders) {
    try {
      const event = await Webhook.constructEvent({ payload: rawBody, headers, secret });
      logger.info(`received ${event.event} (${event.event_id}), signature verified`);
      return event;
    } catch (err) {
      if (!(err instanceof ManzaArgumentError)) throw err;
      logger.warn(`rejected a delivery: ${err.message}`);
      return null;
    }
  }

  async function answer(data: ChallengeData): Promise<void> {
    try {
      const { payment, authorization } = data;
      if (!payment || !authorization)
        throw new TypeError("data.payment or data.authorization missing");
      const clientReference = payment.client_reference;
      const entry = await waitForEntry(clientReference);

      const mismatch = entry
        ? mismatchReason(entry, payment)
        : `client_reference ${show(clientReference)} is not in the ledger`;
      if (mismatch) return await decline(payment.id, authorization.id, mismatch);

      // Anything but true counts as new, so a webhook without the field is
      // declined under ALLOW_NEW_PAYEES=false rather than trusted blindly.
      if (payment.payee_trusted !== true) {
        if (!allowNewPayees) {
          return await decline(
            payment.id,
            authorization.id,
            `new payee ${payment.payee}: ALLOW_NEW_PAYEES=false declines payees not trusted yet`,
          );
        }
        logger.info(`new payee ${payment.payee}, will be trusted on authorize`);
      }

      logger.info(
        `ledger match for ${clientReference}: ${payment.amount} ${payment.currency_code} to ${payment.payee}`,
      );
      await authorize(entry as LedgerEntry, authorization, clientReference, data.signature_input);
    } catch (err) {
      if (err instanceof ManzaError) {
        logger.error(
          `API error ${err.name}: ${err.message} (type ${show(err.type)}, request_id ${show(err.requestId)})`,
        );
      } else {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error(`could not answer the challenge: ${e.name}: ${e.message}`);
      }
    }
  }

  async function waitForEntry(clientReference: string): Promise<LedgerEntry | null> {
    const deadline = Date.now() + ledgerWaitMs;
    for (;;) {
      const entry = ledger.find(clientReference);
      if (entry || Date.now() >= deadline) return entry;
      await sleep(500);
    }
  }

  function mismatchReason(entry: LedgerEntry, payment: Payment): string | null {
    const field = CHECKED_FIELDS.find(([ledgerField, webhookField]) => {
      return entry[ledgerField] !== payment[webhookField];
    });
    if (!field) return null;

    const [ledgerField, webhookField] = field;
    return `${ledgerField} differs from the ledger (ledger ${show(entry[ledgerField])}, webhook ${show(payment[webhookField])})`;
  }

  // Sign from the ledger, never from the webhook: `signature_input` in the
  // webhook is only there to compare against.
  async function authorize(
    entry: LedgerEntry,
    authorization: ChallengeData["authorization"],
    clientReference: string,
    webhookInput: string,
  ): Promise<void> {
    const input = TransferAuthorization.signatureInput({
      payment_id: entry.payment_id,
      nonce: authorization.nonce,
      amount: entry.amount,
      currency_code: entry.currency_code,
      account_id: entry.account_id,
      payee: entry.payee,
      client_reference: clientReference,
    });
    // A signature over a different input is sure to fail, and failed
    // attempts count toward suspending the authorizer. Leave the challenge
    // unanswered instead: it expires and goes to your approvers.
    if (input !== webhookInput) {
      logger.warn(
        `signature input differs from the webhook's: ledger ${show(input)}, webhook ${show(webhookInput)}; ` +
          "not answering, the challenge goes to your approvers when it expires",
      );
      return;
    }

    const signature = await TransferAuthorization.sign({ secret, signature_input: input });
    logger.info(`signed the challenge for payment ${entry.payment_id}`);

    const response = await withRetries(() =>
      client.payments.authorize(entry.payment_id, {
        authorization_id: authorization.id,
        signature,
      }),
    );
    const status = (response.body as { status?: unknown } | undefined)?.status;
    logger.info(`authorized payment ${entry.payment_id} (status ${show(status)})`);
  }

  async function decline(paymentId: string, authorizationId: string, reason: string) {
    await withRetries(() =>
      client.payments.decline(paymentId, { authorization_id: authorizationId, reason }),
    );
    logger.warn(`declined payment ${paymentId}: ${reason}`);
  }

  async function withRetries<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await call();
      } catch (err) {
        const retryable =
          TRANSIENT_ERRORS.some((klass) => err instanceof klass) ||
          (err instanceof ManzaConflictError && err.type === BUSY);
        if (!retryable || attempt >= ATTEMPTS) throw err;

        const e = err as ManzaError;
        const delayMs =
          e instanceof ManzaRateLimitError && e.retryAfter
            ? Math.min(e.retryAfter, MAX_RETRY_AFTER_S) * 1000
            : retryDelayMs * attempt;
        logger.warn(`${e.name} (request_id ${show(e.requestId)}), retrying in ${delayMs / 1000}s`);
        await sleep(delayMs);
      }
    }
  }

  return async (rawBody, headers) => {
    const event = await verify(rawBody, headers);
    if (!event) return respond(401);

    if (event.event !== EVENT) {
      logger.info(`ignoring ${event.event}: this app only answers ${EVENT}`);
      return respond(200);
    }

    executor(() => answer(event.data as ChallengeData));
    return respond(200);
  };
}
