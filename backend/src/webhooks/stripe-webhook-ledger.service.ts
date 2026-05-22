import { Injectable, Logger } from '@nestjs/common';
import {
  MarketplaceTreasuryBucket,
  MarketplaceTreasuryLedgerKind,
  type ConnectAccountType,
} from '@prisma/client';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { MarketplaceTreasuryService } from '../marketplace-treasury/marketplace-treasury.service';
import type { ConnectPostSaleSnapshot } from '../payments/stripe/stripe-webhook.processor';
import type { SplitRole } from '../payments/split/split.types';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_TO_ACCOUNT_TYPE, asRecord, parseBigIntNumberish } from './payment-webhook-types';

/**
 * Handles the ledger / audit side-effects that follow a Stripe webhook event:
 * - Persisting connect post-sale snapshots onto CheckoutPayment
 * - Appending MarketplaceTreasury credits and debits
 * - Appending AdminAudit trails for payouts, reversals, and sales
 * - Building the `matureAt` resolver used by the SplitEngine
 *
 * Extracted from PaymentWebhookStripeController to keep each file under 600 lines.
 */
@Injectable()
export class StripeWebhookLedgerService {
  private readonly logger = new Logger(StripeWebhookLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketplaceTreasury: MarketplaceTreasuryService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  /** Load the checkout payment context for a Stripe payment intent. */
  async loadCheckoutPaymentContext(paymentIntentId: string) {
    return this.prisma.checkoutPayment.findFirst({
      where: { externalId: paymentIntentId },
      select: {
        orderId: true,
        webhookData: true,
        order: { select: { workspaceId: true } },
      },
    });
  }

  /** Persist connect post-sale split snapshot onto the CheckoutPayment record. */
  async persistConnectPostSaleSnapshot(
    paymentIntentId: string,
    connectPostSale: ConnectPostSaleSnapshot | undefined,
  ): Promise<void> {
    if (!connectPostSale) {
      return;
    }
    const payment = await this.loadCheckoutPaymentContext(paymentIntentId);
    const webhookData = asRecord(payment?.webhookData) ?? {};

    await this.prisma.checkoutPayment.updateMany({
      where: { externalId: paymentIntentId },
      data: {
        webhookData: {
          ...webhookData,
          connectPostSale: {
            transferGroup: connectPostSale.transferGroup,
            sellerStripeAccountId: connectPostSale.sellerStripeAccountId,
            sellerDestinationAmountCents: connectPostSale.sellerDestinationAmountCents.toString(),
            transfers: connectPostSale.transfers.map((transfer) => ({
              role: transfer.role,
              accountId: transfer.accountId,
              amountCents: transfer.amountCents.toString(),
              stripeTransferId: transfer.stripeTransferId,
            })),
          },
        },
      },
    });
  }

  /** Append a marketplace treasury credit entry for a successful sale. */
  async appendMarketplaceTreasurySaleCredit(paymentIntentId: string): Promise<void> {
    const payment = await this.loadCheckoutPaymentContext(paymentIntentId);
    const webhookData = asRecord(payment?.webhookData);
    const splitInput = asRecord(webhookData?.splitInput);
    if (!splitInput) {
      return;
    }

    const marketplaceFeeCents = parseBigIntNumberish(splitInput.marketplaceFeeCents);
    const interestCents = parseBigIntNumberish(splitInput.interestCents);
    const totalCreditCents = marketplaceFeeCents + interestCents;
    if (totalCreditCents <= 0n) {
      return;
    }

    await this.appendMarketplaceTreasuryEntry(
      {
        direction: 'credit',
        bucket: MarketplaceTreasuryBucket.PENDING,
        amountInCents: totalCreditCents,
        kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
        orderId: `sale:${paymentIntentId}`,
        reason: 'stripe_sale_marketplace_fee_credit',
        metadata: {
          paymentIntentId,
          marketplaceFeeCents: marketplaceFeeCents.toString(),
          interestCents: interestCents.toString(),
        },
      },
      `sale:${paymentIntentId}`,
      MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
    );
  }

  /** Append marketplace treasury debit entries for a refund or dispute. */
  async appendMarketplaceTreasuryReversal(args: {
    triggerKind: 'refund' | 'dispute';
    triggerId: string;
    paymentIntentId: string;
    requestedAmountCents: bigint;
    stakeholderReversedAmountCents: bigint;
    marketplaceDebitCents: bigint;
  }): Promise<void> {
    if (args.marketplaceDebitCents <= 0n) {
      return;
    }

    const kind =
      args.triggerKind === 'refund'
        ? MarketplaceTreasuryLedgerKind.REFUND_DEBIT
        : MarketplaceTreasuryLedgerKind.CHARGEBACK_DEBIT;
    const reason =
      args.triggerKind === 'refund'
        ? 'stripe_refund_marketplace_debit'
        : 'stripe_chargeback_marketplace_debit';
    const baseOrderId = `${args.triggerKind}:${args.triggerId}`;
    const balance = await this.marketplaceTreasury.readBalance('BRL');
    const pendingBalanceCents = BigInt(balance.pendingInCents);
    const pendingDebitCents =
      pendingBalanceCents > 0n
        ? pendingBalanceCents >= args.marketplaceDebitCents
          ? args.marketplaceDebitCents
          : pendingBalanceCents
        : 0n;
    const availableDebitCents = args.marketplaceDebitCents - pendingDebitCents;
    const metadata = {
      paymentIntentId: args.paymentIntentId,
      ...(args.triggerKind === 'refund'
        ? { refundId: args.triggerId }
        : { disputeId: args.triggerId }),
      buyerRequestedAmountCents: args.requestedAmountCents.toString(),
      stakeholderReversedAmountCents: args.stakeholderReversedAmountCents.toString(),
    };

    if (pendingDebitCents > 0n) {
      const orderId = availableDebitCents > 0n ? `${baseOrderId}:pending` : baseOrderId;
      await this.appendMarketplaceTreasuryEntry(
        {
          direction: 'debit',
          bucket: MarketplaceTreasuryBucket.PENDING,
          amountInCents: pendingDebitCents,
          kind,
          orderId,
          reason,
          metadata,
        },
        orderId,
        kind,
      );
    }

    if (availableDebitCents > 0n) {
      const orderId = pendingDebitCents > 0n ? `${baseOrderId}:available` : baseOrderId;
      await this.appendMarketplaceTreasuryEntry(
        {
          direction: 'debit',
          bucket: MarketplaceTreasuryBucket.AVAILABLE,
          amountInCents: availableDebitCents,
          kind,
          orderId,
          reason,
          metadata,
        },
        orderId,
        kind,
      );
    }
  }

  private async appendMarketplaceTreasuryEntry(
    input: Parameters<MarketplaceTreasuryService['append']>[0],
    orderId: string,
    kind: MarketplaceTreasuryLedgerKind,
  ): Promise<void> {
    try {
      await this.marketplaceTreasury.append(input);
    } catch (error: unknown) {
      if ((error as { code?: string } | null)?.code === 'P2002') {
        this.logger.debug(
          `Marketplace treasury entry already recorded orderId=${orderId} kind=${kind}`,
        );
        return;
      }
      throw error;
    }
  }

  /** Append an audit trail entry for a marketplace treasury payout event. */
  async appendMarketplaceTreasuryPayoutAudit(input: {
    action: string;
    payoutId: string;
    requestId: string;
    amountCents: bigint;
    currency: string;
    status: 'failed' | 'paid';
  }): Promise<void> {
    await this.adminAudit.append({
      action: input.action,
      entityType: 'marketplace_treasury',
      entityId: input.currency,
      details: {
        requestId: input.requestId,
        payoutId: input.payoutId,
        status: input.status,
        amountCents: input.amountCents.toString(),
        currency: input.currency,
      },
    });
  }

  /** Append an audit trail entry for a Connect account payout event. */
  async appendConnectPayoutAudit(input: {
    action: string;
    accountBalanceId: string;
    payoutId: string;
    requestId: string;
    amountCents: bigint;
    status: 'failed' | 'paid';
  }): Promise<void> {
    const balance = await this.prisma.connectAccountBalance.findUnique({
      where: { id: input.accountBalanceId },
      select: { workspaceId: true, accountType: true, stripeAccountId: true },
    });

    await this.adminAudit.append({
      action: input.action,
      entityType: 'connect_account_balance',
      entityId: input.accountBalanceId,
      details: {
        requestId: input.requestId,
        payoutId: input.payoutId,
        status: input.status,
        amountCents: input.amountCents.toString(),
        accountBalanceId: input.accountBalanceId,
        workspaceId: balance?.workspaceId ?? null,
        accountType: balance?.accountType ?? null,
        stripeAccountId: balance?.stripeAccountId ?? null,
      },
    });
  }

  /** Append an audit trail entry for a sale reversal (refund or chargeback). */
  async appendSaleReversalAudit(input: {
    action: string;
    paymentIntentId: string;
    orderId: string | null;
    workspaceId: string | null;
    triggerId: string;
    requestedAmountCents: bigint;
    stakeholderReversedAmountCents: bigint;
    marketplaceDebitCents: bigint;
  }): Promise<void> {
    await this.adminAudit.append({
      action: input.action,
      entityType: 'checkout_order',
      entityId: input.orderId ?? input.paymentIntentId,
      details: {
        paymentIntentId: input.paymentIntentId,
        orderId: input.orderId,
        workspaceId: input.workspaceId,
        triggerId: input.triggerId,
        requestedAmountCents: input.requestedAmountCents.toString(),
        stakeholderReversedAmountCents: input.stakeholderReversedAmountCents.toString(),
        marketplaceDebitCents: input.marketplaceDebitCents.toString(),
      },
    });
  }

  /** Build a `matureAt` resolver function based on ConnectMaturationRule records. */
  async buildMatureAtResolver(orderId?: string) {
    const now = new Date();
    if (!orderId) {
      return (role: SplitRole) => this.offsetDays(now, this.defaultDelayDays(role));
    }

    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      // workspaceId included as the tenant anchor for this Stripe-event-driven
      // order lookup; downstream callers can surface it for observability.
      select: { workspaceId: true, plan: { select: { productId: true } } },
    });
    const productId = order?.plan?.productId;
    if (!productId) {
      return (role: SplitRole) => this.offsetDays(now, this.defaultDelayDays(role));
    }

    const rules = await this.prisma.connectMaturationRule.findMany({
      where: { active: true, OR: [{ productId }, { productId: null }] },
      select: { productId: true, accountType: true, delayDays: true },
    });

    const delayByType = new Map<ConnectAccountType, number>();
    for (const rule of rules
      .slice()
      .sort((l, r) => Number(Boolean(r.productId)) - Number(Boolean(l.productId)))) {
      if (!delayByType.has(rule.accountType)) {
        delayByType.set(rule.accountType, rule.delayDays);
      }
    }

    return (role: SplitRole) =>
      this.offsetDays(
        now,
        delayByType.get(ROLE_TO_ACCOUNT_TYPE[role]) ?? this.defaultDelayDays(role),
      );
  }

  private defaultDelayDays(_role: SplitRole) {
    return 0;
  }

  private offsetDays(base: Date, delayDays: number) {
    return new Date(base.getTime() + delayDays * 24 * 60 * 60 * 1000);
  }
}
