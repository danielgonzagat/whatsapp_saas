/**
 * Stripe webhook event handlers — payment-intent and checkout-session events.
 * Extracted from PaymentWebhookStripeController to keep each file under 400 split-lines.
 * Financial reversal handlers (refund, dispute, payout, account) live in
 * payment-webhook-stripe.handlers.ts.
 */
import { BadRequestException } from '@nestjs/common';
import { type WebhookEvent } from '@prisma/client';
import type { StripePaymentIntent } from '../billing/stripe-types';
import {
  FINANCIAL_TRANSACTION_OPTIONS,
  D_RE,
  mapStripeIntentStatusForCheckout,
  type StripeEventLike,
  type StripePaymentIntentLike,
  type StripeCheckoutSessionLike,
} from './payment-webhook-types';
import type { StripeHandlerDeps } from './payment-webhook-stripe.handlers';
import {
  updatePaymentAndSaleForSessionHelper,
  sendCheckoutConfirmationHelper,
} from './__companions__/payment-webhook-stripe.handlers2.companion';

export type { StripeHandlerDeps };

export async function handlePaymentIntentEvent(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
  stripeExternalId: string,
): Promise<void> {
  const rawIntent = event.data?.object;
  const intent: StripePaymentIntentLike =
    rawIntent && typeof rawIntent === 'object' ? rawIntent : {};
  const workspaceId = intent.metadata?.workspace_id || intent.metadata?.workspaceId;
  const orderId = intent.metadata?.kloel_order_id || intent.metadata?.orderId;

  if (workspaceId) {
    const ws = await deps.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new BadRequestException('invalid_workspaceId');
  }

  const checkoutPaymentStatus = mapStripeIntentStatusForCheckout(
    event.type,
    intent.status || undefined,
  );
  const isApprovedSaleIntent =
    checkoutPaymentStatus === 'APPROVED' && intent.metadata?.type === 'sale';

  if (intent.id && !isApprovedSaleIntent) {
    await deps.prisma.checkoutPayment
      .updateMany({
        where: { externalId: intent.id },
        data: {
          status: checkoutPaymentStatus,
          ...(intent.next_action?.type === 'pix_display_qr_code'
            ? {
                pixQrCode: intent.next_action.pix_display_qr_code?.image_url_png || undefined,
                pixCopyPaste: intent.next_action.pix_display_qr_code?.data || undefined,
                pixExpiresAt:
                  typeof intent.next_action.pix_display_qr_code?.expires_at === 'number'
                    ? new Date(intent.next_action.pix_display_qr_code.expires_at * 1000)
                    : undefined,
              }
            : {}),
        },
      })
      .catch(() => undefined);
  }

  if (workspaceId && intent.id && !isApprovedSaleIntent) {
    if (checkoutPaymentStatus === 'APPROVED') {
      await deps.prisma
        // PULSE_OK: already in $transaction
        .$transaction(async (tx) => {
          await tx.kloelSale.updateMany({
            where: { workspaceId, externalPaymentId: intent.id },
            data: { status: 'paid', paidAt: new Date() },
          });
        }, FINANCIAL_TRANSACTION_OPTIONS)
        .catch(() => undefined);
    } else if (checkoutPaymentStatus === 'CANCELED') {
      await deps.prisma
        // PULSE_OK: already in $transaction
        .$transaction(async (tx) => {
          await tx.kloelSale.updateMany({
            where: { workspaceId, externalPaymentId: intent.id },
            data: { status: 'cancelled' },
          });
        }, FINANCIAL_TRANSACTION_OPTIONS)
        .catch(() => undefined);
    }
  }

  if (isApprovedSaleIntent) {
    try {
      const postSaleResult = await deps.stripeWebhookProcessor.processSaleSucceeded(
        intent as StripePaymentIntent,
        await deps.ledger.buildMatureAtResolver(orderId),
      );
      if (postSaleResult.skippedReason) {
        throw new Error(
          `Stripe post-sale processing skipped for paymentIntent=${intent.id || stripeExternalId}: ${postSaleResult.skippedReason}`,
        );
      }
      if (intent.id) {
        await deps.ledger.persistConnectPostSaleSnapshot(intent.id, postSaleResult.connectPostSale);
        await deps.ledger.appendMarketplaceTreasurySaleCredit(intent.id);
        await deps.prisma
          // PULSE_OK: already in $transaction
          .$transaction(async (tx) => {
            await tx.checkoutPayment.updateMany({
              where: { externalId: intent.id },
              data: { status: 'APPROVED' },
            });
            if (workspaceId) {
              await tx.kloelSale.updateMany({
                where: { workspaceId, externalPaymentId: intent.id },
                data: { status: 'paid', paidAt: new Date() },
              });
            }
          }, FINANCIAL_TRANSACTION_OPTIONS)
          .catch(() => undefined);
      }
    } catch (error: unknown) {
      deps.financialAlert.webhookProcessingFailed(error as Error, {
        provider: 'stripe',
        externalId: intent.id || stripeExternalId,
        eventType: event.type,
      });
      throw error;
    }
  }

  if (workspaceId && orderId) {
    await updateOrderStatusForIntent(deps, workspaceId, orderId, checkoutPaymentStatus);
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
  }
}

async function updateOrderStatusForIntent(
  deps: StripeHandlerDeps,
  workspaceId: string,
  orderId: string,
  checkoutPaymentStatus: string,
): Promise<void> {
  const currentOrder = await deps.prisma.checkoutOrder.findFirst({
    where: { id: orderId, workspaceId },
    select: { status: true, metadata: true, totalInCents: true },
  });
  if (checkoutPaymentStatus === 'APPROVED') {
    await deps.prisma.$transaction(async (tx) => {
      const resolvedOrder = await tx.checkoutOrder.findFirst({
        where: { id: orderId, workspaceId },
        select: { status: true },
      });

      if (!resolvedOrder) {
        deps.logger.warn(
          `Order ${orderId} not found during APPROVED webhook processing for workspace ${workspaceId}`,
        );
        return;
      }

      const currentStatus = resolvedOrder.status;

      if (currentStatus === 'PAID') {
        deps.logger.log(`Order ${orderId} already PAID; skipping redundant APPROVED transition`);
        return;
      }

      if (currentStatus !== 'PROCESSING') {
        deps.logger.warn(
          `Order ${orderId} entering PROCESSING (was ${currentStatus}) before PAID via webhook`,
        );
        await tx.checkoutOrder.updateMany({
          where: { id: orderId, workspaceId },
          data: { status: 'PROCESSING' },
        });
      }

      const updateResult = await tx.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId, status: 'PROCESSING' },
        data: { status: 'PAID', paidAt: new Date() },
      });

      if (updateResult.count > 0 && currentOrder) {
        // updateAffiliateCountersFromOrder not yet implemented — no-op for now
      }
    }, FINANCIAL_TRANSACTION_OPTIONS);
  } else if (checkoutPaymentStatus === 'PROCESSING') {
    await deps.prisma.checkoutOrder.updateMany({
      where: { id: orderId, workspaceId },
      data: { status: 'PROCESSING' },
    });
  } else if (checkoutPaymentStatus === 'CANCELED') {
    await deps.prisma.checkoutOrder.updateMany({
      where: { id: orderId, workspaceId },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
  }
}

export async function handleCheckoutSessionCompleted(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
): Promise<void> {
  const rawSession = event.data?.object;
  const session: StripeCheckoutSessionLike = rawSession ?? {};
  const workspaceId = session.metadata?.workspaceId;
  if (!workspaceId) throw new BadRequestException('missing_workspaceId');
  const ws = await deps.prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new BadRequestException('invalid_workspaceId');

  const email = session.customer_details?.email || session.customer_email;
  const phone = session.customer_details?.phone || session.metadata?.phone;
  const amount = session.amount_total ? session.amount_total / 100 : 0;
  const currency = session.currency?.toUpperCase() || 'BRL';

  let contact = null;
  if (email) contact = await deps.prisma.contact.findFirst({ where: { workspaceId, email } });
  if (!contact && phone) {
    contact = await deps.prisma.contact.findFirst({
      where: { workspaceId, phone: String(phone).replace(D_RE, '') },
    });
  }

  try {
    await updatePaymentAndSaleForSession(deps, session, workspaceId);
  } catch (finErr: unknown) {
    deps.financialAlert.webhookProcessingFailed(
      finErr instanceof Error
        ? finErr
        : new Error(typeof finErr === 'string' ? finErr : 'unknown_error'),
      { provider: 'stripe', externalId: session.id, eventType: event.type },
    );
    deps.logger.error(
      `[STRIPE] Financial update failed for session ${session.id}: ${finErr instanceof Error ? finErr.message : 'unknown_error'}`,
      { workspaceId, sessionId: session.id },
    );
    if (webhookEvent?.id) {
      await deps.webhooksService
        .markWebhookFailed(
          webhookEvent.id,
          finErr instanceof Error ? finErr.message : 'unknown_error',
        )
        .catch(() => {});
    }
    throw new BadRequestException('financial_update_failed');
  }

  const customerPhone =
    contact?.phone || phone ? String(contact?.phone || phone).replace(D_RE, '') : undefined;
  if (customerPhone) {
    await sendCheckoutConfirmation(deps, workspaceId, customerPhone, amount, currency, session);
  } else {
    deps.logger.warn(`[STRIPE] Sem telefone para notificar. Email: ${email}`);
  }

  await deps.autopilot.markConversion({
    workspaceId,
    contactId: contact?.id,
    phone: customerPhone,
    reason: 'stripe_paid',
    meta: {
      provider: 'stripe',
      paymentIntent: session.payment_intent || session.id,
      amount,
      currency,
      email,
      productName: session.metadata?.productName,
    },
  });

  if (contact?.id) {
    try {
      await deps.autopilot.triggerPostPurchaseFlow(workspaceId, contact.id, {
        provider: 'stripe',
        amount,
        productName: session.metadata?.productName,
      });
    } catch (flowErr: unknown) {
      const flowErrMsg = flowErr instanceof Error ? flowErr.message : 'unknown error';
      deps.financialAlert.webhookProcessingFailed(
        flowErr instanceof Error ? flowErr : new Error(flowErrMsg),
        { provider: 'stripe', externalId: session.id, eventType: event.type },
      );
      deps.logger.error(`[STRIPE] Post-purchase flow activation failed: ${flowErrMsg}`, {
        workspaceId,
        eventType: 'checkout.session.completed',
        stack: flowErr instanceof Error ? flowErr.stack : undefined,
      });
      throw flowErr;
    }
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((markErr: unknown) => {
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${
          markErr instanceof Error ? markErr.message : 'unknown_error'
        }`,
      );
    });
  }
}

async function updatePaymentAndSaleForSession(
  deps: StripeHandlerDeps,
  session: StripeCheckoutSessionLike,
  workspaceId: string,
): Promise<void> {
  return updatePaymentAndSaleForSessionHelper(deps, session, workspaceId);
}

async function sendCheckoutConfirmation(
  deps: StripeHandlerDeps,
  workspaceId: string,
  customerPhone: string,
  amount: number,
  currency: string,
  session: StripeCheckoutSessionLike,
): Promise<void> {
  return sendCheckoutConfirmationHelper(
    deps,
    workspaceId,
    customerPhone,
    amount,
    currency,
    session,
  );
}
