import { Logger } from '@nestjs/common';

const logger = new Logger('PaymentStateMachine');

/**
 * Valid payment status transitions.
 * Rejects out-of-order webhooks (e.g., REFUND before CONFIRMED).
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  PENDING: new Set([
    'PROCESSING',
    'CONFIRMED',
    'RECEIVED',
    'APPROVED',
    'OVERDUE',
    'EXPIRED',
    'CANCELED',
    'DECLINED',
    'FAILED',
  ]),
  PROCESSING: new Set([
    'CONFIRMED',
    'RECEIVED',
    'APPROVED',
    'DECLINED',
    'FAILED',
    'OVERDUE',
    'EXPIRED',
    'CANCELED',
  ]),
  CONFIRMED: new Set(['REFUNDED', 'CHARGEBACK', 'CHARGEBACK_REQUESTED', 'PARTIALLY_REFUNDED']),
  RECEIVED: new Set(['REFUNDED', 'CHARGEBACK', 'CHARGEBACK_REQUESTED', 'PARTIALLY_REFUNDED']),
  APPROVED: new Set(['REFUNDED', 'CHARGEBACK', 'CHARGEBACK_REQUESTED', 'PARTIALLY_REFUNDED']),
  OVERDUE: new Set(['CONFIRMED', 'RECEIVED', 'APPROVED', 'EXPIRED', 'CANCELED']),
  EXPIRED: new Set([]),
  CANCELED: new Set([]),
  DECLINED: new Set([]),
  FAILED: new Set([]),
  REFUNDED: new Set([]),
  CHARGEBACK: new Set([]),
  CHARGEBACK_REQUESTED: new Set(['CHARGEBACK', 'REFUNDED']),
  PARTIALLY_REFUNDED: new Set(['REFUNDED', 'CHARGEBACK']),
};

export function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const normalized = currentStatus.toUpperCase();
  const newNormalized = newStatus.toUpperCase();
  const allowed = VALID_TRANSITIONS[normalized];
  if (!allowed) return true; // Unknown current status -- allow (don't block)
  return allowed.has(newNormalized);
}

export function validatePaymentTransition(
  currentStatus: string,
  newStatus: string,
  context: { paymentId?: string; provider?: string; externalId?: string },
): boolean {
  if (isValidTransition(currentStatus, newStatus)) return true;

  logger.warn(
    `Rejected out-of-order webhook: ${currentStatus} -> ${newStatus} ` +
      `(payment=${context.paymentId}, provider=${context.provider}, externalId=${context.externalId})`,
  );
  return false;
}
