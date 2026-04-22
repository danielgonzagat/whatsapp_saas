import type { PrepaidWalletTransaction } from '@prisma/client';

/** Create topup intent input shape. */
export interface CreateTopupIntentInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Amount cents property. */
  amountCents: bigint;
  /** Method property. */
  method: 'pix' | 'card';
}

/** Create topup intent result shape. */
export interface CreateTopupIntentResult {
  /** Payment intent id property. */
  paymentIntentId: string;
  /** Client secret property. */
  clientSecret: string | null;
  /** Present only for PIX-method intents — base64-encoded QR code from Stripe. */
  pixQrCode?: string;
  /** Pix qr code url property. */
  pixQrCodeUrl?: string;
}

/** Charge usage input shape. */
export interface ChargeUsageInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Operation property. */
  operation: string;
  /**
   * Catalog-billed quantity. Required when `quotedCostCents` is omitted.
   */
  units?: number;
  /**
   * Direct provider-priced debit in cents. When present, bypasses
   * `usage_prices` and charges the quoted amount atomically.
   */
  quotedCostCents?: bigint;
  /**
   * If provided, used as the idempotency key (`reference.id`). Most callers
   * pass the upstream request id (e.g. AI message id, WhatsApp send id) so
   * retries don't double-debit.
   */
  requestId: string;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Charge usage result shape. */
export interface ChargeUsageResult {
  /** New balance cents property. */
  newBalanceCents: bigint;
  /** Cost cents property. */
  costCents: bigint;
  /** Transaction property. */
  transaction: PrepaidWalletTransaction;
}

/** Refund usage input shape. */
export interface RefundUsageInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Operation property. */
  operation: string;
  /** Original usage request id used during `chargeForUsage`. */
  requestId: string;
  /** Reason property. */
  reason: string;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Settle usage input shape. */
export interface SettleUsageInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Operation property. */
  operation: string;
  /** Original usage request id used during `chargeForUsage`. */
  requestId: string;
  /** Exact provider cost in cents. */
  actualCostCents: bigint;
  /** Reason property. */
  reason: string;
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Insufficient wallet balance error. */
export class InsufficientWalletBalanceError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly requestedCents: bigint,
    public readonly currentCents: bigint,
  ) {
    super(
      `Insufficient prepaid wallet balance on ${walletId}: requested ${requestedCents.toString()}, have ${currentCents.toString()}.`,
    );
    this.name = 'InsufficientWalletBalanceError';
  }
}

/** Wallet not found error. */
export class WalletNotFoundError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`PrepaidWallet not found for workspace ${workspaceId}`);
    this.name = 'WalletNotFoundError';
  }
}

/** Usage price not found error. */
export class UsagePriceNotFoundError extends Error {
  constructor(public readonly operation: string) {
    super(`No active UsagePrice configured for operation '${operation}'`);
    this.name = 'UsagePriceNotFoundError';
  }
}
