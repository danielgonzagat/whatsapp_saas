import { validatePaymentTransition } from '../../common/payment-state-machine';
import type { StripeHandlerDeps } from '../payment-webhook-stripe.handlers';
import type { StripeCheckoutSessionLike } from '../payment-webhook-types';

export async function updatePaymentAndSaleForSessionHelper(
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
    deps.financialAlert.webhookProcessingFailed(msg, {
      provider: 'stripe',
      externalId: stripePaymentExternalId,
      eventType: 'checkout.session.completed',
    });
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
    deps.financialAlert.webhookProcessingFailed(msg, {
      provider: 'stripe',
      externalId: stripePaymentExternalId,
      eventType: 'checkout.session.completed',
    });
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

export async function sendCheckoutConfirmationHelper(
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
    deps.financialAlert.webhookProcessingFailed(
      notifyErr instanceof Error ? notifyErr : new Error(notifyErrMsg),
      { provider: 'stripe', externalId: session.id, eventType: 'checkout.session.completed' },
    );
    deps.logger.error(`[STRIPE] Failed to notify customer ${customerPhone}: ${notifyErrMsg}`, {
      workspaceId,
      sessionId: session.id,
    });
    throw notifyErr;
  }
}
