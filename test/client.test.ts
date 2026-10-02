import { describe, expect, test } from "bun:test";
import { Manza, ManzaConfigurationError } from "../src/index.js";

describe("Manza", () => {
  test("requires an apiKey", () => {
    const original = process.env.MANZA_API_KEY;
    delete process.env.MANZA_API_KEY;
    try {
      expect(() => new Manza()).toThrow(ManzaConfigurationError);
    } finally {
      if (original !== undefined) process.env.MANZA_API_KEY = original;
    }
  });

  test("strips trailing slash from baseUrl", () => {
    const z = new Manza({ apiKey: "test", baseUrl: "https://staging.manza.ma///" });
    expect(z.baseUrl).toBe("https://staging.manza.ma");
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
