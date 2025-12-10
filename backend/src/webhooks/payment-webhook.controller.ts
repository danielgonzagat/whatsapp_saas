import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AutopilotService } from '../autopilot/autopilot.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import crypto from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * Webhook genérico de pagamento/loja para marcar conversões reais no Autopilot.
 * Use header X-Webhook-Secret para autenticar.
 */
@Controller('webhook/payment')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly autopilot: AutopilotService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Public()
  @Post('stripe')
  async handleStripe(
    @Req() req: any,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: any,
  ) {
    await this.ensureIdempotent(eventId || body?.id, req);

    const event = body;
    if (event?.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const workspaceId = session.metadata?.workspaceId || 'default';
      const email = session.customer_details?.email || session.customer_email;

      let contact: any = null;
      if (workspaceId !== 'default' && email) {
        contact = await this.prisma.contact.findFirst({
          where: { workspaceId, email },
        });
      }

      if (workspaceId !== 'default') {
        const paymentModel = (this.prisma as any).payment;
        if (paymentModel?.updateMany) {
          try {
            await paymentModel.updateMany({
              where: {
                workspaceId,
                externalId: session.payment_intent || session.id,
              },
              data: { status: 'RECEIVED' },
            });
          } catch (paymentErr: any) {
            this.logger.warn(`Não foi possível atualizar pagamento Stripe: ${paymentErr?.message}`);
          }
        } else {
          this.logger.warn('Modelo payment não disponível no PrismaService; skip updateMany');
        }
      }

      if (contact?.phone) {
        try {
          await this.whatsapp.sendMessage(
            workspaceId,
            contact.phone,
            'Pagamento confirmado! Obrigado pela sua compra.',
          );
        } catch (notifyErr: any) {
          this.logger.warn(`Falha ao notificar cliente Stripe: ${notifyErr?.message}`);
        }
      }

      await this.autopilot.markConversion({
        workspaceId,
        contactId: contact?.id,
        phone: contact?.phone,
        reason: 'stripe_paid',
        meta: {
          provider: 'stripe',
          paymentIntent: session.payment_intent || session.id,
          amount: session.amount_total ? session.amount_total / 100 : undefined,
          currency: session.currency,
        },
      });
    }

    return { received: true };
  }

  @Public()
  @Post()
  async handlePayment(
    @Headers('x-webhook-secret') secret: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      contactId?: string;
      phone?: string;
      status?: string;
      amount?: number;
      orderId?: string;
      provider?: string;
      [key: string]: any;
    },
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (expected && expected !== secret) {
      throw new ForbiddenException('invalid_webhook_secret');
    }

    await this.ensureIdempotent(eventId, req);

    const status = (body.status || '').toLowerCase();
    const isPaid =
      ['paid', 'pago', 'paga', 'payed', 'captured', 'success'].some((s) =>
        status.includes(s),
      ) || status === 'payment_received';

    if (!isPaid) {
      return { ok: true, ignored: true, reason: 'status_not_paid' };
    }

    const reason = `payment_webhook_${body.provider || 'generic'}`;
    await this.autopilot.markConversion({
      workspaceId: body.workspaceId || 'default',
      contactId: body.contactId,
      phone: body.phone,
      reason,
      meta: {
        status: body.status,
        amount: body.amount,
        orderId: body.orderId,
        provider: body.provider,
      },
    });

    return { ok: true };
  }

  /**
   * Shopify webhook (order paid)
   * - Verifica HMAC X-Shopify-Hmac-SHA256 com SHOPIFY_WEBHOOK_SECRET
   * - Usa body.financial_status === 'paid' e body.phone/body.customer?.phone
   */
  @Public()
  @Post('shopify')
  async handleShopify(
    @Req() req: any,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: any,
  ) {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('SHOPIFY_WEBHOOK_SECRET not set');
    }
    const raw = req?.rawBody || JSON.stringify(body);
    await this.ensureIdempotent(eventId, req);
    const digest = crypto
      .createHmac('sha256', secret)
      .update(raw, 'utf8')
      .digest('base64');
    if (digest !== hmac) {
      throw new ForbiddenException('invalid_shopify_hmac');
    }

    const status = (body.financial_status || '').toLowerCase();
    if (status !== 'paid') {
      return { ok: true, ignored: true, reason: 'status_not_paid' };
    }
    const workspaceId = body.workspaceId || 'default';
    const phone = body.phone || body?.customer?.phone;
    const amount = body.total_price
      ? parseFloat(body.total_price)
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
   * Asaas/Pagamentos: espera body.event e body.payment.status = CONFIRMED
   * Header: X-Asaas-Token deve bater com ASAAS_WEBHOOK_TOKEN
   */
  @Public()
  @Post('asaas')
  async handleAsaas(
    @Headers('x-asaas-token') token: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req: any,
    @Body() body: any,
  ) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('invalid_asaas_token');
    }

    await this.ensureIdempotent(eventId, req);

    const status = body?.payment?.status || body?.status || '';
    const isPaid = status.toUpperCase() === 'CONFIRMED' || status.toLowerCase() === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId = body.workspaceId || body?.payment?.metadata?.workspaceId || 'default';
    const phone = body?.payment?.customer?.phone || body?.payment?.customer?.mobilePhone || body?.phone;
    const amount = body?.payment?.value || body?.value || 0;

    await this.autopilot.markConversion({
      workspaceId,
      phone,
      contactId: body?.payment?.customerId,
      reason: 'asaas_paid',
      meta: {
        paymentId: body?.payment?.id,
        amount,
        status,
        provider: 'asaas',
      },
    });

    // 🚀 NOTIFICAR CLIENTE VIA WHATSAPP
    if (phone && workspaceId !== 'default') {
      try {
        const confirmationMessage = `✅ *Pagamento Confirmado!*\n\n💰 Valor: R$ ${amount.toFixed(2)}\n📋 ID: ${body?.payment?.id || 'N/A'}\n\nObrigado pela sua compra! 🎉\n\nSe tiver qualquer dúvida, estou à disposição.`;
        
        await this.whatsapp.sendMessage(workspaceId, phone, confirmationMessage);
        this.logger.log(`✅ [ASAAS] Notificação enviada para ${phone}`);
      } catch (notifyError: any) {
        this.logger.warn(`⚠️ [ASAAS] Falha ao notificar cliente: ${notifyError?.message}`);
      }
    }

    return { ok: true, notified: !!phone };
  }

  /**
   * PagHiper webhook simples: header X-Paghiper-Token deve bater com PAGHIPER_WEBHOOK_TOKEN
   * status esperado: COMPLETED/PAID
   */
  @Public()
  @Post('paghiper')
  async handlePagHiper(
    @Headers('x-paghiper-token') token: string,
    @Headers('x-event-id') eventId: string | undefined,
    @Req() req: any,
    @Body() body: any,
  ) {
    const expected = process.env.PAGHIPER_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      throw new ForbiddenException('invalid_paghiper_token');
    }

    await this.ensureIdempotent(eventId, req);

    const status = (body?.status || body?.transaction?.status || '').toLowerCase();
    const isPaid = ['paid', 'completed', 'complete'].some((s) =>
      status.includes(s),
    );
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId ||
      body?.metadata?.workspaceId ||
      body?.transaction?.metadata?.workspaceId ||
      'default';

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
   * WooCommerce webhook (order paid)
   * Header: X-WC-Webhook-Signature validado com WC_WEBHOOK_SECRET (base64 HMAC sha256 do rawBody)
   */
  @Public()
  @Post('woocommerce')
  async handleWoo(
    @Req() req: any,
    @Headers('x-wc-webhook-signature') signature: string,
    @Body() body: any,
  ) {
    const secret = process.env.WC_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('WC_WEBHOOK_SECRET not set');
    }
    const raw = req?.rawBody || JSON.stringify(body);
    const digest = crypto
      .createHmac('sha256', secret)
      .update(raw, 'utf8')
      .digest('base64');
    if (digest !== signature) {
      throw new ForbiddenException('invalid_wc_signature');
    }

    const status = (body?.status || '').toLowerCase();
    const isPaid = status === 'completed' || status === 'processing' || status === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId ||
      body?.meta_data?.find?.((m: any) => m.key === 'workspaceId')?.value ||
      'default';

    const phone =
      body?.billing?.phone ||
      body?.customer?.phone ||
      body?.phone;

    await this.autopilot.markConversion({
      workspaceId,
      phone,
      reason: 'woocommerce_paid',
      meta: {
        provider: 'woocommerce',
        orderId: body?.id || body?.number,
        amount: body?.total ? parseFloat(body.total) : undefined,
        currency: body?.currency,
        status,
      },
    });

    return { ok: true };
  }

  /**
   * Idempotência leve: usa x-event-id ou hash do rawBody; TTL 5 min.
   */
  private async ensureIdempotent(eventId: string | undefined, req: any) {
    const raw = req?.rawBody || JSON.stringify(req?.body || '');
    const key =
      eventId ||
      crypto
        .createHash('sha256')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 32);
    const cacheKey = `webhook:payment:${key}`;
    const set = await this.redis.setnx(cacheKey, '1');
    if (set === 0) {
      this.logger.warn(`Duplicate payment webhook ignored: ${key}`);
      await this.sendOpsAlert('webhook_duplicate_payment', { key, path: req?.url });
      throw new ForbiddenException('duplicate_event');
    }
    await this.redis.expire(cacheKey, 300);
  }

  private async sendOpsAlert(message: string, meta: any) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !(global as any).fetch) return;
    try {
      await (global as any).fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: message,
          meta,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
      });
    } catch {
      // best effort
    }

    try {
      const payload = {
        type: message,
        meta,
        at: new Date().toISOString(),
      };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(payload));
      await this.redis.ltrim('alerts:webhooks', 0, 49);
    } catch {
      // ignore
    }
  }
}
