import { asString, asNumber } from './kloel-tool-dispatcher.helpers';
import { sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';

import type { UnknownRecord } from '../common/types';

/**
 * Shape of the typed arguments accepted by `toolCreatePaymentLink`. Kept
 * narrow on purpose — only fields that are part of the payment-link
 * contract may flow through here.
 */
export interface PaymentLinkArgs {
  amount: number;
  description: string;
  customerName?: string;
}

/**
 * Coerce the dispatcher's free-form `UnknownRecord` payload into the typed
 * `PaymentLinkArgs` shape consumed by `KloelChatToolsService.toolCreatePaymentLink`.
 *
 * Pure: no I/O, no logging.
 */
export function buildPaymentLinkArgs(args: UnknownRecord): PaymentLinkArgs {
  return {
    amount: asNumber(args.amount),
    description: asString(args.description),
    ...(typeof args.customerName === 'string' ? { customerName: args.customerName } : {}),
  };
}

/**
 * Extract the optional `paymentId` string from a payment-link result, used as
 * the `resourceId` on the audit-log row. Anything non-string (undefined,
 * null, number) collapses to `undefined` so callers can spread it
 * conditionally without leaking junk into the audit row.
 */
export function extractPaymentResourceId(result: UnknownRecord): string | undefined {
  const paymentIdValue: unknown = result.paymentId;
  return typeof paymentIdValue === 'string' ? paymentIdValue : undefined;
}

/**
 * Build the `details` payload of an audit-log entry for a dispatched
 * `create_payment_link` tool call. Routes through `sanitizeDetails` so any
 * sensitive key (password, token, secret, cpf, ssn, card, pan) is stripped
 * even if it sneaks into the payment args in the future.
 */
export function buildPaymentLinkAuditDetails(paymentArgs: PaymentLinkArgs): UnknownRecord {
  return sanitizeDetails(paymentArgs as unknown as UnknownRecord);
}

/**
 * Build the partial fields of an audit-log entry for a dispatched
 * `create_payment_link` tool call. Returns the conditional spreads
 * (`resourceId`, `agentId`) plus the deterministic `action` / `resource` /
 * `details` keys. Callers add `workspaceId` and pass the result straight to
 * `auditService.logWithTx`.
 */
export function buildPaymentLinkAuditEntry(
  paymentArgs: PaymentLinkArgs,
  result: UnknownRecord,
  userId?: string,
): {
  action: string;
  resource: string;
  details: UnknownRecord;
  resourceId?: string;
  agentId?: string;
} {
  const resourceId = extractPaymentResourceId(result);
  return {
    action: 'KLOEL_TOOL_PAYMENT_LINK_DISPATCHED',
    resource: 'KloelToolDispatcher',
    details: buildPaymentLinkAuditDetails(paymentArgs),
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(userId !== undefined ? { agentId: userId } : {}),
  };
}

/**
 * Coerce an arbitrary thrown value into a human-readable string for the
 * warn-level audit failure log. Mirrors the inline fallback chain that used
 * to live in `dispatchCreatePaymentLink`.
 */
export function extractAuditErrorMessage(auditError: unknown): string {
  if (auditError instanceof Error) {
    return auditError.message;
  }
  if (typeof auditError === 'string') {
    return auditError;
  }
  return 'unknown';
}
