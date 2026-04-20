import type { PrepaidWalletTransaction } from '@prisma/client';

/** Create topup intent input shape. */
export interface CreateTopupIntentInput {
  workspaceId: string;
  amountCents: bigint;
  method: 'pix' | 'card';
}

/** Create topup intent result shape. */
export interface CreateTopupIntentResult {
  paymentIntentId: string;
  clientSecret: string | null;
  /** Present only for PIX-method intents — base64-encoded QR code from Stripe. */
  pixQrCode?: string;
  pixQrCodeUrl?: string;
}

/** Charge usage input shape. */
export interface ChargeUsageInput {
  workspaceId: string;
  operation: string;
  units: number;
  /**
   * If provided, used as the idempotency key (`reference.id`). Most callers
   * pass the upstream request id (e.g. AI message id, WhatsApp send id) so
   * retries don't double-debit.
   */
  requestId: string;
  metadata?: Record<string, unknown>;
}

/** Charge usage result shape. */
export interface ChargeUsageResult {
  newBalanceCents: bigint;
  costCents: bigint;
  transaction: PrepaidWalletTransaction;
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
