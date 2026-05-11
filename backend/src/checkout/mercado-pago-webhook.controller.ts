import { Body, Controller, ForbiddenException, Headers, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MercadoPagoPaymentSnapshot, MercadoPagoPixService } from './mercado-pago-pix.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

type MercadoPagoWebhookBody = {
  id?: string | number;
  action?: string;
  type?: string;
  topic?: string;
  data?: {
    id?: string | number;
  };
};

type CheckoutPaymentStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED';
const TERMINAL_ORDER_STATUSES = new Set(['PAID', 'CANCELED', 'REFUNDED', 'CHARGEBACK']);

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  return asString(metadata[key]);
}

function mapMercadoPagoStatus(status: MercadoPagoPaymentSnapshot['status']): CheckoutPaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Controller('checkout/webhooks/mercado-pago')
@Public()
@RouteClass('webhook')
export class MercadoPagoWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
    private readonly mercadoPagoPixService: MercadoPagoPixService,
  ) {}

  @Post()
  async handlePayment(
    @Body() body: MercadoPagoWebhookBody,
    @Headers('x-signature') signatureHeader?: string,
    @Headers('x-request-id') requestId?: string,
    @Query('data.id') queryDataId?: string,
    @Query('id') queryId?: string,
  ) {
    const dataId = asString(queryDataId) || asString(body.data?.id) || asString(queryId);
    if (!dataId) {
      return { received: true, ignored: true, reason: 'missing_payment_id' };
    }

    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const validSignature =
        Boolean(signatureHeader && requestId) &&
        this.mercadoPagoPixService.verifyWebhookSignature({
          dataId,
          requestId: requestId || '',
          signatureHeader: signatureHeader || '',
          secret: webhookSecret,
        });

      if (!validSignature) {
        throw new ForbiddenException('invalid_mercado_pago_signature');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('MERCADOPAGO_WEBHOOK_SECRET not configured');
    }

    const eventType = body.action || body.type || body.topic || 'payment';
    const externalEventId = asString(body.id) || `${eventType}:${dataId}`;

    const webhookEvent = await this.webhooksService.logWebhookEvent(
      'mercado_pago',
      eventType,
      externalEventId,
      body,
    );
    if (webhookEvent.status === 'processed') {
      return { received: true, skipped: true, reason: 'already_processed' };
    }

    const payment = await this.mercadoPagoPixService.getPayment(dataId);
    const metadataOrderId =
      metadataString(payment.metadata, 'kloel_order_id') ||
      metadataString(payment.metadata, 'orderId');
    const metadataWorkspaceId =
      metadataString(payment.metadata, 'workspace_id') ||
      metadataString(payment.metadata, 'workspaceId');

    const existingPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: payment.externalId },
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

    const orderId = existingPayment?.orderId || metadataOrderId;
    const workspaceId = existingPayment?.order.workspaceId || metadataWorkspaceId;
    if (!orderId || !workspaceId) {
      await this.webhooksService.markWebhookFailed(
        webhookEvent.id,
        'missing_checkout_order_context',
      );
      return { received: true, ignored: true, reason: 'missing_checkout_order_context' };
    }

    if (
      existingPayment?.order.status &&
      TERMINAL_ORDER_STATUSES.has(existingPayment.order.status)
    ) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id);
      return {
        received: true,
        skipped: true,
        reason: 'terminal_order_status',
        orderId,
        status: existingPayment.order.status,
      };
    }

    const status = mapMercadoPagoStatus(payment.status);
    await this.prisma.checkoutPayment.updateMany({
      where: {
        OR: [{ externalId: payment.externalId }, { orderId }],
      },
      data: {
        status,
        externalId: payment.externalId,
        pixQrCode: payment.qrCodeBase64,
        pixCopyPaste: payment.copyPaste,
        pixExpiresAt: payment.expiresAt ? new Date(payment.expiresAt) : undefined,
        webhookData: toJsonValue({
          provider: 'mercado_pago',
          eventType,
          payment: payment.providerRaw,
        }),
      },
    });

    if (status === 'DECLINED' || status === 'CANCELED') {
      await this.prisma.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    }

    await this.webhooksService.markWebhookProcessed(webhookEvent.id);
    return {
      received: true,
      paymentId: payment.externalId,
      orderId,
      status,
    };
  }
}
