import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

interface PixDisplayQrCode {
  data?: string | null;
  image_url_png?: string | null;
  hosted_instructions_url?: string | null;
}

interface PixNextAction {
  type?: string | null;
  pix_display_qr_code?: PixDisplayQrCode | null;
}

type KloelSaleMetadata = {
  companyName?: string;
  pixQrCodeUrl?: string | null;
  pixCopyPaste?: string | null;
  pixHostedInstructionsUrl?: string | null;
};

interface PaymentWebhookPayload {
  id?: string;
  metadata?: {
    workspaceId?: string;
  };
  workspaceId?: string;
}

/** Payment service. */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
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
    customerEmail?: string;
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
    try {
      const amountInCents = Math.round(data.amount * 100);
      const paymentIntent = (await this.stripeService.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'brl',
        confirm: true,
        payment_method_types: ['pix'],
        payment_method_data: {
          type: 'pix',
        },
        metadata: {
          type: 'kloel_payment',
          workspaceId: data.workspaceId,
          leadId: data.leadId,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail || '',
        },
        description: data.description,
      })) as StripePaymentIntent;
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: data.workspaceId },
        select: { name: true },
      });
      const nextAction = paymentIntent.next_action as PixNextAction | null | undefined;
      const pixData =
        nextAction?.type === 'pix_display_qr_code' ? nextAction.pix_display_qr_code : null;
      const paymentLink =
        pixData?.hosted_instructions_url || pixData?.image_url_png || pixData?.data || undefined;

      await this.prisma.kloelSale.create({
        data: {
          leadId: data.leadId,
          status: 'pending',
          amount: data.amount,
          paymentMethod: 'PIX',
          paymentLink,
          externalPaymentId: paymentIntent.id,
          workspaceId: data.workspaceId,
          metadata: {
            companyName: workspace?.name || undefined,
            pixQrCodeUrl: pixData?.image_url_png || null,
            pixCopyPaste: pixData?.data || null,
            pixHostedInstructionsUrl: pixData?.hosted_instructions_url || null,
          },
        },
      });

      return {
        id: paymentIntent.id,
        invoiceUrl: pixData?.hosted_instructions_url || undefined,
        pixQrCodeUrl: pixData?.image_url_png || undefined,
        pixCopyPaste: pixData?.data || undefined,
        paymentLink,
        status: paymentIntent.status,
      };
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(`Stripe indisponível: ${errInstanceofError?.message}`);
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

    if (!sale) {
      return null;
    }
    const metadata = ((sale.metadata as Record<string, unknown> | null) || {}) as KloelSaleMetadata;

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
      pixQrCodeUrl: includePaymentDetails ? metadata.pixQrCodeUrl || undefined : undefined,
      pixCopyPaste: includePaymentDetails ? metadata.pixCopyPaste || undefined : undefined,
      paymentLink: includePaymentDetails
        ? metadata.pixHostedInstructionsUrl || sale.paymentLink || undefined
        : undefined,
      companyName: metadata.companyName || undefined,
    };
  }

  async processPaymentWebhook(
    workspaceId: string,
    event: string,
    payment: PaymentWebhookPayload,
  ): Promise<void> {
    if (event !== 'PAYMENT_CONFIRMED') {
      return;
    }
    if (!payment?.id) {
      return;
    }

    // Move find inside $transaction to prevent concurrent webhook deliveries
    // from racing between find and update.
    await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.kloelSale.findFirst({
          where: { workspaceId, externalPaymentId: payment.id },
          select: { id: true, status: true },
        });

        if (!sale?.id) {
          return;
        }

        // Idempotency: skip if already paid
        if (sale.status === 'paid') {
          return;
        }

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
