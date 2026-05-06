import { Logger } from '@nestjs/common';
import { validatePaymentTransition } from '../../common/payment-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import type { GenericPaymentWebhookBody } from '../payment-webhook-types';

export async function updateSaleAndPaymentHelper(
  prisma: PrismaService,
  logger: Logger,
  body: GenericPaymentWebhookBody,
  workspaceId: string,
): Promise<void> {
  if (body.orderId || body.provider) {
    try {
      await prisma.kloelSale.updateMany({
        where: {
          workspaceId,
          OR: [
            body.orderId ? { externalPaymentId: String(body.orderId) } : undefined,
            body.orderId ? { id: String(body.orderId) } : undefined,
          ].filter(Boolean) as Array<{ externalPaymentId: string } | { id: string }>,
        },
        data: { status: 'paid', paidAt: new Date() },
      });
    } catch (saleErr: unknown) {
      const msg =
        saleErr instanceof Error
          ? saleErr
          : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
      logger.warn(`Não foi possível atualizar KloelSale (generic): ${msg?.message}`);
    }
  }
  if (body.orderId) {
    try {
      const genericExternalRef = String(body.orderId);
      const existingGenericPayment = await prisma.payment.findFirst({
        where: { workspaceId, externalId: genericExternalRef },
      });
      const canTransitionGeneric =
        !existingGenericPayment ||
        validatePaymentTransition(existingGenericPayment.status || 'PENDING', 'RECEIVED', {
          paymentId: existingGenericPayment?.id,
          provider: body.provider || 'generic',
          externalId: genericExternalRef,
        });
      if (canTransitionGeneric) {
        await prisma.payment.updateMany({
          where: { workspaceId, externalId: genericExternalRef },
          data: { status: 'RECEIVED' },
        });
      } else {
        logger.warn(
          `Generic webhook rejected by state machine: ${existingGenericPayment?.status} -> RECEIVED for ${genericExternalRef}`,
        );
      }
    } catch (paymentErr: unknown) {
      const msg =
        paymentErr instanceof Error
          ? paymentErr
          : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
      logger.warn(`Não foi possível atualizar Payment (generic): ${msg?.message}`);
    }
  }
}

export async function sendGenericConfirmationHelper(
  whatsapp: WhatsappService,
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
