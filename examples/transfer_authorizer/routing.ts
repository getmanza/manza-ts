// Says where the API routed a new draft, from its `authorization`:
// pending means the challenge went to the authorizer; refused, with a
// `refusal_reason`, means it went to your in-app approvers.

// The reasons a draft can be refused when it is created. The transfer
// authorization docs' troubleshooting table has the fix for each.
export const REFUSAL_REASONS: Readonly<Record<string, string>> = {
  untrusted_payee:
    'the payee\'s bank details are not trusted, and "Approve transfers to new payees" is off ' +
    "or their trust was revoked or they were edited",
  unrestricted_api_key: "the payee is new and key A has no IP allowlist",
  over_new_payee_limit:
    "the payee is new and the amount is over the limit per transfer to a new payee",
  over_transfer_limit: "the amount is over the limit per transfer",
  over_daily_limit:
    "this amount plus the last 24 hours' authorized total is over the limit per 24 hours",
  currency_mismatch: "the account's currency is not the enrolled currency",
  suspended: "transfer authorization is suspended, or its webhook endpoint is disabled",
  secret_expired: "the signing secret has expired",
};

export interface Authorization {
  status?: string | null;
  refusal_reason?: string | null;
}

export function describeRouting(authorization: Authorization | null | undefined): string {
  if (!authorization) {
    return "no transfer authorizer was enrolled (or the feature is off): sent to your approvers";
  }
  if (authorization.status === "pending") {
    return "challenge sent, waiting for the authorizer: watch the server.ts terminal";
  }

  const reason = authorization.refusal_reason ?? "";
  const words = Object.hasOwn(REFUSAL_REASONS, reason)
    ? REFUSAL_REASONS[reason]
    : "see the transfer authorization docs' troubleshooting table";
  return `sent to your approvers, not the authorizer: ${authorization.status} (${reason}), ${words}`;
}
