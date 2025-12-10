import { Controller, Post, Req, Headers, ForbiddenException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AutopilotService } from '../autopilot/autopilot.service';
import { Logger } from '@nestjs/common';

@Controller('webhooks/asaas')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly autopilot: AutopilotService,
  ) {}

  @Public()
  @Post()
  async handle(@Headers('x-asaas-token') token: string, @Req() req: any) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('invalid_asaas_token');
    }

    const event = req.body || {};
    const payment = event.payment || event;
    const status = (payment?.status || '').toUpperCase();

    const isPaid = status === 'CONFIRMED' || status === 'RECEIVED' || status === 'PAID';
    if (!isPaid) {
      return { received: true, ignored: true, reason: 'status_not_paid' };
    }

    const workspaceId =
      payment?.metadata?.workspaceId ||
      event.workspaceId ||
      payment?.workspaceId ||
      'default';

    const contactId = payment?.customerId || payment?.externalReference || event?.contactId;

    // Busca contato por ID, e-mail ou telefone
    let contact: any = null;
    if (workspaceId !== 'default') {
      const phoneCandidate =
        payment?.customer?.mobilePhone ||
        payment?.customer?.phone ||
        event?.phone;
      const normalizedPhone = phoneCandidate ? String(phoneCandidate).replace(/\D/g, '') : undefined;

      contact = await this.prisma.contact.findFirst({
        where: {
          workspaceId,
          OR: [
            contactId ? { id: contactId } : undefined,
            payment?.customer?.email ? { email: payment.customer.email } : undefined,
            normalizedPhone ? { phone: normalizedPhone } : undefined,
          ].filter(Boolean) as any,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    const phone =
      contact?.phone ||
      (payment?.customer?.mobilePhone ? String(payment.customer.mobilePhone).replace(/\D/g, '') : undefined) ||
      (payment?.customer?.phone ? String(payment.customer.phone).replace(/\D/g, '') : undefined) ||
      (event?.phone ? String(event.phone).replace(/\D/g, '') : undefined);

    if (workspaceId !== 'default') {
      const paymentModel = (this.prisma as any).payment;
      if (paymentModel?.updateMany) {
        try {
          await paymentModel.updateMany({
            where: { workspaceId, externalId: payment?.id || payment?.invoiceNumber },
            data: { status: 'RECEIVED' },
          });
        } catch (err: any) {
          this.logger.warn(`Não foi possível atualizar pagamento Asaas: ${err?.message}`);
        }
      } else {
        this.logger.warn('Modelo payment não disponível no PrismaService; skip updateMany');
      }
    }

    // Marca conversão no autopilot
    await this.autopilot.markConversion({
      workspaceId,
      contactId: contact?.id || contactId,
      phone,
      reason: 'asaas_paid',
      meta: {
        provider: 'asaas',
        paymentId: payment?.id,
        amount: payment?.value || payment?.amount,
        status,
      },
    });

    if (phone && workspaceId !== 'default') {
      try {
        await this.whatsapp.sendMessage(
          workspaceId,
          phone,
          'Pagamento confirmado! Obrigado pela sua compra.',
        );
        this.logger.log(`Notificação de pagamento enviada para ${phone}`);
      } catch (notifyErr: any) {
        this.logger.warn(`Falha ao notificar cliente Asaas: ${notifyErr?.message}`);
      }
    }

    return { received: true };
  }
}
