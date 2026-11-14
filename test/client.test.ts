import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  Manza,
  ManzaConfigurationError,
  ManzaPlanLimitReachedError,
  ManzaValidationError,
} from "../src/index.js";

// The client reads MANZA_* and falls back to ZAZU_*; clear both so a
// developer's shell can't leak into these defaults.
const ENV_NAMES = ["API_KEY", "BASE_URL", "API_VERSION", "TIMEOUT_MS"].flatMap((n) => [
  `MANZA_${n}`,
  `ZAZU_${n}`,
]);

describe("Manza", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV_NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  test("requires an apiKey", () => {
    expect(() => new Manza()).toThrow(ManzaConfigurationError);
  });

  test("strips trailing slash from baseUrl", () => {
    const z = new Manza({ apiKey: "test", baseUrl: "https://staging.manza.example///" });
    expect(z.baseUrl).toBe("https://staging.manza.example");
  });

  test("defaults baseUrl to Morocco production (ma.manza.finance)", () => {
    const z = new Manza({ apiKey: "test" });
    expect(z.baseUrl).toBe("https://ma.manza.finance");
  });

  test("exposes every resource", () => {
    const z = new Manza({ apiKey: "test" });
    expect(z.accounts).toBeDefined();
    expect(z.beneficiaries).toBeDefined();
    expect(z.checkoutSessions).toBeDefined();
    expect(z.customers).toBeDefined();
    expect(z.entity).toBeDefined();
    expect(z.invoices).toBeDefined();
    expect(z.payeeTrustRequests).toBeDefined();
    expect(z.paymentLinks).toBeDefined();
    expect(z.payments).toBeDefined();
    expect(z.transferAuthorizer).toBeDefined();
    expect(z.transferDrafts).toBeDefined();
    expect(z.webhookEndpoints).toBeDefined();
  });
});

// No cassette records a plan cap, so these answer through the client's
// `fetch` option, like manza-ruby's client_spec stubs them.
describe("Manza error mapping", () => {
  const clientAnswering = (status: number, error: Record<string, unknown>) =>
    new Manza({
      apiKey: "test",
      baseUrl: "https://staging.manza.example",
      fetch: (async () =>
        new Response(JSON.stringify({ error }), {
          status,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });

  const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
      await promise;
    } catch (err) {
      return err;
    }
    throw new Error("expected a rejection");
  };

  // The API's body verbatim (getmanza/app spec/requests/api/invoices_spec.rb).
  test("maps 422 plan_limit_reached to ManzaPlanLimitReachedError carrying kind, current and max", async () => {
    const manza = clientAnswering(422, {
      type: "plan_limit_reached",
      message: "Plan limit reached for invoices: 10 of 10",
      kind: "invoices",
      current: 10,
      max: 10,
    });

    const e = await rejection(manza.entity.get());

    expect(e).toBeInstanceOf(ManzaPlanLimitReachedError);
    expect(e).toBeInstanceOf(ManzaValidationError);
    const error = e as ManzaPlanLimitReachedError;
    expect(error.status).toBe(422);
    expect(error.type).toBe("plan_limit_reached");
    expect(error.message).toBe("Plan limit reached for invoices: 10 of 10");
    expect([error.kind, error.current, error.max]).toEqual(["invoices", 10, 10]);
    expect(error.name).toBe("ManzaPlanLimitReachedError");
  });

  test("keeps any other 422 a plain ManzaValidationError", async () => {
    const manza = clientAnswering(422, {
      message: "Customer not found",
      type: "invalid_request_error",
      param: "customer_id",
    });

    const e = await rejection(manza.entity.get());

    expect(e).toBeInstanceOf(ManzaValidationError);
    expect(e).not.toBeInstanceOf(ManzaPlanLimitReachedError);
    expect((e as ManzaValidationError).param).toBe("customer_id");
  });
});
