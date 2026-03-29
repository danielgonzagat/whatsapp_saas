import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('checkout/webhooks')
export class CheckoutWebhookController {
  private readonly logger = new Logger(CheckoutWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('asaas')
  @HttpCode(200)
  async handleAsaasWebhook(@Body() body: any) {
    const { event, payment } = body;
    this.logger.log(`Checkout Asaas webhook: ${event} for payment ${payment?.id}`);

    if (!payment?.id) return { received: true };

    const checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: payment.id },
    });

    if (!checkoutPayment) {
      this.logger.warn(`CheckoutPayment not found for externalId: ${payment.id}`);
      return { received: true };
    }

    const statusMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'APPROVED',
      PAYMENT_RECEIVED: 'APPROVED',
      PAYMENT_OVERDUE: 'EXPIRED',
      PAYMENT_DELETED: 'CANCELED',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    };

    const newStatus = statusMap[event];
    if (!newStatus) return { received: true };

    await this.prisma.checkoutPayment.update({
      where: { id: checkoutPayment.id },
      data: { status: newStatus as any },
    });

    if (newStatus === 'APPROVED') {
      await this.prisma.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }

    if (newStatus === 'CANCELED' || newStatus === 'EXPIRED') {
      await this.prisma.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: { status: 'CANCELED' },
      });
    }

    if (newStatus === 'REFUNDED') {
      await this.prisma.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: { status: 'REFUNDED' },
      });
    }

    return { received: true, processed: true };
  }
}
