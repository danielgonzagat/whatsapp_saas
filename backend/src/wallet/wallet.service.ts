import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrepaidWalletTransaction } from '@prisma/client';

import { StripeService } from '../billing/stripe.service';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { PrismaService } from '../prisma/prisma.service';

import {
  type ChargeUsageInput,
  type ChargeUsageResult,
  type CreateTopupIntentInput,
  type CreateTopupIntentResult,
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from './wallet.types';

interface PixNextAction {
  type: string;
  pix_display_qr_code?: {
    data?: string;
    image_url_png?: string;
    hosted_instructions_url?: string;
  };
}

/**
 * Prepaid wallet for usage-metered services (AI agent, WhatsApp, generic API
 * calls). Independent of Stripe Connect: top-ups create direct PaymentIntents
 * on the platform's own Stripe account; usage debits run as atomic
 * transactions inside `prisma.$transaction` so concurrent debits never
 * over-spend.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a Stripe PaymentIntent that the frontend confirms. On
   * `payment_intent.succeeded` the webhook handler calls
   * `creditFromWebhook` which is idempotent on the PaymentIntent id.
   *
   * Auto-creates the workspace's wallet on first top-up so callers don't
   * need a separate "create wallet" step.
   */
  async createTopupIntent(input: CreateTopupIntentInput): Promise<CreateTopupIntentResult> {
    if (input.amountCents <= 0n) {
      throw new RangeError(
        `createTopupIntent: amountCents must be > 0 (got ${input.amountCents.toString()})`,
      );
    }

    const wallet = await this.prisma.prepaidWallet.upsert({
      where: { workspaceId: input.workspaceId },
      create: { workspaceId: input.workspaceId },
      update: {},
    });

    const intent = await this.stripeService.stripe.paymentIntents.create({
      amount: Number(input.amountCents),
      currency: wallet.currency.toLowerCase(),
      payment_method_types: [input.method === 'pix' ? 'pix' : 'card'],
      metadata: {
        type: 'wallet_topup',
        wallet_id: wallet.id,
        workspace_id: input.workspaceId,
        method: input.method,
      },
      description: `Kloel prepaid wallet top-up — workspace ${input.workspaceId}`,
    });

    return this.shapeIntentResult(intent);
  }

  /**
   * Apply a successful PaymentIntent webhook to the wallet. Idempotent on
   * `(reference_type='stripe_topup', reference_id=paymentIntentId, TOPUP)`.
   * Returns null when the PaymentIntent is unrelated to a wallet top-up
   * (no metadata.wallet_id) so the caller can ignore quietly.
   */
  async creditFromWebhook(
    paymentIntent: StripePaymentIntent,
  ): Promise<PrepaidWalletTransaction | null> {
    const walletId = paymentIntent.metadata?.wallet_id;
    if (!walletId) {
      return null;
    }
    const amountCents = BigInt(paymentIntent.amount);
    if (amountCents <= 0n) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.prepaidWalletTransaction.findFirst({
        where: {
          referenceType: 'stripe_topup',
          referenceId: paymentIntent.id,
          type: 'TOPUP',
        },
      });
      if (existing) {
        this.logger.debug(`creditFromWebhook idempotent skip: pi=${paymentIntent.id}`);
        return existing;
      }

      const wallet = await tx.prepaidWallet.findUnique({ where: { id: walletId } });
      if (!wallet) {
        this.logger.error(
          `creditFromWebhook: wallet ${walletId} referenced by PaymentIntent ${paymentIntent.id} not found`,
        );
        throw new WalletNotFoundError(walletId);
      }

      const newBalance = wallet.balanceCents + amountCents;
      await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: newBalance },
      });

      return tx.prepaidWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'TOPUP',
          amountCents,
          balanceAfterCents: newBalance,
          referenceType: 'stripe_topup',
          referenceId: paymentIntent.id,
          metadata: {
            method: paymentIntent.metadata?.method ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Atomically debit `units * pricePerUnit` from the workspace's wallet.
   * Throws `InsufficientWalletBalanceError` when the balance is too low.
   * Idempotent on `(reference_type='usage:<operation>', reference_id=requestId, USAGE)`
   * so retried API calls don't double-debit.
   */
  async chargeForUsage(input: ChargeUsageInput): Promise<ChargeUsageResult> {
    if (input.units <= 0 || !Number.isFinite(input.units)) {
      throw new RangeError(`chargeForUsage: units must be > 0 (got ${input.units})`);
    }

    const price = await this.prisma.usagePrice.findUnique({
      where: { operation: input.operation },
    });
    if (!price || !price.active) {
      throw new UsagePriceNotFoundError(input.operation);
    }

    const costCents = price.pricePerUnitCents * BigInt(input.units);
    const referenceType = `usage:${input.operation}`;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.prepaidWalletTransaction.findFirst({
        where: { referenceType, referenceId: input.requestId, type: 'USAGE' },
      });
      if (existing) {
        const wallet = await tx.prepaidWallet.findUnique({
          where: { id: existing.walletId },
        });
        return {
          newBalanceCents: wallet?.balanceCents ?? 0n,
          costCents: -existing.amountCents,
          transaction: existing,
        };
      }

      const wallet = await tx.prepaidWallet.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if (!wallet) {
        throw new WalletNotFoundError(input.workspaceId);
      }

      if (wallet.balanceCents < costCents) {
        throw new InsufficientWalletBalanceError(wallet.id, costCents, wallet.balanceCents);
      }

      const newBalance = wallet.balanceCents - costCents;
      await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: newBalance },
      });

      const transaction = await tx.prepaidWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'USAGE',
          amountCents: -costCents,
          balanceAfterCents: newBalance,
          referenceType,
          referenceId: input.requestId,
          metadata: {
            operation: input.operation,
            units: input.units,
            pricePerUnitCents: price.pricePerUnitCents.toString(),
            ...(input.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });

      return { newBalanceCents: newBalance, costCents, transaction };
    });
  }

  async getBalance(workspaceId: string): Promise<bigint> {
    const wallet = await this.prisma.prepaidWallet.findUnique({ where: { workspaceId } });
    if (!wallet) {
      throw new WalletNotFoundError(workspaceId);
    }
    return wallet.balanceCents;
  }

  private shapeIntentResult(intent: StripePaymentIntent): CreateTopupIntentResult {
    const action = intent.next_action as PixNextAction | null | undefined;
    const isPix = action?.type === 'pix_display_qr_code';
    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? null,
      pixQrCode: isPix ? action?.pix_display_qr_code?.data : undefined,
      pixQrCodeUrl: isPix ? action?.pix_display_qr_code?.image_url_png : undefined,
    };
  }
}
