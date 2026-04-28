/**
 * Stripe webhook event handlers — payment-intent and checkout-session events.
 * Extracted from PaymentWebhookStripeController to keep each file under 400 split-lines.
 * Financial reversal handlers (refund, dispute, payout, account) live in
 * payment-webhook-stripe.handlers.ts.
 */
import { BadRequestException } from '@nestjs/common';
import { type WebhookEvent } from '@prisma/client';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { validatePaymentTransition } from '../common/payment-state-machine';
import {
  FINANCIAL_TRANSACTION_OPTIONS,
  D_RE,
  mapStripeIntentStatusForCheckout,
  type StripeEventLike,
  type StripePaymentIntentLike,
  type StripeCheckoutSessionLike,
} from './payment-webhook-types';
import type { StripeHandlerDeps } from './payment-webhook-stripe.handlers';

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
        .$transaction(async (tx) => {
          await tx.kloelSale.updateMany({
            where: { workspaceId, externalPaymentId: intent.id },
            data: { status: 'paid', paidAt: new Date() },
          });
        }, FINANCIAL_TRANSACTION_OPTIONS)
        .catch(() => undefined);
    } else if (checkoutPaymentStatus === 'CANCELED') {
      await deps.prisma
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
    } catch (error) {
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
    select: { status: true },
  });
  if (checkoutPaymentStatus === 'APPROVED') {
    if (currentOrder?.status !== 'PROCESSING' && currentOrder?.status !== 'PAID') {
      deps.logger.warn(
        `Invalid payment state transition: tried to move from ${currentOrder?.status} to PAID for order ${orderId}; enforcing PROCESSING intermediate state`,
      );
      await deps.prisma.$transaction(async (tx) => {
        await tx.checkoutOrder.updateMany({
          where: { id: orderId, workspaceId },
          data: { status: 'PROCESSING' },
        });
      }, FINANCIAL_TRANSACTION_OPTIONS);
    } else {
      await deps.prisma.$transaction(async (tx) => {
        await tx.checkoutOrder.updateMany({
          where: { id: orderId, workspaceId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }, FINANCIAL_TRANSACTION_OPTIONS);
    }
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
  const stripePaymentExternalId = session.payment_intent || session.id;
  try {
    if (deps.prisma.payment) {
      const existingPayment = await deps.prisma.payment.findFirst({
        where: { workspaceId, externalId: stripePaymentExternalId },
      });
      const canTransition =
        !existingPayment ||
        validatePaymentTransition(existingPayment.status || 'PENDING', 'RECEIVED', {
          paymentId: existingPayment?.id,
          provider: 'stripe',
          externalId: stripePaymentExternalId,
        });
      if (canTransition) {
        await deps.prisma.payment.updateMany({
          where: { workspaceId, externalId: stripePaymentExternalId },
          data: { status: 'RECEIVED' },
        });
      } else {
        deps.logger.warn(
          `Stripe webhook rejected by state machine: ${existingPayment?.status} -> RECEIVED for ${stripePaymentExternalId}`,
        );
      }
    }
  } catch (paymentErr: unknown) {
    const msg =
      paymentErr instanceof Error
        ? paymentErr
        : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
    deps.logger.error(
      `[STRIPE] Failed to update payment for ${stripePaymentExternalId}: ${msg?.message}`,
      {
        workspaceId,
        stripePaymentExternalId,
        stack: msg?.stack,
      },
    );
    throw msg;
  }
  try {
    if (deps.prisma.kloelSale) {
      await deps.prisma.kloelSale.updateMany({
        where: { workspaceId, externalPaymentId: stripePaymentExternalId },
        data: { status: 'paid', paidAt: new Date() },
      });
    }
  } catch (saleErr: unknown) {
    const msg =
      saleErr instanceof Error
        ? saleErr
        : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
    deps.logger.error(
      `[STRIPE] Failed to update KloelSale for ${stripePaymentExternalId}: ${msg?.message}`,
      {
        workspaceId,
        stripePaymentExternalId,
        stack: msg?.stack,
      },
    );
    throw msg;
  }
}

async function sendCheckoutConfirmation(
  deps: StripeHandlerDeps,
  workspaceId: string,
  customerPhone: string,
  amount: number,
  currency: string,
  session: StripeCheckoutSessionLike,
): Promise<void> {
  try {
    const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const confirmationMessage = `Pagamento confirmado.\n\nValor: ${currency === 'BRL' ? 'R$' : currency} ${formattedAmount}\nID: ${session.payment_intent || session.id}\n\nObrigado pela sua compra.\n\nSe tiver qualquer dúvida, estou à disposição.`;
    await deps.whatsapp.sendMessage(workspaceId, customerPhone, confirmationMessage);
    deps.logger.log(`[STRIPE] Notificação enviada para ${customerPhone}`);
  } catch (notifyErr: unknown) {
    const notifyErrMsg = notifyErr instanceof Error ? notifyErr.message : 'unknown error';
    deps.logger.error(`[STRIPE] Failed to notify customer ${customerPhone}: ${notifyErrMsg}`, {
      workspaceId,
      sessionId: session.id,
    });
    throw notifyErr;
  }
}
