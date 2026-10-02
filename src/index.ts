// Public surface. Mirror of lib/manza.rb.

export { Manza, type ManzaClientOptions, type RequestOptions } from "./client.js";
export {
  ManzaArgumentError,
  ManzaAuthenticationError,
  ManzaConfigurationError,
  ManzaConflictError,
  ManzaConnectionError,
  ManzaError,
  type ManzaErrorOptions,
  ManzaForbiddenError,
  ManzaNotFoundError,
  ManzaRateLimitError,
  ManzaServerError,
  ManzaValidationError,
} from "./errors.js";
export { MAX_PER_PAGE, Page, type PageBody, type PageFetcher } from "./page.js";
// Resource classes are exported for users who want to extend or
// reference them directly.
export { Accounts } from "./resources/accounts.js";
export { Beneficiaries } from "./resources/beneficiaries.js";
export { CheckoutSessions } from "./resources/checkout_sessions.js";
export { Customers } from "./resources/customers.js";
export { Entity } from "./resources/entity.js";
export { Invoices } from "./resources/invoices.js";
export { PayeeTrustRequests } from "./resources/payee_trust_requests.js";
export { PaymentLinks } from "./resources/payment_links.js";
export { TransferDrafts } from "./resources/transfer_drafts.js";
export { WebhookEndpoints } from "./resources/webhook_endpoints.js";
export { ManzaResponse } from "./response.js";
export {
  type PayeeForParams,
  type SignatureInputFields,
  TransferAuthorization,
} from "./transfer_authorization.js";
export { VERSION } from "./version.js";
