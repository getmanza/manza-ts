// Mirror of spec/manza/resources/transfer_drafts_spec.rb: the deprecated
// alias of Payments. HTTP-free on purpose — payments.test.ts replays the
// cassettes, and the alias is the very same object.

import { describe, expect, test } from "bun:test";
import { Manza, Payments, TransferDrafts } from "../../src/index.js";

describe("transferDrafts (deprecated)", () => {
  test("is the payments resource, so it calls /api/payments", () => {
    const manza = new Manza({ apiKey: "test" });

    expect(manza.transferDrafts).toBe(manza.payments);
  });

  test("keeps the TransferDrafts export, naming the same class", () => {
    expect(TransferDrafts).toBe(Payments);
    expect(new Manza({ apiKey: "test" }).transferDrafts).toBeInstanceOf(TransferDrafts);
  });
});
