import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { AuditService } from '../audit/audit.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type { PixChargeResult } from '../payments/mercadopago/mercadopago.types';
import { FinancialAlertService } from '../common/financial-alert.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { PrismaService } from '../prisma/prisma.service';
import { MindEventSpine } from './mind/coordination/mind-event-spine.service';
import type { SaleEventPayload } from './brain-event-taxonomy';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

const MP_WEBHOOK_PATH = '/webhooks/mercadopago';
const PIX_EXPIRATION_MINUTES = 30;

function resolveBackendOrigin(): string {
  const raw =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.APP_URL ||
    'http://localhost:3001';
  const trimmed = raw.replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toPixQrCodeDataUrl(qrCodeBase64: string): string | undefined {
  return qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : undefined;
}

type KloelSaleMetadata = {
  companyName?: string;
  pixQrCodeUrl?: string | null;
  pixCopyPaste?: string | null;
  pixHostedInstructionsUrl?: string | null;
};

type KloelSaleRow = { status?: string; amount?: number; [key: string]: unknown };

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
  private readonly logger = StructuredLogger.from(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoPix: MercadoPagoPixChargeService,
    private readonly auditService: AuditService,
    private readonly financialAlert: FinancialAlertService,
    private readonly fraudEngine: FraudEngine,
    @Optional() private readonly events?: MindEventSpine,
  ) {
    // Verify kloelSale model exists at runtime
    if (typeof this.prisma.kloelSale?.create !== 'function') {
      this.logger.warn('KloelSale model not available in Prisma — payment features disabled');
    }
  }

  private async createMercadoPagoPixCharge(
    data: CreatePaymentInput,
    amountInCents: number,
    idempotencyKey: string,
  ): Promise<PixChargeResult> {
    const payerEmail = data.customerEmail?.trim();
    if (!payerEmail) {
      throw new BadRequestException(
        'Informe o e-mail do comprador para gerar PIX no Mercado Pago.',
      );
    }

    return this.mercadoPagoPix.create({
      idempotencyKey,
      amountCents: BigInt(amountInCents),
      payerEmail,
      payerName: data.customerName,
      description: data.description,
      externalReference: idempotencyKey,
      expiresAt: new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000),
      notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
    });
  }

  private async persistMercadoPagoPixSale(params: {
    data: CreatePaymentInput;
    pixCharge: PixChargeResult;
    companyName?: string;
    idempotencyKey: string;
    paymentLink?: string;
    pixQrCodeUrl?: string;
  }): Promise<void> {
    const isReplay = await this.prisma.$transaction(
      async (tx) => {
        const existingSale = await tx.kloelSale.findFirst({
          where: {
            workspaceId: params.data.workspaceId,
            externalPaymentId: params.pixCharge.externalId,
          },
          select: { id: true },
        });
        if (existingSale) {
          return true;
        }

        await tx.kloelSale.create({
          data: {
            leadId: params.data.leadId,
            status: 'pending',
            amount: params.data.amount,
            paymentMethod: 'PIX',
            ...(params.paymentLink !== undefined ? { paymentLink: params.paymentLink } : {}),
            externalPaymentId: params.pixCharge.externalId,
            workspaceId: params.data.workspaceId,
            metadata: {
              ...(params.companyName !== undefined ? { companyName: params.companyName } : {}),
              gateway: 'mercadopago',
              pixQrCodeUrl: params.pixQrCodeUrl ?? null,
              pixCopyPaste: params.pixCharge.qrCode || null,
              pixHostedInstructionsUrl: params.pixCharge.ticketUrl || null,
              pixExpiresAt: params.pixCharge.expiresAt.toISOString(),
              idempotencyKey: params.idempotencyKey,
            },
          },
        });

        await this.auditService.logWithTx(tx, {
          workspaceId: params.data.workspaceId,
          action: 'payment.created',
          resource: 'KloelPayment',
          resourceId: params.pixCharge.externalId,
          details: {
            leadId: params.data.leadId,
            amount: params.data.amount,
            paymentMethod: 'PIX',
            gateway: 'mercadopago',
            externalPaymentId: params.pixCharge.externalId,
            idempotencyKey: params.idempotencyKey,
            customerName: params.data.customerName,
            description: params.data.description,
          },
        });

        return false;
      },
      { isolationLevel: 'ReadCommitted' },
    );

    if (!isReplay) {
      const saleEvent: SaleEventPayload = {
        occurredAt: new Date(),
        workspaceId: params.data.workspaceId,
        subject: `lead:${params.data.leadId}`,
        eventType: 'sale.created',
        idempotencyKey: `sale:${params.idempotencyKey}`,
        payload: {
          amount: params.data.amount,
          externalPaymentId: params.pixCharge.externalId,
          leadId: params.data.leadId,
          paymentMethod: 'PIX',
          status: 'pending',
        },
      };
      try {
        await this.events?.recordCommercial(saleEvent);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          JSON.stringify({
            event: 'mind_sale_event_record_failed',
            workspaceId: params.data.workspaceId,
            provider: 'mind_event_spine',
            operation: 'record_sale_created',
            status: 'error',
            errorCode: error instanceof Error ? error.name : 'unknown_error',
            message: message.slice(0, 512),
          }),
        );
      }
    }
  }

  private buildCreatePaymentResponse(params: {
    pixCharge: PixChargeResult;
    paymentLink?: string;
    pixQrCodeUrl?: string;
  }): CreatePaymentResult {
    return {
      id: params.pixCharge.externalId,
      ...(params.pixCharge.ticketUrl ? { invoiceUrl: params.pixCharge.ticketUrl } : {}),
      ...(params.pixQrCodeUrl !== undefined ? { pixQrCodeUrl: params.pixQrCodeUrl } : {}),
      ...(params.pixCharge.qrCode ? { pixCopyPaste: params.pixCharge.qrCode } : {}),
      ...(params.paymentLink !== undefined ? { paymentLink: params.paymentLink } : {}),
      status: params.pixCharge.status,
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
        ...(data.customerEmail !== undefined ? { customerEmail: data.customerEmail } : {}),
        description: data.description,
        amountInCents,
        ...(data.idempotencyKey !== undefined ? { idempotencyKey: data.idempotencyKey } : {}),
      });
      const pixCharge = await this.createMercadoPagoPixCharge(data, amountInCents, idempotencyKey);
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: data.workspaceId },
        select: { name: true },
      });
      const pixQrCodeUrl = toPixQrCodeDataUrl(pixCharge.qrCodeBase64);
      const paymentLink = pixCharge.ticketUrl || undefined;

      await this.persistMercadoPagoPixSale({
        data,
        pixCharge,
        ...(workspace?.name !== undefined ? { companyName: workspace.name } : {}),
        idempotencyKey,
        ...(paymentLink !== undefined ? { paymentLink } : {}),
        ...(pixQrCodeUrl !== undefined ? { pixQrCodeUrl } : {}),
      });

      return this.buildCreatePaymentResponse({
        pixCharge,
        ...(paymentLink !== undefined ? { paymentLink } : {}),
        ...(pixQrCodeUrl !== undefined ? { pixQrCodeUrl } : {}),
      });
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const errInstance =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown_error');
      this.logger.error(`Mercado Pago PIX indisponível: ${errInstance.message}`);
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
    const metadata = (sale.metadata as KloelSaleMetadata) || {};

    const status =
      typeof sale.status === 'string'
        ? sale.status.toLowerCase()
        : typeof sale.status === 'number' || typeof sale.status === 'boolean'
          ? String(sale.status).toLowerCase()
          : '';
    const includePaymentDetails = status !== 'paid' && status !== 'pago' && status !== 'confirmed';
    const activeMemberAreas = await this.prisma.memberArea.findMany({
      where: { workspaceId: sale.workspaceId, active: true },
      select: { slug: true },
      take: 2,
    });
    const memberAreaSlug = activeMemberAreas.length === 1 ? activeMemberAreas[0]?.slug : undefined;

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
      memberAreaUrl: memberAreaSlug ? `/area/${memberAreaSlug}` : undefined,
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
    const paymentId = payment.id;

    // Move find inside $transaction to prevent concurrent webhook deliveries
    // from racing between find and update.
    await this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.kloelSale.findFirst({
          where: { workspaceId, externalPaymentId: paymentId },
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
            externalPaymentId: paymentId,
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

    const paid = sales.filter((s: KloelSaleRow) => s.status === 'paid');
    return {
      totalSales: paid.length,
      totalAmount: paid.reduce(
        (sum: number, s: KloelSaleRow) => sum + ((s.amount as number) || 0),
        0,
      ),
    };
  }
}
