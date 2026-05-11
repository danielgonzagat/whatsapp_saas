import { Logger } from '@nestjs/common';
import type { GenericPaymentWebhookBody } from '../payment-webhook-types';
import type { PaymentWebhookNotifier } from '../payment-webhook-stripe.deps';

export async function sendGenericConfirmationViaTransport(
  whatsapp: PaymentWebhookNotifier,
  logger: Logger,
  workspaceId: string,
  normalizedPhone: string,
  body: GenericPaymentWebhookBody,
): Promise<void> {
  try {
    const amountText =
      typeof body.amount === 'number'
        ? body.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : undefined;
    const msg = `Pagamento confirmado.\n\n${amountText ? `Valor: R$ ${amountText}\n` : ''}${body.orderId ? `Pedido: ${body.orderId}\n` : ''}\nObrigado pela sua compra!`;
    await whatsapp.sendMessage(workspaceId, normalizedPhone, msg);
  } catch (notifyErr: unknown) {
    const notifyMsg =
      notifyErr instanceof Error
        ? notifyErr
        : new Error(typeof notifyErr === 'string' ? notifyErr : 'unknown error');
    logger.warn(`Falha ao notificar cliente (generic): ${notifyMsg?.message}`);
  }
}
