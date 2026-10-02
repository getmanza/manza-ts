import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { resetDeprecationWarnings } from "../src/env.js";
import { Manza, ManzaConfigurationError } from "../src/index.js";

const VARS = ["API_KEY", "BASE_URL", "API_VERSION", "TIMEOUT_MS"].flatMap((name) => [
  `MANZA_${name}`,
  `ZAZU_${name}`,
]);

describe("environment variables", () => {
  const saved: Record<string, string | undefined> = {};
  let warn: ReturnType<typeof spyOn>;

  beforeEach(() => {
    for (const name of VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    resetDeprecationWarnings();
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    for (const name of VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  test("reads the MANZA_* variables without warning", () => {
    process.env.MANZA_API_KEY = "manza-key";
    process.env.MANZA_BASE_URL = "https://example.test/";
    process.env.MANZA_API_VERSION = "2026-01-01";
    process.env.MANZA_TIMEOUT_MS = "1234";
    const m = new Manza();
    expect(m.apiKey).toBe("manza-key");
    expect(m.baseUrl).toBe("https://example.test");
    expect(m.apiVersion).toBe("2026-01-01");
    expect(m.timeoutMs).toBe(1234);
    expect(warn).not.toHaveBeenCalled();
  });

  test("falls back to each ZAZU_* variable with a deprecation warning", () => {
    process.env.ZAZU_API_KEY = "zazu-key";
    process.env.ZAZU_BASE_URL = "https://legacy.test";
    process.env.ZAZU_API_VERSION = "2025-01-01";
    process.env.ZAZU_TIMEOUT_MS = "4321";
    const m = new Manza();
    expect(m.apiKey).toBe("zazu-key");
    expect(m.baseUrl).toBe("https://legacy.test");
    expect(m.apiVersion).toBe("2025-01-01");
    expect(m.timeoutMs).toBe(4321);
    expect(warn).toHaveBeenCalledTimes(4);
    for (const name of ["API_KEY", "BASE_URL", "API_VERSION", "TIMEOUT_MS"]) {
      expect(warn.mock.calls.some((c: unknown[]) => String(c[0]).includes(`ZAZU_${name}`))).toBe(
        true,
      );
    }
    expect(String(warn.mock.calls[0]?.[0])).toContain("MANZA_");
  });

  test("MANZA_* wins over ZAZU_* and does not warn", () => {
    process.env.MANZA_API_KEY = "new";
    process.env.ZAZU_API_KEY = "old";
    expect(new Manza().apiKey).toBe("new");
    expect(warn).not.toHaveBeenCalled();
  });

  test("warns only once per legacy variable", () => {
    process.env.ZAZU_API_KEY = "zazu-key";
    new Manza();
    new Manza();
    new Manza();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("does not warn when options are passed explicitly", () => {
    process.env.ZAZU_API_KEY = "zazu-key";
    new Manza({ apiKey: "explicit" });
    expect(warn).not.toHaveBeenCalled();
  });

  test("missing key error names MANZA_API_KEY", () => {
    expect(() => new Manza()).toThrow(ManzaConfigurationError);
    expect(() => new Manza()).toThrow(/MANZA_API_KEY/);
  });
});

describe("request headers", () => {
  test("sends Manza-Version and a manza-ts User-Agent", async () => {
    let captured: Headers | undefined;
    const m = new Manza({
      apiKey: "k",
      apiVersion: "2026-01-01",
      fetch: (async (_url: unknown, init?: RequestInit) => {
        captured = new Headers(init?.headers);
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    await m.request("GET", "/v1/entity");
    expect(captured?.get("Manza-Version")).toBe("2026-01-01");
    expect(captured?.has("Zazu-Version")).toBe(false);
    expect(captured?.get("User-Agent")).toMatch(/^manza-ts\/\d+\.\d+\.\d+/);
  });
});
