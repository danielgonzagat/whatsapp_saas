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
import {
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  absAmountCents,
  buildExistingTxQuery,
  assertExclusivePricingBasis,
  assertNonNegativeActualCost,
  assertPositiveTopupAmount,
  assertValidQuotedCost,
  assertValidUsageUnits,
  buildFraudReasonsLog,
  classifyTopupFraudDecision,
  buildInsufficientBalanceReport,
  buildMercadoPagoTopupTransactionMetadata,
  buildPixTopupChargeRequest,
  buildRefundMetadata,
  buildSettlementMetadata,
  buildStripeTopupIntentParams,
  buildStripeTopupTransactionMetadata,
  buildUsageMetadata,
  buildWalletNotFoundOnMercadoPagoWebhookReport,
  buildWalletNotFoundOnStripeWebhookReport,
  normalizePayerDocument,
  parseMercadoPagoWalletReference,
  readMercadoPagoTransactionAmountCents,
  shapePixTopupResult,
  shapeStripeIntentResult,
} from './wallet.service.helpers';

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
    assertPositiveTopupAmount(input.amountCents);

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

    const fraudGate = classifyTopupFraudDecision(fraudDecision, input.method);
    if (fraudGate !== 'allow') {
      const reasonsCsv = buildFraudReasonsLog(fraudDecision.reasons);
      const tag = fraudGate === 'block' ? 'blocked by antifraud' : 'routed to review';
      this.logger.warn(
        `Wallet top-up ${tag} workspace=${input.workspaceId} method=${input.method} reasons=${reasonsCsv}`,
      );
      throw new BadRequestException(
        fraudGate === 'block'
          ? 'Recarga bloqueada pela política antifraude.'
          : 'Recarga retida para revisão manual.',
      );
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

      const charge = await this.mercadoPagoPixCharge.create(
        buildPixTopupChargeRequest({
          workspaceId: input.workspaceId,
          walletId: wallet.id,
          amountCents: input.amountCents,
          payerEmail,
          payerDocument: normalizePayerDocument(input.buyerCpf, input.buyerCnpj),
          nonce: randomUUID(),
          now: new Date(),
        }),
      );
      return shapePixTopupResult(charge);
    }

    const intent = await this.stripeService.stripe.paymentIntents.create(
      buildStripeTopupIntentParams({
        amountCents: input.amountCents,
        currency: wallet.currency,
        workspaceId: input.workspaceId,
        walletId: wallet.id,
        forceThreeDS: input.method === 'card' && fraudDecision.action === 'require_3ds',
      }),
    );

    return shapeStripeIntentResult(intent);
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
        const existing = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery('stripe_topup', paymentIntent.id, 'TOPUP'),
        );
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
          const report = buildWalletNotFoundOnStripeWebhookReport({
            walletId,
            paymentIntentId: paymentIntent.id,
          });
          Sentry.captureException(report.error, { extra: report.extra });
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
            metadata: buildStripeTopupTransactionMetadata({
              paymentMethod: paymentIntent.metadata?.method,
            }),
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
        const existing = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(WALLET_MERCADOPAGO_REFERENCE_TYPE, input.externalId, 'TOPUP'),
        );
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
          const report = buildWalletNotFoundOnMercadoPagoWebhookReport({
            walletId: reference.walletId,
            workspaceId: reference.workspaceId,
            externalId: input.externalId,
          });
          Sentry.captureException(report.error, { extra: report.extra });
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
            metadata: buildMercadoPagoTopupTransactionMetadata({
              status: input.status,
            }),
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
    assertExclusivePricingBasis(hasQuotedCost, hasUnits);

    let costCents: bigint;
    let usageMetadata: Record<string, unknown>;

    if (hasQuotedCost) {
      assertValidQuotedCost(input.quotedCostCents);
      costCents = input.quotedCostCents;
      usageMetadata = buildUsageMetadata({
        operation: input.operation,
        billingMode: 'provider_quote',
        costCents,
        callerMetadata: input.metadata,
      });
    } else {
      assertValidUsageUnits(input.units);

      const price = await this.prisma.usagePrice.findUnique({
        where: { operation: input.operation },
      });
      if (!price || !price.active) {
        throw new UsagePriceNotFoundError(input.operation);
      }

      costCents = price.pricePerUnitCents * BigInt(input.units);
      usageMetadata = buildUsageMetadata({
        operation: input.operation,
        billingMode: 'catalog',
        costCents,
        units: input.units,
        pricePerUnitCents: price.pricePerUnitCents,
        callerMetadata: input.metadata,
      });
    }

    const referenceType = `usage:${input.operation}`;

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(referenceType, input.requestId, 'USAGE'),
        );
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
          const report = buildInsufficientBalanceReport({
            walletId: wallet.id,
            workspaceId: wallet.workspaceId,
            operation: input.operation,
            costCents,
            balanceCents: wallet.balanceCents,
          });
          Sentry.captureException(report.error, { extra: report.extra });
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
    assertNonNegativeActualCost(input.actualCostCents);

    const usageReferenceType = `usage:${input.operation}`;
    const settlementReferenceType = `adjust:${usageReferenceType}`;

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(settlementReferenceType, input.requestId, 'ADJUSTMENT'),
        );
        if (existing) {
          return existing;
        }

        const originalUsage = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(usageReferenceType, input.requestId, 'USAGE'),
        );
        if (!originalUsage) {
          return null;
        }

        const wallet = await tx.prepaidWallet.findFirst({
          where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
        });
        if (!wallet) {
          throw new WalletNotFoundError(input.workspaceId);
        }

        const chargedCents = absAmountCents(originalUsage.amountCents);
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
            metadata: buildSettlementMetadata({
              operation: input.operation,
              reason: input.reason,
              actualCostCents: input.actualCostCents,
              chargedCostCents: chargedCents,
              deltaCents,
              originalUsageTransactionId: originalUsage.id,
              callerMetadata: input.metadata,
            }) as Prisma.InputJsonValue,
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
        const existingRefund = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(refundReferenceType, input.requestId, 'REFUND'),
        );
        if (existingRefund) {
          return existingRefund;
        }

        const originalUsage = await tx.prepaidWalletTransaction.findFirst(
          buildExistingTxQuery(usageReferenceType, input.requestId, 'USAGE'),
        );
        if (!originalUsage) {
          return null;
        }

        const wallet = await tx.prepaidWallet.findFirst({
          where: { id: originalUsage.walletId, workspaceId: input.workspaceId },
        });
        if (!wallet) {
          throw new WalletNotFoundError(input.workspaceId);
        }

        const refundedCents = absAmountCents(originalUsage.amountCents);
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
            metadata: buildRefundMetadata({
              operation: input.operation,
              reason: input.reason,
              originalUsageTransactionId: originalUsage.id,
              callerMetadata: input.metadata,
            }) as Prisma.InputJsonValue,
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
}
