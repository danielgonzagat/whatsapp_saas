import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  async createPayment(data: {
    workspaceId: string;
    leadId: string;
    customerName: string;
    customerPhone: string;
    amount: number;
    description: string;
  }): Promise<{ id: string; invoiceUrl?: string; pixQrCodeUrl?: string; pixCopyPaste?: string; paymentLink?: string; status: string }> {
    const prismaAny = this.prisma as any;

    // Primeiro tenta Asaas (real). Se não estiver conectado, cai para fallback interno.
    try {
      const payment = await this.asaas.createPixPayment(data.workspaceId, {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        amount: data.amount,
        description: data.description,
        externalReference: data.leadId,
      });

      await prismaAny.kloelSale.create({
        data: {
          leadId: data.leadId,
          status: 'pending',
          amount: data.amount,
          paymentMethod: 'PIX',
          paymentLink: payment.pixQrCodeUrl || payment.pixCopyPaste,
          externalPaymentId: payment.id,
          workspaceId: data.workspaceId,
        },
      });

      return {
        id: payment.id,
        invoiceUrl: payment.pixQrCodeUrl,
        pixQrCodeUrl: payment.pixQrCodeUrl,
        pixCopyPaste: payment.pixCopyPaste,
        paymentLink: payment.pixQrCodeUrl || payment.pixCopyPaste,
        status: payment.status,
      };
    } catch (err: any) {
      this.logger.warn(`Asaas indisponível, usando fallback: ${err?.message}`);
    }

    // Fallback simples (link fake) para não quebrar fluxo
    const paymentId = `pay_${Date.now()}`;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    await prismaAny.kloelSale.create({
      data: {
        leadId: data.leadId,
        status: 'pending',
        amount: data.amount,
        paymentMethod: 'PIX',
        paymentLink: `${baseUrl}/payment/${paymentId}`,
        externalPaymentId: paymentId,
        workspaceId: data.workspaceId,
      },
    });

    return {
      id: paymentId,
      invoiceUrl: `${baseUrl}/payment/${paymentId}`,
      paymentLink: `${baseUrl}/payment/${paymentId}`,
      status: 'PENDING',
    };
  }

  async processPaymentWebhook(event: string, payment: any): Promise<void> {
    const prismaAny = this.prisma as any;
    if (event === 'PAYMENT_CONFIRMED') {
      await prismaAny.kloelSale.update({
        where: { externalPaymentId: payment.id },
        data: { status: 'paid', paidAt: new Date() },
      });
    }
  }

  async getSalesReport(workspaceId: string, period: string = 'week') {
    const prismaAny = this.prisma as any;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const sales = await prismaAny.kloelSale.findMany({
      where: { workspaceId, createdAt: { gte: startDate } },
    });

    const paid = sales.filter((s: any) => s.status === 'paid');
    return {
      totalSales: paid.length,
      totalAmount: paid.reduce((sum: number, s: any) => sum + s.amount, 0),
    };
  }
}
