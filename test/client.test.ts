import { describe, expect, test } from "bun:test";
import { Zazu, ZazuConfigurationError } from "../src/index.js";

describe("Zazu", () => {
  test("requires an apiKey", () => {
    const original = process.env.ZAZU_API_KEY;
    delete process.env.ZAZU_API_KEY;
    try {
      expect(() => new Zazu()).toThrow(ZazuConfigurationError);
    } finally {
      if (original !== undefined) process.env.ZAZU_API_KEY = original;
    }
  });

  test("strips trailing slash from baseUrl", () => {
    const z = new Zazu({ apiKey: "test", baseUrl: "https://staging.zazu.ma///" });
    expect(z.baseUrl).toBe("https://staging.zazu.ma");
  });

  test("defaults baseUrl to Morocco production (ma.manza.finance)", () => {
    const z = new Zazu({ apiKey: "test" });
    expect(z.baseUrl).toBe("https://ma.manza.finance");
  });

  test("exposes every resource", () => {
    const z = new Zazu({ apiKey: "test" });
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
