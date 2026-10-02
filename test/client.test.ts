import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Manza, ManzaConfigurationError } from "../src/index.js";

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
    expect(z.transferDrafts).toBeDefined();
    expect(z.webhookEndpoints).toBeDefined();
  });
});
