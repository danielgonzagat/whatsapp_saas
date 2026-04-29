import * as crypto from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Contact, type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Public } from '../auth/public.decorator';
import { AutopilotService } from '../autopilot/autopilot.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WebhooksService } from './webhooks.service';
import {
  D_RE,
  type WebhookRequest,
  type GenericPaymentWebhookBody,
  type ShopifyOrderWebhookBody,
  type PagHiperWebhookBody,
  type WooCommerceMetaData,
  type WooCommerceWebhookBody,
} from './payment-webhook-types';
import {
  assertWorkspaceExists,
  verifySharedSecretOrSignature,
  ensureIdempotent,
  sendOpsAlert,
} from './payment-webhook-generic.helpers';

/**
 * Handles generic, Shopify, PagHiper, and WooCommerce payment webhooks.
 * Stripe webhooks are handled by PaymentWebhookStripeController.
 */
@Controller('webhook/payment')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class PaymentWebhookGenericController {
  private readonly logger = new Logger(PaymentWebhookGenericController.name);

  constructor(
    private readonly autopilot: AutopilotService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly webhooksService: WebhooksService,
  ) {}

  /** Generic payment webhook — POST /webhook/payment */
  @Public()
  @Post()
  async handlePayment(
    @Headers('x-webhook-secret') secret: string,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-webhook-signature') webhookSignature: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req: WebhookRequest,
    @Body() body: GenericPaymentWebhookBody,
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAYMENT_WEBHOOK_SECRET not configured');
    }
    if (expected) {
      const acceptedSignature = signature || webhookSignature;
      if (!verifySharedSecretOrSignature(req, expected, secret, acceptedSignature)) {
        throw new ForbiddenException('invalid_webhook_secret');
      }
    }

    const genericDupe = await ensureIdempotent(eventId, req, this.redis, this.logger, (msg, meta) =>
      sendOpsAlert(msg, meta, this.redis),
    );
    if (genericDupe) return genericDupe;

    const genericExternalId = eventId || body.orderId || `generic_${Date.now()}`;
    let genericWebhookEvent: WebhookEvent | undefined;
    try {
      genericWebhookEvent = await this.webhooksService.logWebhookEvent(
        body.provider || 'generic',
        body.status || 'unknown',
        String(genericExternalId),
        body,
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      if ((err as { code?: string } | null)?.code === 'P2002') {
        this.logger.log(`Duplicate generic webhook event ${genericExternalId}, returning 200`);
        return { ok: true, skipped: true, reason: 'duplicate_webhook_event' };
      }
      this.logger.warn(`Failed to log generic webhook event: ${errMsg?.message}`);
    }

    const status = (body.status || '').toLowerCase();
    const isPaid =
      ['paid', 'pago', 'paga', 'payed', 'captured', 'success'].some((s) => status.includes(s)) ||
      status === 'payment_received';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId = body.workspaceId;
    if (!workspaceId) throw new BadRequestException('missing_workspaceId');
    await assertWorkspaceExists(this.prisma, workspaceId);

    const normalizedPhone = body.phone ? String(body.phone).replace(D_RE, '') : undefined;
    await this.updateSaleAndPayment(body, workspaceId, normalizedPhone);

    let contact: Contact | null = null;
    if (body.contactId) {
      contact = await this.prisma.contact.findFirst({ where: { workspaceId, id: body.contactId } });
    }
    if (!contact && normalizedPhone) {
      contact = await this.prisma.contact.findFirst({
        where: { workspaceId, phone: normalizedPhone },
      });
    }

    const reason = `payment_webhook_${body.provider || 'generic'}`;
    await this.autopilot.markConversion({
      workspaceId,
      contactId: contact?.id || body.contactId,
      phone: normalizedPhone,
      reason,
      meta: {
        status: body.status,
        amount: body.amount,
        orderId: body.orderId,
        provider: body.provider,
      },
    });

    if (normalizedPhone) await this.sendGenericConfirmation(workspaceId, normalizedPhone, body);

    if (contact?.id) {
      try {
        await this.autopilot.triggerPostPurchaseFlow(workspaceId, contact.id, {
          provider: body.provider || 'generic',
          amount: body.amount,
          orderId: body.orderId,
        });
      } catch (flowErr: unknown) {
        const msg =
          flowErr instanceof Error
            ? flowErr
            : new Error(typeof flowErr === 'string' ? flowErr : 'unknown error');
        this.logger.warn(`Erro ao ativar fluxo pós-venda (generic): ${msg?.message}`);
      }
    }

    if (genericWebhookEvent?.id) {
      await this.webhooksService
        .markWebhookProcessed(genericWebhookEvent.id)
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : 'unknown_error';
          this.logger.error(
            `[WEBHOOK] Failed to mark webhook ${genericWebhookEvent.id} as processed: ${errMsg}`,
          );
        });
    }
    return { ok: true };
  }

  /**
   * Shopify webhook (order paid) — POST /webhook/payment/shopify
   * Verifies HMAC X-Shopify-Hmac-SHA256 with SHOPIFY_WEBHOOK_SECRET.
   */
  @Public()
  @Post('shopify')
  async handleShopify(
    @Req() req: WebhookRequest,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: ShopifyOrderWebhookBody,
  ) {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('SHOPIFY_WEBHOOK_SECRET not set');
    const raw: string | Buffer = req?.rawBody || JSON.stringify(body);
    const shopifyDupe = await ensureIdempotent(eventId, req, this.redis, this.logger, (msg, meta) =>
      sendOpsAlert(msg, meta, this.redis),
    );
    if (shopifyDupe) return shopifyDupe;
    const rawBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const digest = crypto.createHmac('sha256', secret).update(rawBuffer).digest('base64');
    if (digest !== hmac) throw new ForbiddenException('invalid_shopify_hmac');

    const status = (body.financial_status || '').toLowerCase();
    if (status !== 'paid') return { ok: true, ignored: true, reason: 'status_not_paid' };
    const workspaceId = body.workspaceId;
    if (!workspaceId) throw new BadRequestException('missing_workspaceId');
    await assertWorkspaceExists(this.prisma, workspaceId);
    const phone = body.phone || body?.customer?.phone;
    const amount = body.total_price
      ? Number.parseFloat(body.total_price)
      : body?.total_price_set?.shop_money?.amount;
    await this.autopilot.markConversion({
      workspaceId,
      phone,
      reason: 'shopify_paid',
      meta: {
        orderId: body.id || body.order_number,
        amount,
        currency: body?.currency || body?.presentment_currency,
        provider: 'shopify',
      },
    });
    return { ok: true };
  }

  /**
   * PagHiper webhook — POST /webhook/payment/paghiper
   * Header: X-Paghiper-Token must match PAGHIPER_WEBHOOK_TOKEN.
   */
  @Public()
  @Post('paghiper')
  async handlePagHiper(
    @Headers('x-paghiper-token') token: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req: WebhookRequest,
    @Body() body: PagHiperWebhookBody,
  ) {
    const expected = process.env.PAGHIPER_WEBHOOK_TOKEN;
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAGHIPER_WEBHOOK_TOKEN not configured');
    }
    if (expected && (!token || token !== expected)) {
      throw new ForbiddenException('invalid_paghiper_token');
    }

    const paghiperDupe = await ensureIdempotent(
      eventId,
      req,
      this.redis,
      this.logger,
      (msg, meta) => sendOpsAlert(msg, meta, this.redis),
    );
    if (paghiperDupe) return paghiperDupe;

    const status = (body?.status || body?.transaction?.status || '').toLowerCase();
    const isPaid = ['paid', 'completed', 'complete'].some((s) => status.includes(s));
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId || body?.metadata?.workspaceId || body?.transaction?.metadata?.workspaceId;
    if (!workspaceId) throw new BadRequestException('missing_workspaceId');
    await assertWorkspaceExists(this.prisma, workspaceId);

    const phone =
      body?.payer_phone ||
      body?.payer?.phone ||
      body?.transaction?.payer_phone ||
      body?.transaction?.payer?.phone;
    await this.autopilot.markConversion({
      workspaceId,
      phone,
      reason: 'paghiper_paid',
      meta: {
        provider: 'paghiper',
        transactionId: body?.transaction?.transaction_id || body?.transaction_id,
        amount: body?.value_cents ? body.value_cents / 100 : body?.value,
        status,
      },
    });
    return { ok: true };
  }

  /**
   * WooCommerce webhook (order paid) — POST /webhook/payment/woocommerce
   * Header: X-WC-Webhook-Signature validated with WC_WEBHOOK_SECRET.
   */
  @Public()
  @Post('woocommerce')
  async handleWoo(
    @Req() req: WebhookRequest,
    @Headers('x-wc-webhook-signature') signature: string,
    @Body() body: WooCommerceWebhookBody,
  ) {
    const secret = process.env.WC_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('WC_WEBHOOK_SECRET not set');
    const raw: string | Buffer = req?.rawBody || JSON.stringify(body);
    const rawBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const digest = crypto.createHmac('sha256', secret).update(rawBuffer).digest('base64');
    if (digest !== signature) throw new ForbiddenException('invalid_wc_signature');

    const status = (body?.status || '').toLowerCase();
    const isPaid = status === 'completed' || status === 'processing' || status === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const metaWorkspace = body?.meta_data?.find?.(
      (m: WooCommerceMetaData) => m.key === 'workspaceId',
    )?.value;
    const workspaceId =
      body.workspaceId || (typeof metaWorkspace === 'string' ? metaWorkspace : undefined);
    if (!workspaceId) throw new BadRequestException('missing_workspaceId');
    await assertWorkspaceExists(this.prisma, workspaceId);

    const phone = body?.billing?.phone || body?.customer?.phone || body?.phone;
    await this.autopilot.markConversion({
      workspaceId,
      phone,
      reason: 'woocommerce_paid',
      meta: {
        provider: 'woocommerce',
        orderId: body?.id || body?.number,
        amount: body?.total ? Number.parseFloat(body.total) : undefined,
        currency: body?.currency,
        status,
      },
    });
    return { ok: true };
  }

  // ─── Shared private helpers ────────────────────────────────

  private async updateSaleAndPayment(
    body: GenericPaymentWebhookBody,
    workspaceId: string,
    _normalizedPhone: string | undefined,
  ): Promise<void> {
    if (body.orderId || body.provider) {
      try {
        await this.prisma.kloelSale.updateMany({
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
        this.logger.warn(`Não foi possível atualizar KloelSale (generic): ${msg?.message}`);
      }
    }
    if (body.orderId) {
      try {
        const genericExternalRef = String(body.orderId);
        const existingGenericPayment = await this.prisma.payment.findFirst({
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
          await this.prisma.payment.updateMany({
            where: { workspaceId, externalId: genericExternalRef },
            data: { status: 'RECEIVED' },
          });
        } else {
          this.logger.warn(
            `Generic webhook rejected by state machine: ${existingGenericPayment?.status} -> RECEIVED for ${genericExternalRef}`,
          );
        }
      } catch (paymentErr: unknown) {
        const msg =
          paymentErr instanceof Error
            ? paymentErr
            : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
        this.logger.warn(`Não foi possível atualizar Payment (generic): ${msg?.message}`);
      }
    }
  }

  private async sendGenericConfirmation(
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
      await this.whatsapp.sendMessage(workspaceId, normalizedPhone, msg);
    } catch (notifyErr: unknown) {
      const notifyMsg =
        notifyErr instanceof Error
          ? notifyErr
          : new Error(typeof notifyErr === 'string' ? notifyErr : 'unknown error');
      this.logger.warn(`Falha ao notificar cliente (generic): ${notifyMsg?.message}`);
    }
  }
}
