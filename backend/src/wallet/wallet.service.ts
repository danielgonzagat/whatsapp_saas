import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrepaidWalletTransaction } from '@prisma/client';

import { StripeService } from '../billing/stripe.service';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';

import {
  type ChargeUsageInput,
  type ChargeUsageResult,
  type CreateTopupIntentInput,
  type CreateTopupIntentResult,
  type RefundUsageInput,
  type SettleUsageInput,
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
    private readonly fraudEngine: FraudEngine,
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

    const fraudDecision = await this.fraudEngine.evaluate({
      workspaceId: input.workspaceId,
      buyerEmail: input.buyerEmail ?? null,
      buyerCpf: input.buyerCpf ?? null,
      buyerCnpj: input.buyerCnpj ?? null,
      buyerIp: input.buyerIp ?? null,
      deviceFingerprint: input.deviceFingerprint ?? null,
      cardBin: input.cardBin ?? null,
      cardCountry: input.cardCountry ?? null,
      orderCountry: input.orderCountry ?? 'BR',
      amountCents: input.amountCents,
    });

    if (fraudDecision.action === 'block') {
      this.logger.warn(
        `Wallet top-up blocked by antifraud workspace=${input.workspaceId} method=${input.method} reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
      );
      throw new BadRequestException('Recarga bloqueada pela política antifraude.');
    }

    if (
      fraudDecision.action === 'review' ||
      (fraudDecision.action === 'require_3ds' && input.method !== 'card')
    ) {
      this.logger.warn(
        `Wallet top-up routed to review workspace=${input.workspaceId} method=${input.method} reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
      );
      throw new BadRequestException('Recarga retida para revisão manual.');
    }

    const wallet = await this.prisma.prepaidWallet.upsert({
      where: { workspaceId: input.workspaceId },
      create: { workspaceId: input.workspaceId },
      update: {},
    });

    const forceThreeDS = input.method === 'card' && fraudDecision.action === 'require_3ds';
    const intent = await this.stripeService.stripe.paymentIntents.create({
      amount: Number(input.amountCents),
      currency: wallet.currency.toLowerCase(),
      payment_method_types: [input.method === 'pix' ? 'pix' : 'card'],
      ...(forceThreeDS
        ? {
            payment_method_options: {
              card: {
                request_three_d_secure: 'any' as const,
              },
            },
          }
        : {}),
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
   * When `quotedCostCents` is present, bypasses `usage_prices` and charges
   * the direct provider quote instead.
   * Throws `InsufficientWalletBalanceError` when the balance is too low.
   * Idempotent on `(reference_type='usage:<operation>', reference_id=requestId, USAGE)`
   * so retried API calls don't double-debit.
   */
  async chargeForUsage(input: ChargeUsageInput): Promise<ChargeUsageResult> {
    const hasQuotedCost = input.quotedCostCents !== undefined;
    const hasUnits = input.units !== undefined;
    if (hasQuotedCost === hasUnits) {
      throw new RangeError(
        'chargeForUsage: provide exactly one pricing basis (units or quotedCostCents)',
      );
    }

    let costCents: bigint;
    let usageMetadata: Record<string, unknown>;

    if (hasQuotedCost) {
      if (!input.quotedCostCents || input.quotedCostCents <= 0n) {
        throw new RangeError(
          `chargeForUsage: quotedCostCents must be > 0 (got ${input.quotedCostCents?.toString() ?? 'undefined'})`,
        );
      }

      costCents = input.quotedCostCents;
      usageMetadata = {
        operation: input.operation,
        billingMode: 'provider_quote',
        quotedCostCents: costCents.toString(),
        ...(input.metadata ?? {}),
      };
    } else {
      if (!input.units || input.units <= 0 || !Number.isFinite(input.units)) {
        throw new RangeError(`chargeForUsage: units must be > 0 (got ${input.units})`);
      }

      const price = await this.prisma.usagePrice.findUnique({
        where: { operation: input.operation },
      });
      if (!price || !price.active) {
        throw new UsagePriceNotFoundError(input.operation);
      }

      costCents = price.pricePerUnitCents * BigInt(input.units);
      usageMetadata = {
        operation: input.operation,
        billingMode: 'catalog',
        units: input.units,
        pricePerUnitCents: price.pricePerUnitCents.toString(),
        ...(input.metadata ?? {}),
      };
    }

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
          metadata: usageMetadata as Prisma.InputJsonValue,
        },
      });

      return { newBalanceCents: newBalance, costCents, transaction };
    });
  }

  /**
   * Reconcile an estimated/provider-quoted debit against the exact provider
   * cost once the upstream request succeeds.
   */
  async settleUsageCharge(input: SettleUsageInput): Promise<PrepaidWalletTransaction | null> {
    if (input.actualCostCents < 0n) {
      throw new RangeError(
        `settleUsageCharge: actualCostCents must be >= 0 (got ${input.actualCostCents.toString()})`,
      );
    }

    const usageReferenceType = `usage:${input.operation}`;
    const settlementReferenceType = `adjust:${usageReferenceType}`;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.prepaidWalletTransaction.findFirst({
        where: {
          referenceType: settlementReferenceType,
          referenceId: input.requestId,
          type: 'ADJUSTMENT',
        },
      });
      if (existing) {
        return existing;
      }

      const originalUsage = await tx.prepaidWalletTransaction.findFirst({
        where: {
          referenceType: usageReferenceType,
          referenceId: input.requestId,
          type: 'USAGE',
        },
      });
      if (!originalUsage) {
        return null;
      }

      const wallet = await tx.prepaidWallet.findUnique({
        where: { id: originalUsage.walletId },
      });
      if (!wallet || wallet.workspaceId !== input.workspaceId) {
        throw new WalletNotFoundError(input.workspaceId);
      }

      const chargedCents =
        originalUsage.amountCents < 0n ? -originalUsage.amountCents : originalUsage.amountCents;
      const deltaCents = input.actualCostCents - chargedCents;
      if (deltaCents === 0n) {
        return null;
      }

      if (deltaCents > 0n && wallet.balanceCents < deltaCents) {
        throw new InsufficientWalletBalanceError(wallet.id, deltaCents, wallet.balanceCents);
      }

      const newBalance =
        deltaCents > 0n ? wallet.balanceCents - deltaCents : wallet.balanceCents + -deltaCents;
      await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: newBalance },
      });

      return tx.prepaidWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amountCents: -deltaCents,
          balanceAfterCents: newBalance,
          referenceType: settlementReferenceType,
          referenceId: input.requestId,
          metadata: {
            operation: input.operation,
            reason: input.reason,
            actualCostCents: input.actualCostCents.toString(),
            chargedCostCents: chargedCents.toString(),
            deltaCents: deltaCents.toString(),
            originalUsageTransactionId: originalUsage.id,
            ...(input.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Compensates a prior usage debit when the downstream operation failed after
   * the wallet had already been charged.
   */
  async refundUsageCharge(input: RefundUsageInput): Promise<PrepaidWalletTransaction | null> {
    const usageReferenceType = `usage:${input.operation}`;
    const refundReferenceType = `refund:${usageReferenceType}`;

    return this.prisma.$transaction(async (tx) => {
      const existingRefund = await tx.prepaidWalletTransaction.findFirst({
        where: {
          referenceType: refundReferenceType,
          referenceId: input.requestId,
          type: 'REFUND',
        },
      });
      if (existingRefund) {
        return existingRefund;
      }

      const originalUsage = await tx.prepaidWalletTransaction.findFirst({
        where: {
          referenceType: usageReferenceType,
          referenceId: input.requestId,
          type: 'USAGE',
        },
      });
      if (!originalUsage) {
        return null;
      }

      const wallet = await tx.prepaidWallet.findUnique({
        where: { id: originalUsage.walletId },
      });
      if (!wallet || wallet.workspaceId !== input.workspaceId) {
        throw new WalletNotFoundError(input.workspaceId);
      }

      const refundedCents =
        originalUsage.amountCents < 0n ? -originalUsage.amountCents : originalUsage.amountCents;
      const newBalance = wallet.balanceCents + refundedCents;
      await tx.prepaidWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: newBalance },
      });

      return tx.prepaidWalletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amountCents: refundedCents,
          balanceAfterCents: newBalance,
          referenceType: refundReferenceType,
          referenceId: input.requestId,
          metadata: {
            operation: input.operation,
            reason: input.reason,
            originalUsageTransactionId: originalUsage.id,
            ...(input.metadata ?? {}),
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /** Get balance. */
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
