// The example's .env loader and ledger lock.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../../examples/transfer_authorizer/env.js";
import { Ledger } from "../../examples/transfer_authorizer/ledger.js";

const ENTRY = {
  payment_id: "p1",
  amount: "10.0",
  currency_code: "MAD",
  account_id: "a1",
  payee: "ext:e1",
};

describe("transfer authorizer example files", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "manza-example-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.MANZA_EXAMPLE_TEST_KEY;
  });

  // Like Ruby's Dotenv.overload: a stale key exported in the shell must not
  // mask the one just written to .env.
  test("loadEnv lets .env win over the shell", () => {
    process.env.MANZA_EXAMPLE_TEST_KEY = "stale-shell-value";
    writeFileSync(join(dir, ".env"), "MANZA_EXAMPLE_TEST_KEY=from-file\n");

    loadEnv(join(dir, ".env"));

    expect(process.env.MANZA_EXAMPLE_TEST_KEY).toBe("from-file");
  });

  test("loadEnv does nothing without a .env", () => {
    expect(() => loadEnv(join(dir, ".env"))).not.toThrow();
  });

  test("the ledger records and finds an entry", () => {
    const ledger = new Ledger(join(dir, "ledger.json"));

    ledger.record("po_1", ENTRY);

    expect(ledger.find("po_1")).toEqual(ENTRY);
    expect(ledger.find("po_2")).toBeNull();
  });

  test("the ledger takes over a lock left by a process that died", () => {
    const path = join(dir, "ledger.json");
    writeFileSync(`${path}.lock`, "2147483646"); // no such pid

    new Ledger(path).record("po_1", ENTRY);

    expect(new Ledger(path).find("po_1")).toEqual(ENTRY);
  });
});
