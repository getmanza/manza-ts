// The example's .env loader and ledger lock.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  transfer_method: "standard",
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

  // The 1.x example wrote no transfer_method: it reads as null, the type's
  // "no rail choice", never undefined.
  test("the ledger reads a 1.x entry's missing transfer_method as null", () => {
    const path = join(dir, "ledger.json");
    const { transfer_method: _dropped, ...v1Entry } = ENTRY;
    writeFileSync(path, JSON.stringify({ po_1: v1Entry }));

    expect(new Ledger(path).find("po_1")).toEqual({ ...v1Entry, transfer_method: null });
  });

  test("the ledger finds only entries it recorded, whatever the key", () => {
    const ledger = new Ledger(join(dir, "ledger.json"));
    ledger.record("__proto__", ENTRY);

    expect(ledger.find("constructor")).toBeNull();
    expect(ledger.find("toString")).toBeNull();
    expect(ledger.find("__proto__")).toEqual(ENTRY);
  });

  test("the ledger takes over a lock left by a process that died", () => {
    const path = join(dir, "ledger.json");
    writeFileSync(`${path}.lock`, "2147483646"); // no such pid

    new Ledger(path).record("po_1", ENTRY);

    expect(new Ledger(path).find("po_1")).toEqual(ENTRY);
  });

  test("a dead lock is taken over once, then released for the next writer", () => {
    const path = join(dir, "ledger.json");
    writeFileSync(`${path}.lock`, "2147483646");
    const a = new Ledger(path);
    const b = new Ledger(path);

    a.record("po_1", ENTRY);
    b.record("po_2", { ...ENTRY, payment_id: "p2" });

    expect(a.find("po_1")).toEqual(ENTRY);
    expect(a.find("po_2")?.payment_id).toBe("p2");
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});
