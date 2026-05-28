/**
 * Payout audit row mapping helpers extracted from
 * {@link AdminCarteiraController}.
 *
 * Pure: no DB access, no Nest decorators, no I/O. Re-exported through the
 * `admin-carteira.controller.helpers.ts` barrel so external import paths stay
 * stable.
 */

/**
 * Extract a typed string field from a JSON `details` blob, returning `null`
 * when the value is missing or not a string. Used by {@link mapPayoutAuditItem}
 * so each detail field reads as a flat lookup.
 */
function readDetailString(details: Record<string, unknown>, key: string): string | null {
  const candidate = details[key];
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Subset of the audit item returned by `AdminAuditService.list` needed to shape
 * a payout row in the public response. Kept structural.
 */
export interface PayoutAuditItemLike {
  readonly id: string;
  readonly action: string;
  readonly createdAt: Date;
  readonly details: unknown;
  readonly adminUser?: unknown;
}

/**
 * Shape of the JSON object returned to the admin client for each payout row.
 */
export interface PayoutAuditItemResponse {
  readonly id: string;
  readonly action: string;
  readonly createdAt: string;
  readonly requestId: string | null;
  readonly payoutId: string | null;
  readonly status: string | null;
  readonly amountCents: string | null;
  readonly currency: string | null;
  readonly error: string | null;
  readonly adminUser: unknown;
}

/**
 * Convert an `AdminAudit` row representing a treasury payout into the
 * controller's JSON response shape.
 *
 * Defensive against missing/garbled `details` blobs because audit detail
 * payloads are stored as free-form JSON.
 */
export function mapPayoutAuditItem(item: PayoutAuditItemLike): PayoutAuditItemResponse {
  const details =
    item.details && typeof item.details === 'object' && !Array.isArray(item.details)
      ? (item.details as Record<string, unknown>)
      : {};
  const adminUser =
    'adminUser' in item && item.adminUser && typeof item.adminUser === 'object'
      ? item.adminUser
      : null;

  return {
    id: item.id,
    action: item.action,
    createdAt: item.createdAt.toISOString(),
    requestId: readDetailString(details, 'requestId'),
    payoutId: readDetailString(details, 'payoutId'),
    status: readDetailString(details, 'status'),
    amountCents: readDetailString(details, 'amountCents'),
    currency: readDetailString(details, 'currency'),
    error: readDetailString(details, 'error'),
    adminUser,
  };
}
