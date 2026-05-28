import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type PaymentStatus } from '@prisma/client';

import { Public } from '../../auth/public.decorator';
import { validateOrderTransition } from '../../common/checkout-order-state-machine';
import { PrismaService } from '../../prisma/prisma.service';

import { MercadoPagoConfigService } from './mercadopago.config';
import { MercadoPagoPixChargeService } from './mercadopago-pix-charge.service';
import { MercadoPagoWebhookSignatureVerifier } from './mercadopago-webhook-signature.verifier';
import type { MercadoPagoWebhookPayload } from './mercadopago.types';

const TERMINAL_CHECKOUT_ORDER_STATUSES = new Set(['PAID', 'CANCELED', 'REFUNDED', 'CHARGEBACK']);
type KloelSalePaymentStatus = 'paid' | 'cancelled' | 'refunded';
const TERMINAL_KLOEL_SALE_STATUSES = new Set(['paid', 'cancelled', 'refunded']);

/**
 * Mercado Pago webhook receiver.
 *
 * Endpoint: `POST /webhooks/mercadopago` (configured in MP dashboard).
 *
 * Pipeline:
 * 1. Verify `x-signature` (anti-replay + anti-tamper). Reject on failure.
 * 2. Persist the raw event in `WebhookEvent` with
 *    `@@unique([provider, externalId])` for idempotency.
 * 3. Fetch authoritative payment state from MP API (don't trust webhook
 *    body — only trust the source of truth).
 * 4. Update the corresponding `Payment` row by `externalId + provider`.
 * 5. Return 200 with `{ received: true }`.
 *
 * Per CLAUDE.md REGRA DE INTEGRAÇÕES EXTERNAS: never log full payload
 * (could contain payer info); log requestId + externalId only.
 */
@Controller('webhooks/mercadopago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly config: MercadoPagoConfigService,
    private readonly verifier: MercadoPagoWebhookSignatureVerifier,
    private readonly pixCharge: MercadoPagoPixChargeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signatureHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: MercadoPagoWebhookPayload,
  ): Promise<{ received: true; duplicate?: boolean }> {
    if (!this.config.isAvailable()) {
      throw new BadRequestException('mercadopago_not_configured');
    }

    const dataId = body?.data?.id ?? body?.id;
    const verification = this.verifier.verify({
      signatureHeader,
      requestId,
      dataId,
    });
    if (verification.ok === false) {
      this.logger.warn(
        `mp_webhook_rejected reason=${verification.reason} requestId=${requestId ?? 'none'}`,
      );
      throw new UnauthorizedException(`mp_webhook_signature_invalid: ${verification.reason}`);
    }

    if (!dataId) {
      throw new BadRequestException('mp_webhook_missing_data_id');
    }
    const externalId = String(dataId);

    // Idempotency: persist event; if duplicate, short-circuit.
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'mercadopago',
          externalId,
          eventType: body?.type ?? body?.action ?? 'payment',
          // MP webhook payload has optional fields; cast to Prisma's
          // InputJsonValue (JSON-serialisable plain object).
          payload: { ...(body ?? {}) },
          status: 'received',
          receivedAt: new Date(),
        },
      });
    } catch (err) {
      // Unique constraint @@unique([provider, externalId]) — duplicate event,
      // we already processed it. MP retries every webhook a few times.
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        this.logger.log(`mp_webhook_duplicate externalId=${externalId}`);
        return { received: true, duplicate: true };
      }
      throw err;
    }

    // Fetch authoritative status (defense-in-depth).
    let status: string;
    let providerRaw: unknown;
    try {
      const result = await this.pixCharge.getStatus(externalId);
      status = result.status;
      providerRaw = result.raw;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`mp_webhook_status_fetch_failed externalId=${externalId} err=${msg}`);
      // Don't fail the webhook — MP will retry. Record the event so we
      // can reconcile manually.
      await this.prisma.webhookEvent.update({
        where: { provider_externalId: { provider: 'mercadopago', externalId } },
        data: { status: 'fetch_failed' },
      });
      return { received: true };
    }

    // Map MP status to Payment row. Resolve workspaceId first to keep the
    // update workspace-scoped (multi-tenant safety).
    const existingPayment = await this.prisma.payment.findFirst({
      where: { externalId, provider: 'mercadopago' },
      select: { workspaceId: true },
    });
    if (existingPayment) {
      await this.prisma.payment.updateMany({
        where: { workspaceId: existingPayment.workspaceId, externalId, provider: 'mercadopago' },
        data: {
          status: mapPixStatusToPaymentStatus(status),
        },
      });
    }

    await this.updateCheckoutPaymentFromProvider({
      externalId,
      eventType: body?.type ?? body?.action ?? 'payment',
      providerRaw,
      status,
    });

    await this.updateKloelSaleFromProvider({
      externalId,
      status,
    });

    await this.prisma.webhookEvent.update({
      where: { provider_externalId: { provider: 'mercadopago', externalId } },
      data: { status: 'processed', processedAt: new Date() },
    });

    this.logger.log(
      `mp_webhook_processed externalId=${externalId} status=${status} requestId=${requestId}`,
    );
    return { received: true };
  }

  private async updateCheckoutPaymentFromProvider(params: {
    externalId: string;
    eventType: string;
    providerRaw: unknown;
    status: string;
  }): Promise<void> {
    const checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: params.externalId },
      select: {
        orderId: true,
        order: {
          select: {
            workspaceId: true,
            status: true,
          },
        },
      },
    });
    if (!checkoutPayment) {
      return;
    }

    const checkoutStatus = mapPixStatusToCheckoutPaymentStatus(params.status);
    await this.prisma.checkoutPayment.updateMany({
      where: { externalId: params.externalId, orderId: checkoutPayment.orderId },
      data: {
        status: checkoutStatus,
        webhookData: toJsonValue({
          provider: 'mercadopago',
          eventType: params.eventType,
          paymentStatus: params.status,
          payment: params.providerRaw,
        }),
      },
    });

    await this.syncCheckoutOrderFromPaymentStatus({
      orderId: checkoutPayment.orderId,
      workspaceId: checkoutPayment.order.workspaceId,
      currentStatus: checkoutPayment.order.status,
      paymentStatus: checkoutStatus,
    });
  }

  private async updateKloelSaleFromProvider(params: {
    externalId: string;
    status: string;
  }): Promise<void> {
    const saleStatus = mapMercadoPagoStatusToKloelSaleStatus(params.status);
    if (!saleStatus) {
      return;
    }

    const sale = await this.prisma.kloelSale.findFirst({
      where: {
        OR: [
          { externalPaymentId: params.externalId },
          { metadata: { path: ['mercadoPagoPaymentId'], equals: params.externalId } },
        ],
      },
      select: { id: true, workspaceId: true, status: true },
    });
    if (!sale || TERMINAL_KLOEL_SALE_STATUSES.has(sale.status)) {
      return;
    }

    await this.prisma.kloelSale.updateMany({
      where: { id: sale.id, workspaceId: sale.workspaceId },
      data:
        saleStatus === 'paid' ? { status: saleStatus, paidAt: new Date() } : { status: saleStatus },
    });
  }

  private async syncCheckoutOrderFromPaymentStatus(params: {
    orderId: string;
    workspaceId: string;
    currentStatus: string;
    paymentStatus: PaymentStatus;
  }): Promise<void> {
    let currentStatus = params.currentStatus;
    if (TERMINAL_CHECKOUT_ORDER_STATUSES.has(currentStatus)) {
      return;
    }

    if (params.paymentStatus === 'APPROVED') {
      if (currentStatus !== 'PROCESSING') {
        const canEnterProcessing = validateOrderTransition(currentStatus, 'PROCESSING', {
          orderId: params.orderId,
          workspaceId: params.workspaceId,
        });
        if (!canEnterProcessing) {
          return;
        }
        await this.prisma.checkoutOrder.updateMany({
          where: { id: params.orderId, workspaceId: params.workspaceId },
          data: { status: 'PROCESSING' },
        });
        currentStatus = 'PROCESSING';
      }

      const canBecomePaid = validateOrderTransition(currentStatus, 'PAID', {
        orderId: params.orderId,
        workspaceId: params.workspaceId,
      });
      if (!canBecomePaid) {
        return;
      }
      await this.prisma.checkoutOrder.updateMany({
        where: { id: params.orderId, workspaceId: params.workspaceId },
        data: { status: 'PAID', paidAt: new Date() },
      });
      return;
    }

    if (params.paymentStatus === 'PROCESSING' && currentStatus === 'PENDING') {
      const canEnterProcessing = validateOrderTransition(currentStatus, 'PROCESSING', {
        orderId: params.orderId,
        workspaceId: params.workspaceId,
      });
      if (canEnterProcessing) {
        await this.prisma.checkoutOrder.updateMany({
          where: { id: params.orderId, workspaceId: params.workspaceId },
          data: { status: 'PROCESSING' },
        });
      }
      return;
    }

    if (['DECLINED', 'CANCELED', 'EXPIRED'].includes(params.paymentStatus)) {
      const canCancel = validateOrderTransition(currentStatus, 'CANCELED', {
        orderId: params.orderId,
        workspaceId: params.workspaceId,
      });
      if (canCancel) {
        await this.prisma.checkoutOrder.updateMany({
          where: { id: params.orderId, workspaceId: params.workspaceId },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }
    }
  }
}

/**
 * Maps the canonical PIX status to the legacy `Payment.status` string
 * used by the existing webhook ecosystem.
 *
 * Kept as a free function so it can be unit-tested without DI overhead.
 */
function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function mapPixStatusToPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
      return 'CANCELED';
    case 'expired':
      return 'EXPIRED';
    case 'refunded':
      return 'REFUNDED';
    case 'in_process':
      return 'PROCESSING';
    case 'pending':
    default:
      return 'PENDING';
  }
}

function mapPixStatusToCheckoutPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
    case 'refunded':
      return 'CANCELED';
    case 'expired':
      return 'EXPIRED';
    case 'in_process':
      return 'PROCESSING';
    case 'pending':
    default:
      return 'PENDING';
  }
}

function mapMercadoPagoStatusToKloelSaleStatus(status: string): KloelSalePaymentStatus | null {
  switch (status) {
    case 'approved':
      return 'paid';
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    case 'in_process':
    case 'pending':
    default:
      return null;
  }
}
