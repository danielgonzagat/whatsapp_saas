import { Logger } from '@nestjs/common';

const logger = new Logger('CheckoutOrderStateMachine');

/**
 * Valid CheckoutOrder status transitions.
 * Enforces: PENDING → PROCESSING → PAID, with terminal branches.
 */
const VALID_ORDER_TRANSITIONS: Record<string, Set<string>> = {
  PENDING: new Set(['PROCESSING', 'CANCELED']),
  PROCESSING: new Set(['PAID', 'CANCELED', 'REFUNDED', 'CHARGEBACK']),
  PAID: new Set(['SHIPPED', 'REFUNDED', 'CHARGEBACK']),
  SHIPPED: new Set(['DELIVERED', 'REFUNDED']),
  DELIVERED: new Set([]),
  CANCELED: new Set([]),
  REFUNDED: new Set([]),
  CHARGEBACK: new Set([]),
};

/** Terminal order states — no further transitions allowed. */
const TERMINAL_ORDER_STATES = new Set(['DELIVERED', 'CANCELED', 'REFUNDED', 'CHARGEBACK']);

/**
 * Queryable order statuses — states that are valid to filter by in read queries.
 * Includes all non-transient states from the state machine.
 */
const QUERYABLE_ORDER_STATES = new Set([
  'PENDING',
  'PROCESSING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
]);

/** Check if a transition between two order statuses is valid. */
export function isValidOrderTransition(currentStatus: string, newStatus: string): boolean {
  const normalized = String(currentStatus || '').toUpperCase();
  const newNormalized = String(newStatus || '').toUpperCase();
  const allowed = VALID_ORDER_TRANSITIONS[normalized];
  if (!allowed) {
    logger.warn(
      `Rejecting transition from unknown order state "${normalized}" -> "${newNormalized}"`,
    );
    return false;
  }
  return allowed.has(newNormalized);
}

/** Validate an order status transition, logging rejection if invalid. */
export function validateOrderTransition(
  currentStatus: string,
  newStatus: string,
  context: { orderId?: string; workspaceId?: string },
): boolean {
  if (isValidOrderTransition(currentStatus, newStatus)) {
    return true;
  }

  logger.warn(
    `Invalid order transition: ${currentStatus} -> ${newStatus} ` +
      `(order=${context.orderId}, workspace=${context.workspaceId})`,
  );
  return false;
}

/**
 * Assert that a status value is valid for use in a query filter (WHERE clause).
 * Throws if the status is unknown; warns if the status is terminal when
 * the query expects active orders.
 */
export function assertValidOrderStatusFilter(status: string, caller: string): void {
  const normalized = String(status || '').toUpperCase();
  if (!QUERYABLE_ORDER_STATES.has(normalized)) {
    logger.error(`Invalid order status filter "${normalized}" used by ${caller}`);
    throw new Error(`Unknown order status: ${normalized}`);
  }
  if (TERMINAL_ORDER_STATES.has(normalized)) {
    logger.verbose(
      `Querying terminal order status "${normalized}" from ${caller} — ` +
        `ensure this is intentional as no further transitions are possible`,
    );
  }
}

/** Check if a status is terminal (no further transitions). */
export function isTerminalOrderStatus(status: string): boolean {
  return TERMINAL_ORDER_STATES.has(String(status || '').toUpperCase());
}
