// Mirror of manza-ruby's spec/examples/routing_spec.rb.

import { describe, expect, test } from "bun:test";
import { describeRouting, REFUSAL_REASONS } from "../../examples/transfer_authorizer/routing.js";

describe("describeRouting", () => {
  test("says the challenge went to the authorizer when it is pending", () => {
    expect(describeRouting({ status: "pending" })).toContain("challenge sent");
  });

  test("explains every create-time refusal reason in words", () => {
    const expected: Record<string, string> = {
      untrusted_payee: "bank details are not trusted",
      unrestricted_api_key: "key A has no IP allowlist",
      over_new_payee_limit: "limit per transfer to a new payee",
      over_transfer_limit: "over the limit per transfer",
      over_daily_limit: "limit per 24 hours",
      currency_mismatch: "not the enrolled currency",
      suspended: "is suspended",
      secret_expired: "secret has expired",
    };
    expect(Object.keys(REFUSAL_REASONS).sort()).toEqual(Object.keys(expected).sort());

    for (const [reason, words] of Object.entries(expected)) {
      const line = describeRouting({ status: "refused", refusal_reason: reason });

      for (const part of ["approvers", "refused", reason, words]) expect(line).toContain(part);
    }
  });

  test("points at the docs for a reason it does not know", () => {
    const line = describeRouting({ status: "refused", refusal_reason: "something_new" });

    expect(line).toContain("something_new");
    expect(line).toContain("transfer authorization docs");
  });

  test("does not mistake an Object.prototype name for a known reason", () => {
    expect(describeRouting({ status: "refused", refusal_reason: "constructor" })).toContain(
      "transfer authorization docs",
    );
  });

  test("says no authorizer was enrolled when there is no authorization", () => {
    expect(describeRouting(null)).toContain("no transfer authorizer");
  });
});
