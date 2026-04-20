import type { ConnectAccountType, ConnectLedgerEntryType } from '@prisma/client';

/** Credit pending input shape. */
export interface CreditPendingInput {
  accountBalanceId: string;
  amountCents: bigint;
  matureAt: Date;
  reference: LedgerReference;
  metadata?: Record<string, unknown>;
}

/** Debit payout input shape. */
export interface DebitPayoutInput {
  accountBalanceId: string;
  amountCents: bigint;
  reference: LedgerReference;
  metadata?: Record<string, unknown>;
}

/** Debit chargeback input shape. */
export interface DebitChargebackInput {
  accountBalanceId: string;
  amountCents: bigint;
  reference: LedgerReference;
  metadata?: Record<string, unknown>;
}

/** Debit refund input shape. */
export interface DebitRefundInput {
  accountBalanceId: string;
  amountCents: bigint;
  reference: LedgerReference;
  metadata?: Record<string, unknown>;
}

/** Credit available adjustment input shape. */
export interface CreditAvailableAdjustmentInput {
  accountBalanceId: string;
  amountCents: bigint;
  reference: LedgerReference;
  metadata?: Record<string, unknown>;
}

/** Ledger reference shape. */
export interface LedgerReference {
  /** e.g. 'sale', 'payout', 'chargeback', 'refund', 'adjustment'. */
  type: string;
  /** External id (PaymentIntent id, payout id, dispute id, etc.). */
  id: string;
}

/** Balance snapshot shape. */
export interface BalanceSnapshot {
  accountBalanceId: string;
  stripeAccountId: string;
  accountType: ConnectAccountType;
  pendingCents: bigint;
  availableCents: bigint;
  lifetimeReceivedCents: bigint;
  lifetimePaidOutCents: bigint;
  lifetimeChargebacksCents: bigint;
}

/** Insufficient available balance error. */
export class InsufficientAvailableBalanceError extends Error {
  constructor(
    public readonly accountBalanceId: string,
    public readonly requestedCents: bigint,
    public readonly availableCents: bigint,
  ) {
    super(
      `Insufficient available balance on ${accountBalanceId}: requested ${requestedCents.toString()}, have ${availableCents.toString()}.`,
    );
    this.name = 'InsufficientAvailableBalanceError';
  }
}

/** Account balance not found error. */
export class AccountBalanceNotFoundError extends Error {
  constructor(public readonly accountBalanceId: string) {
    super(`ConnectAccountBalance not found: ${accountBalanceId}`);
    this.name = 'AccountBalanceNotFoundError';
  }
}

/**
 * Map our domain entry type to the Prisma enum. Kept as a typed const so
 * adding new entry types fails the type-check until the consumer is updated.
 */
export const LEDGER_ENTRY_TYPES: Record<ConnectLedgerEntryType, ConnectLedgerEntryType> = {
  CREDIT_PENDING: 'CREDIT_PENDING',
  MATURE: 'MATURE',
  DEBIT_PAYOUT: 'DEBIT_PAYOUT',
  DEBIT_CHARGEBACK: 'DEBIT_CHARGEBACK',
  DEBIT_REFUND: 'DEBIT_REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
};
