import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import type { StripePaymentIntent } from '../billing/stripe-types';
import { FinancialAlertService } from '../common/financial-alert.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
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

/** Create payment input shape. */
export interface CreatePaymentInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Lead id property. */
  leadId: string;
  /** Customer name property. */
  customerName: string;
  /** Customer phone property. */
  customerPhone: string;
  /** Customer email property. */
  customerEmail?: string;
  /** Amount property. */
  amount: number;
  /** Description property. */
  description: string;
  /** Idempotency key property. */
  idempotencyKey?: string;
}

/** Create payment result shape. */
export interface CreatePaymentResult {
  /** Id property. */
  id: string;
  /** Invoice url property. */
  invoiceUrl?: string;
  /** Pix qr code url property. */
  pixQrCodeUrl?: string;
  /** Pix copy paste property. */
  pixCopyPaste?: string;
  /** Payment link property. */
  paymentLink?: string;
  /** Status property. */
  status: string;
}

function buildPaymentIdempotencyKey(data: {
  workspaceId: string;
  leadId: string;
  customerPhone: string;
  customerEmail?: string;
  description: string;
  amountInCents: number;
  idempotencyKey?: string;
}): string {
  const explicit = data.idempotencyKey?.trim();
  if (explicit) {
    return explicit;
  }

  return `kloel-payment:${createHash('sha256')
    .update(
      [
        data.workspaceId,
        data.leadId,
        data.customerPhone,
        data.customerEmail ?? '',
        data.description,
        String(data.amountInCents),
      ].join('|'),
    )
    .digest('hex')}`;
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
    private readonly fraudEngine: FraudEngine,
  ) {
    // Verify kloelSale model exists at runtime
    if (typeof this.prisma.kloelSale?.create !== 'function') {
      this.logger.warn('KloelSale model not available in Prisma — payment features disabled');
    }
  }

  private async createStripePixPaymentIntent(
    data: CreatePaymentInput,
    amountInCents: number,
    idempotencyKey: string,
  ): Promise<StripePaymentIntent> {
    return await this.stripeService.stripe.paymentIntents.create(
      {
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
      },
      {
        idempotencyKey,
      },
    );
  }

  private extractPixDetails(paymentIntent: StripePaymentIntent) {
    const nextAction = paymentIntent.next_action as PixNextAction | null | undefined;
    const pixData =
      nextAction?.type === 'pix_display_qr_code' ? nextAction.pix_display_qr_code : null;
    const paymentLink =
      pixData?.hosted_instructions_url || pixData?.image_url_png || pixData?.data || undefined;

    return { pixData, paymentLink };
  }

  private async persistStripePixSale(params: {
    data: CreatePaymentInput;
    paymentIntent: StripePaymentIntent;
    companyName?: string;
    idempotencyKey: string;
    paymentLink?: string;
    pixData: PixDisplayQrCode | null;
  }): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existingSale = await tx.kloelSale.findFirst({
          where: {
            workspaceId: params.data.workspaceId,
            externalPaymentId: params.paymentIntent.id,
          },
          select: { id: true },
        });
        if (existingSale) {
          return;
        }

        await tx.kloelSale.create({
          data: {
            leadId: params.data.leadId,
            status: 'pending',
            amount: params.data.amount,
            paymentMethod: 'PIX',
            paymentLink: params.paymentLink,
            externalPaymentId: params.paymentIntent.id,
            workspaceId: params.data.workspaceId,
            metadata: {
              companyName: params.companyName || undefined,
              pixQrCodeUrl: params.pixData?.image_url_png || null,
              pixCopyPaste: params.pixData?.data || null,
              pixHostedInstructionsUrl: params.pixData?.hosted_instructions_url || null,
              idempotencyKey: params.idempotencyKey,
            },
          },
        });

        await this.auditService.logWithTx(tx, {
          workspaceId: params.data.workspaceId,
          action: 'payment.created',
          resource: 'KloelPayment',
          resourceId: params.paymentIntent.id,
          details: {
            leadId: params.data.leadId,
            amount: params.data.amount,
            paymentMethod: 'PIX',
            externalPaymentId: params.paymentIntent.id,
            idempotencyKey: params.idempotencyKey,
            customerName: params.data.customerName,
            description: params.data.description,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private buildCreatePaymentResponse(params: {
    paymentIntent: StripePaymentIntent;
    paymentLink?: string;
    pixData: PixDisplayQrCode | null;
  }): CreatePaymentResult {
    return {
      id: params.paymentIntent.id,
      invoiceUrl: params.pixData?.hosted_instructions_url || undefined,
      pixQrCodeUrl: params.pixData?.image_url_png || undefined,
      pixCopyPaste: params.pixData?.data || undefined,
      paymentLink: params.paymentLink,
      status: params.paymentIntent.status,
    };
  }

  /** Create payment. */
  async createPayment(data: CreatePaymentInput): Promise<CreatePaymentResult> {
    try {
      const amountInCents = Math.round(data.amount * 100);
      const fraudDecision = await this.fraudEngine.evaluate({
        workspaceId: data.workspaceId,
        buyerEmail: data.customerEmail ?? null,
        buyerCpf: null,
        buyerCnpj: null,
        buyerIp: null,
        deviceFingerprint: null,
        cardBin: null,
        cardCountry: null,
        orderCountry: 'BR',
        amountCents: BigInt(amountInCents),
      });

      if (fraudDecision.action === 'block') {
        this.logger.warn(
          `Kloel PIX payment blocked by antifraud workspace=${data.workspaceId} lead=${data.leadId} reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
        );
        throw new BadRequestException('Pagamento bloqueado pela política antifraude.');
      }

      if (fraudDecision.action === 'review' || fraudDecision.action === 'require_3ds') {
        this.logger.warn(
          `Kloel PIX payment routed to review workspace=${data.workspaceId} lead=${data.leadId} reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
        );
        throw new BadRequestException('Pagamento retido para revisão manual.');
      }

      const idempotencyKey = buildPaymentIdempotencyKey({
        workspaceId: data.workspaceId,
        leadId: data.leadId,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        description: data.description,
        amountInCents,
        idempotencyKey: data.idempotencyKey,
      });
      const paymentIntent = await this.createStripePixPaymentIntent(
        data,
        amountInCents,
        idempotencyKey,
      );
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: data.workspaceId },
        select: { name: true },
      });
      const { pixData, paymentLink } = this.extractPixDetails(paymentIntent);

      await this.persistStripePixSale({
        data,
        paymentIntent,
        companyName: workspace?.name,
        idempotencyKey,
        paymentLink,
        pixData,
      });

      return this.buildCreatePaymentResponse({
        paymentIntent,
        paymentLink,
        pixData,
      });
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const errInstance =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown_error');
      this.logger.error(`Stripe indisponível: ${errInstance.message}`);
      this.financialAlert.paymentFailed(errInstance, {
        workspaceId: data.workspaceId,
      });
      throw new ServiceUnavailableException(
        'A infraestrutura interna de pagamento do Kloel está temporariamente indisponível.',
      );
    }
  }

  /** Get public payment. */
  async getPublicPayment(paymentId: string) {
    // Public lookup by externalPaymentId or id (no authenticated workspace
    // context). We surface workspaceId in the selection for telemetry and
    // tenant anchoring — it is NOT returned to the unauthenticated caller.
    const sale = await this.prisma.kloelSale.findFirst({
      where: {
        OR: [{ externalPaymentId: paymentId }, { id: paymentId }],
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        amount: true,
        productName: true,
        paymentMethod: true,
        paymentLink: true,
        externalPaymentId: true,
        createdAt: true,
        paidAt: true,
        metadata: true,
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

  /** Process payment webhook. */
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
          action: 'payment.status_changed',
          resource: 'KloelSale',
          resourceId: typeof sale.id === 'string' ? sale.id : '',
          details: {
            externalPaymentId: payment.id,
            event,
            previousStatus: sale.status,
            newStatus: 'paid',
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Get sales report. */
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
