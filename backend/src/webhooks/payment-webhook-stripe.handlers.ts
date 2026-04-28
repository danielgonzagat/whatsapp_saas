/**
 * Stripe webhook event handlers — financial events (refund, dispute, payout, account).
 * Extracted from PaymentWebhookStripeController to keep each file under 400 split-lines.
 * Payment-intent and checkout-session handlers live in payment-webhook-stripe.handlers2.ts.
 */
import { type WebhookEvent } from '@prisma/client';
import {
  FINANCIAL_TRANSACTION_OPTIONS,
  asRecord,
  asString,
  parseBigIntNumberish,
  type StripeEventLike,
} from './payment-webhook-types';

export type { StripeHandlerDeps } from './payment-webhook-stripe.deps';
import type { StripeHandlerDeps } from './payment-webhook-stripe.deps';

/**
 * Normalise a caught error, alert financial operations, and re-throw.
 * Every payment-webhook `$transaction` catch block must follow this contract
 * so that Stripe webhook retries receive a proper error signal.
 */
export async function handleRefundCreated(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
): Promise<void> {
  const refund = asRecord(event.data?.object);
  const refundId = asString(refund?.id);
  const paymentIntentId = asString(refund?.payment_intent);
  const requestedAmountCents = parseBigIntNumberish(refund?.amount);
  if (refundId && paymentIntentId && requestedAmountCents > 0n) {
    try {
      const reversal = await deps.connectReversalService.processRefund({
        paymentIntentId,
        refundId,
        amountCents: requestedAmountCents,
      });
      const checkoutContext = await deps.ledger.loadCheckoutPaymentContext(paymentIntentId);
      const workspaceId = checkoutContext?.order?.workspaceId ?? null;
      const orderId = checkoutContext?.orderId ?? null;
      await deps.prisma.$transaction(
        [
          deps.prisma.checkoutPayment.updateMany({
            where: { externalId: paymentIntentId },
            data: { status: 'REFUNDED' },
          }),
          ...(workspaceId && orderId
            ? [
                deps.prisma.checkoutOrder.updateMany({
                  where: { id: orderId, workspaceId },
                  data: { status: 'REFUNDED', refundedAt: new Date() },
                }),
                deps.prisma.kloelSale.updateMany({
                  where: { workspaceId, externalPaymentId: paymentIntentId },
                  data: { status: 'refunded' },
                }),
              ]
            : []),
        ],
        FINANCIAL_TRANSACTION_OPTIONS,
      );
      const marketplaceDebit = requestedAmountCents - reversal.reversedAmountCents;
      await deps.ledger.appendMarketplaceTreasuryReversal({
        triggerKind: 'refund',
        triggerId: refundId,
        paymentIntentId,
        requestedAmountCents,
        stakeholderReversedAmountCents: reversal.reversedAmountCents,
        marketplaceDebitCents: marketplaceDebit,
      });
      await deps.ledger.appendSaleReversalAudit({
        action: 'system.sale.refund_processed',
        paymentIntentId,
        orderId,
        workspaceId,
        triggerId: refundId,
        requestedAmountCents,
        stakeholderReversedAmountCents: reversal.reversedAmountCents,
        marketplaceDebitCents: marketplaceDebit,
      });
    } catch (error: unknown) {
      deps.financialAlert.webhookProcessingFailed(
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error'),
        { provider: 'stripe', externalId: paymentIntentId, eventType: event.type },
      );
      throw error;
    }
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
      );
    });
  }
}

export async function handleDisputeCreated(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
): Promise<void> {
  const dispute = asRecord(event.data?.object);
  const disputeId = asString(dispute?.id);
  const paymentIntentId = asString(dispute?.payment_intent);
  const requestedAmountCents = parseBigIntNumberish(dispute?.amount);
  if (disputeId && paymentIntentId && requestedAmountCents > 0n) {
    try {
      const reversal = await deps.connectReversalService.processDispute({
        paymentIntentId,
        disputeId,
        amountCents: requestedAmountCents,
      });
      const checkoutContext = await deps.ledger.loadCheckoutPaymentContext(paymentIntentId);
      const workspaceId = checkoutContext?.order?.workspaceId ?? null;
      const orderId = checkoutContext?.orderId ?? null;
      await deps.prisma.$transaction(
        [
          deps.prisma.checkoutPayment.updateMany({
            where: { externalId: paymentIntentId },
            data: { status: 'CHARGEBACK' },
          }),
          ...(workspaceId && orderId
            ? [
                deps.prisma.checkoutOrder.updateMany({
                  where: { id: orderId, workspaceId },
                  data: { status: 'CHARGEBACK' },
                }),
                deps.prisma.kloelSale.updateMany({
                  where: { workspaceId, externalPaymentId: paymentIntentId },
                  data: { status: 'chargeback' },
                }),
              ]
            : []),
        ],
        FINANCIAL_TRANSACTION_OPTIONS,
      );
      const marketplaceDebit = requestedAmountCents - reversal.reversedAmountCents;
      await deps.ledger.appendMarketplaceTreasuryReversal({
        triggerKind: 'dispute',
        triggerId: disputeId,
        paymentIntentId,
        requestedAmountCents,
        stakeholderReversedAmountCents: reversal.reversedAmountCents,
        marketplaceDebitCents: marketplaceDebit,
      });
      await deps.ledger.appendSaleReversalAudit({
        action: 'system.sale.chargeback_posted',
        paymentIntentId,
        orderId,
        workspaceId,
        triggerId: disputeId,
        requestedAmountCents,
        stakeholderReversedAmountCents: reversal.reversedAmountCents,
        marketplaceDebitCents: marketplaceDebit,
      });
    } catch (error) {
      deps.financialAlert.webhookProcessingFailed(error as Error, {
        provider: 'stripe',
        externalId: paymentIntentId,
        eventType: event.type,
      });
      throw error;
    }
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
      );
    });
  }
}

export async function handleDisputeClosed(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
): Promise<void> {
  const dispute = asRecord(event.data?.object);
  const disputeId = asString(dispute?.id);
  const disputeStatus = asString(dispute?.status);
  const paymentIntentId = asString(dispute?.payment_intent);

  if (disputeId && paymentIntentId) {
    const isWon = disputeStatus === 'won';
    const checkoutContext = await deps.ledger.loadCheckoutPaymentContext(paymentIntentId);
    const workspaceId = checkoutContext?.order?.workspaceId ?? null;
    const orderId = checkoutContext?.orderId ?? null;

    await deps.ledger.appendSaleReversalAudit({
      action: isWon ? 'system.sale.dispute_won' : 'system.sale.dispute_lost',
      paymentIntentId,
      orderId,
      workspaceId,
      triggerId: disputeId,
      requestedAmountCents: parseBigIntNumberish(dispute?.amount),
      stakeholderReversedAmountCents: 0n,
      marketplaceDebitCents: 0n,
    });

    if (isWon && workspaceId && orderId) {
      await deps.prisma.$transaction(
        [
          deps.prisma.checkoutPayment.updateMany({
            where: { externalId: paymentIntentId },
            data: { status: 'APPROVED' },
          }),
          deps.prisma.checkoutOrder.updateMany({
            where: { id: orderId, workspaceId },
            data: { status: 'PAID' },
          }),
          deps.prisma.kloelSale.updateMany({
            where: { workspaceId, externalPaymentId: paymentIntentId },
            data: { status: 'paid' },
          }),
        ],
        FINANCIAL_TRANSACTION_OPTIONS,
      );
    }
  }

  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
      );
    });
  }
}

export async function handlePayoutEvent(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
  stripeExternalId: string,
): Promise<void> {
  const payout = asRecord(event.data?.object);
  const payoutId = asString(payout?.id);
  const amountCents = parseBigIntNumberish(payout?.amount);
  const metadata = asRecord(payout?.metadata);
  const accountBalanceId = asString(metadata?.accountBalanceId);
  const requestId = asString(metadata?.requestId);
  const isMarketplaceTreasuryPayout = asString(metadata?.marketplaceTreasury) === 'true';
  const payoutCurrency =
    asString(metadata?.marketplaceTreasuryCurrency) ??
    (asString(payout?.currency)?.toUpperCase() || 'BRL');
  try {
    if (
      event.type === 'payout.failed' &&
      payoutId &&
      accountBalanceId &&
      requestId &&
      amountCents > 0n
    ) {
      await deps.connectPayoutService.handleFailedPayout({
        payoutId,
        accountBalanceId,
        requestId,
        amountCents,
      });
      await deps.ledger.appendConnectPayoutAudit({
        action: 'system.connect.payout_failed',
        accountBalanceId,
        payoutId,
        requestId,
        amountCents,
        status: 'failed',
      });
    } else if (
      event.type === 'payout.failed' &&
      payoutId &&
      requestId &&
      amountCents > 0n &&
      isMarketplaceTreasuryPayout
    ) {
      await deps.marketplaceTreasuryPayoutService.handleFailedPayout({
        payoutId,
        requestId,
        amountCents,
        currency: payoutCurrency,
      });
      await deps.ledger.appendMarketplaceTreasuryPayoutAudit({
        action: 'system.carteira.payout_failed',
        payoutId,
        requestId,
        amountCents,
        currency: payoutCurrency,
        status: 'failed',
      });
    } else if (
      event.type === 'payout.paid' &&
      payoutId &&
      accountBalanceId &&
      requestId &&
      amountCents > 0n
    ) {
      await deps.ledger.appendConnectPayoutAudit({
        action: 'system.connect.payout_paid',
        accountBalanceId,
        payoutId,
        requestId,
        amountCents,
        status: 'paid',
      });
    } else if (
      event.type === 'payout.paid' &&
      payoutId &&
      requestId &&
      amountCents > 0n &&
      isMarketplaceTreasuryPayout
    ) {
      await deps.ledger.appendMarketplaceTreasuryPayoutAudit({
        action: 'system.carteira.payout_paid',
        payoutId,
        requestId,
        amountCents,
        currency: payoutCurrency,
        status: 'paid',
      });
    }
  } catch (error: unknown) {
    deps.financialAlert.webhookProcessingFailed(
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error'),
      { provider: 'stripe', externalId: payoutId || stripeExternalId, eventType: event.type },
    );
    throw error;
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
      );
    });
  }
}

export { handleAccountUpdated } from './payment-webhook-stripe.handlers3';
