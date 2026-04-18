import type { PrepaidWalletTransaction } from '@prisma/client';

export interface CreateTopupIntentInput {
  workspaceId: string;
  amountCents: bigint;
  method: 'pix' | 'card';
}

export interface CreateTopupIntentResult {
  paymentIntentId: string;
  clientSecret: string | null;
  /** Present only for PIX-method intents — base64-encoded QR code from Stripe. */
  pixQrCode?: string;
  pixQrCodeUrl?: string;
}

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

export interface ChargeUsageResult {
  newBalanceCents: bigint;
  costCents: bigint;
  transaction: PrepaidWalletTransaction;
}

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

export class WalletNotFoundError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`PrepaidWallet not found for workspace ${workspaceId}`);
    this.name = 'WalletNotFoundError';
  }
}

export class UsagePriceNotFoundError extends Error {
  constructor(public readonly operation: string) {
    super(`No active UsagePrice configured for operation '${operation}'`);
    this.name = 'UsagePriceNotFoundError';
  }
}
