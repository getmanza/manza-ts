// Mirrors lib/manza/resources/transfer_drafts.rb.

import { Payments } from "./payments.js";

/**
 * @deprecated Use {@link Payments} (`manza.payments`). Kept for all of 1.x:
 * it is the same class, and it calls `/api/payments`.
 */
export const TransferDrafts = Payments;
/** @deprecated Use {@link Payments}. */
export type TransferDrafts = Payments;
