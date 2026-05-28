import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { Prisma, PrepaidWalletTransaction } from '@prisma/client';
import * as Sentry from '@sentry/node';

import { StripeService } from '../billing/stripe.service';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
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

const MP_WEBHOOK_PATH = '/webhooks/mercadopago';
const PIX_EXPIRATION_MINUTES = 30;
const WALLET_MERCADOPAGO_REFERENCE_TYPE = 'mercadopago_pix_topup';

function resolveBackendOrigin(): string {
  return (
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:3001'
  ).replace(/\/$/, '');
}

function formatMercadoPagoQrImage(qrCodeBase64: string): string | undefined {
  return qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : undefined;
}

function parseMercadoPagoWalletReference(
  raw: unknown,
): { workspaceId: string; walletId: string; nonce: string } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const externalReference = (raw as { external_reference?: unknown }).external_reference;
  if (typeof externalReference !== 'string' || !externalReference.startsWith('wallet_topup:')) {
    return null;
  }
  const [, workspaceId, walletId, nonce] = externalReference.split(':');
  if (!workspaceId || !walletId || !nonce) {
    throw new BadRequestException('mercadopago_wallet_topup_reference_invalid');
  }
  return { workspaceId, walletId, nonce };
}

function readMercadoPagoTransactionAmountCents(raw: unknown): bigint | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const amount = (raw as { transaction_amount?: unknown }).transaction_amount;
  const numericAmount =
    typeof amount === 'number' || typeof amount === 'string' ? Number(amount) : NaN;
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }
  return BigInt(Math.round(numericAmount * 100));
}

/**
 * Prepaid wallet for usage-metered services (AI agent, WhatsApp, generic API
 * calls). Independent of Stripe Connect: top-ups create direct PaymentIntents
 * on Kloel's marketplace-owned Stripe account; usage debits run as atomic
 * transactions inside `prisma.$transaction` so concurrent debits never
 * over-spend.
 */
@Injectable()
export class WalletService {
  private readonly logger = StructuredLogger.from(WalletService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    private readonly fraudEngine: FraudEngine,
    private readonly mercadoPagoPixCharge: MercadoPagoPixChargeService,
  ) {}

  /**
   * Create a prepaid wallet top-up on the canonical provider for the method:
   * Mercado Pago for PIX and Stripe for card. Provider webhooks reconcile the
   * approved payment idempotently against the wallet transaction ledger.
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

    if (input.method === 'pix') {
      const payerEmail = input.buyerEmail?.trim();
      if (!payerEmail) {
        throw new BadRequestException('E-mail do comprador e obrigatorio para recarga PIX.');
      }

      const nonce = randomUUID();
      const payerDocument =
        (input.buyerCpf ?? input.buyerCnpj ?? '').replace(/\D/g, '') || undefined;
      const charge = await this.mercadoPagoPixCharge.create({
        idempotencyKey: `wallet-topup:${input.workspaceId}:${nonce}`,
        amountCents: input.amountCents,
        payerEmail,
        ...(payerDocument ? { payerDocument } : {}),
        description: `Kloel prepaid wallet top-up - workspace ${input.workspaceId}`,
        externalReference: `wallet_topup:${input.workspaceId}:${wallet.id}:${nonce}`,
        expiresAt: new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000),
        notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
      });

      return {
        paymentIntentId: charge.externalId,
        clientSecret: null,
        ...(charge.qrCode ? { pixQrCode: charge.qrCode } : {}),
        ...(formatMercadoPagoQrImage(charge.qrCodeBase64)
          ? { pixQrCodeUrl: formatMercadoPagoQrImage(charge.qrCodeBase64) }
          : charge.ticketUrl
            ? { pixQrCodeUrl: charge.ticketUrl }
            : {}),
      };
    }

    const forceThreeDS = input.method === 'card' && fraudDecision.action === 'require_3ds';
    const intent = await this.stripeService.stripe.paymentIntents.create({
      amount: Number(input.amountCents),
      currency: wallet.currency.toLowerCase(),
      payment_method_types: ['card'],
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
        method: 'card',
      },
      description: `Kloel prepaid wallet top-up - workspace ${input.workspaceId}`,
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

    return this.prisma.$transaction(
      async (tx) => {
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

        const webhookWorkspaceId = paymentIntent.metadata?.workspace_id;
        const wallet = await tx.prepaidWallet.findFirst({
          where: {
            id: walletId,
            ...(webhookWorkspaceId ? { workspaceId: webhookWorkspaceId } : {}),
          },
        });
        if (!wallet) {
          this.logger.error(
            `creditFromWebhook: wallet ${walletId} referenced by PaymentIntent ${paymentIntent.id} not found`,
          );
          Sentry.captureException(
            new Error(`wallet_not_found_on_webhook: wallet=${walletId} pi=${paymentIntent.id}`),
            {
              extra: { walletId, paymentIntentId: paymentIntent.id },
            },
          );
          throw new WalletNotFoundError(walletId);
        }

        const newBalance = wallet.balanceCents + amountCents;
        await tx.prepaidWallet.updateMany({
          where: { id: wallet.id, workspaceId: wallet.workspaceId },
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
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async creditMercadoPagoTopup(input: {
    externalId: string;
    status: string;
    raw: unknown;
  }): Promise<PrepaidWalletTransaction | null> {
    if (input.status !== 'approved') {
      return null;
    }

    const reference = parseMercadoPagoWalletReference(input.raw);
    if (!reference) {
      return null;
    }

    const amountCents = readMercadoPagoTransactionAmountCents(input.raw);
    if (!amountCents || amountCents <= 0n) {
      this.logger.error(
        `creditMercadoPagoTopup: invalid amount for externalId=${input.externalId}`,
      );
      return null;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.prepaidWalletTransaction.findFirst({
          where: {
            referenceType: WALLET_MERCADOPAGO_REFERENCE_TYPE,
            referenceId: input.externalId,
            type: 'TOPUP',
          },
        });
        if (existing) {
          this.logger.debug(`creditMercadoPagoTopup idempotent skip: mp=${input.externalId}`);
          return existing;
        }

        const wallet = await tx.prepaidWallet.findFirst({
          where: { id: reference.walletId, workspaceId: reference.workspaceId },
        });
        if (!wallet) {
          this.logger.error(
            `creditMercadoPagoTopup: wallet ${reference.walletId} workspace=${reference.workspaceId} externalId=${input.externalId} not found`,
          );
          Sentry.captureException(
            new Error(
              `wallet_not_found_on_mercadopago_webhook: wallet=${reference.walletId} mp=${input.externalId}`,
            ),
            {
              extra: {
                walletId: reference.walletId,
                workspaceId: reference.workspaceId,
                externalId: input.externalId,
              },
            },
          );
          throw new WalletNotFoundError(reference.workspaceId);
        }

        const newBalance = wallet.balanceCents + amountCents;
        await tx.prepaidWallet.updateMany({
          where: { id: wallet.id, workspaceId: wallet.workspaceId },
          data: { balanceCents: newBalance },
        });

        return tx.prepaidWalletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'TOPUP',
            amountCents,
            balanceAfterCents: newBalance,
            referenceType: WALLET_MERCADOPAGO_REFERENCE_TYPE,
            referenceId: input.externalId,
            metadata: {
              provider: 'mercadopago',
              method: 'pix',
              status: input.status,
            } as Prisma.InputJsonValue,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
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

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.prepaidWalletTransaction.findFirst({
          where: { referenceType, referenceId: input.requestId, type: 'USAGE' },
        });
        if (existing) {
          const wallet = await tx.prepaidWallet.findFirst({
            where: { id: existing.walletId, workspaceId: input.workspaceId },
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
          Sentry.captureException(
            new Error(
              `prepaid_wallet_insufficient: id=${wallet.id} need=${costCents.toString()} have=${wallet.balanceCents.toString()}`,
            ),
            {
              extra: {
                walletId: wallet.id,
                workspaceId: wallet.workspaceId,
                operation: input.operation,
                costCents: costCents.toString(),
                balanceCents: wallet.balanceCents.toString(),
              },
            },
          );
          throw new InsufficientWalletBalanceError(wallet.id, costCents, wallet.balanceCents);
        }

        const newBalance = wallet.balanceCents - costCents;
        await tx.prepaidWallet.updateMany({
          where: { id: wallet.id, workspaceId: input.workspaceId },
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
      },
      { isolationLevel: 'ReadCommitted' },
    );
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

    return this.prisma.$transaction(
      async (tx) => {
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

        const wallet = await tx.prepaidWallet.findFirst({
          where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
        });
        if (!wallet) {
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
        await tx.prepaidWallet.updateMany({
          where: { id: wallet.id, workspaceId: input.workspaceId },
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
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /**
   * Compensates a prior usage debit when the downstream operation failed after
   * the wallet had already been charged.
   */
  async refundUsageCharge(input: RefundUsageInput): Promise<PrepaidWalletTransaction | null> {
    const usageReferenceType = `usage:${input.operation}`;
    const refundReferenceType = `refund:${usageReferenceType}`;

    return this.prisma.$transaction(
      async (tx) => {
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

        const wallet = await tx.prepaidWallet.findFirst({
          where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
        });
        if (!wallet) {
          throw new WalletNotFoundError(input.workspaceId);
        }

        const refundedCents =
          originalUsage.amountCents < 0n ? -originalUsage.amountCents : originalUsage.amountCents;
        const newBalance = wallet.balanceCents + refundedCents;
        await tx.prepaidWallet.updateMany({
          where: { id: wallet.id, workspaceId: input.workspaceId },
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
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
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
    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? null,
    };
  }
}
