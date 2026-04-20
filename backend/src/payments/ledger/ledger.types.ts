import type { ConnectAccountType, ConnectLedgerEntryType } from '@prisma/client';

/** Credit pending input shape. */
export interface CreditPendingInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Mature at property. */
  matureAt: Date;
  /** Reference property. */
  reference: LedgerReference;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Debit payout input shape. */
export interface DebitPayoutInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Reference property. */
  reference: LedgerReference;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Debit chargeback input shape. */
export interface DebitChargebackInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Reference property. */
  reference: LedgerReference;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Debit refund input shape. */
export interface DebitRefundInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Reference property. */
  reference: LedgerReference;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Credit available adjustment input shape. */
export interface CreditAvailableAdjustmentInput {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Reference property. */
  reference: LedgerReference;
  /** Metadata property. */
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
  /** Account balance id property. */
  accountBalanceId: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Account type property. */
  accountType: ConnectAccountType;
  /** Pending cents property. */
  pendingCents: bigint;
  /** Available cents property. */
  availableCents: bigint;
  /** Lifetime received cents property. */
  lifetimeReceivedCents: bigint;
  /** Lifetime paid out cents property. */
  lifetimePaidOutCents: bigint;
  /** Lifetime chargebacks cents property. */
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
