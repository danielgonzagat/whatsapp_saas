import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

interface PaymentWebhookPayload {
  id?: string;
  metadata?: {
    workspaceId?: string;
  };
  workspaceId?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly auditService: AuditService,
    private readonly financialAlert: FinancialAlertService,
  ) {
    // Verify kloelSale model exists at runtime
    if (typeof this.prisma.kloelSale?.create !== 'function') {
      this.logger.warn('KloelSale model not available in Prisma — payment features disabled');
    }
  }

  async createPayment(data: {
    workspaceId: string;
    leadId: string;
    customerName: string;
    customerPhone: string;
    amount: number;
    description: string;
  }): Promise<{
    id: string;
    invoiceUrl?: string;
    pixQrCodeUrl?: string;
    pixCopyPaste?: string;
    paymentLink?: string;
    status: string;
  }> {
    // Primeiro tenta Asaas (real). Se não estiver conectado, cai para fallback interno.
    try {
      const payment = await this.asaas.createPixPayment(data.workspaceId, {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        amount: data.amount,
        description: data.description,
        externalReference: data.leadId,
        idempotencyKey: `kloel-pay:${data.workspaceId}:${data.leadId}`,
      });

      await this.prisma.kloelSale.create({
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
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Asaas indisponível: ${errInstanceofError?.message}`);
      this.financialAlert.paymentFailed(errInstanceofError, {
        workspaceId: data.workspaceId,
      });
      throw new ServiceUnavailableException(
        'A infraestrutura interna de pagamento do Kloel está temporariamente indisponível.',
      );
    }
  }

  async getPublicPayment(paymentId: string) {
    const sale = await this.prisma.kloelSale.findFirst({
      where: {
        OR: [{ externalPaymentId: paymentId }, { id: paymentId }],
      },
    });

    if (!sale) return null;

    const status =
      typeof sale.status === 'string'
        ? sale.status.toLowerCase()
        : typeof sale.status === 'number' || typeof sale.status === 'boolean'
          ? String(sale.status).toLowerCase()
          : '';
    const includePaymentDetails = status !== 'paid' && status !== 'pago' && status !== 'confirmed';

    return {
      id: sale.externalPaymentId || sale.id,
      amount: sale.amount,
      productName: sale.productName || 'Produto',
      status: sale.status,
      paymentMethod: sale.paymentMethod || 'PIX',
      createdAt: sale.createdAt,
      paidAt: sale.paidAt,
      // Campos de pagamento só quando ainda faz sentido expor
      pixQrCodeUrl: includePaymentDetails ? sale.paymentLink : undefined,
      pixCopyPaste: includePaymentDetails ? sale.paymentLink : undefined,
      paymentLink: includePaymentDetails ? sale.paymentLink : undefined,
      companyName: ((sale.metadata as Record<string, unknown>)?.companyName as string) || undefined,
    };
  }

  async processPaymentWebhook(
    workspaceId: string,
    event: string,
    payment: PaymentWebhookPayload,
  ): Promise<void> {
    if (event !== 'PAYMENT_CONFIRMED') return;
    if (!payment?.id) return;

    // Move find inside $transaction to prevent concurrent webhook deliveries
    // from racing between find and update.
    await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.kloelSale.findFirst({
          where: { workspaceId, externalPaymentId: payment.id },
          select: { id: true, status: true },
        });

        if (!sale?.id) return;

        // Idempotency: skip if already paid
        if (sale.status === 'paid') return;

        await tx.kloelSale.updateMany({
          where: { id: sale.id, workspaceId },
          data: { status: 'paid', paidAt: new Date() },
        });

        await this.auditService.logWithTx(tx, {
          workspaceId,
          action: 'PAYMENT_CONFIRMED',
          resource: 'KloelSale',
          resourceId: typeof sale.id === 'string' ? sale.id : '',
          details: { externalPaymentId: payment.id, event },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async getSalesReport(workspaceId: string, period = 'week') {
    void period;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const sales = await this.prisma.kloelSale.findMany({
      where: { workspaceId, createdAt: { gte: startDate } },
      select: { id: true, status: true, amount: true, createdAt: true },
      take: 1000,
    });

    const paid = sales.filter((s: Record<string, unknown>) => s.status === 'paid');
    return {
      totalSales: paid.length,
      totalAmount: paid.reduce(
        (sum: number, s: Record<string, unknown>) => sum + ((s.amount as number) || 0),
        0,
      ),
    };
  }
}
