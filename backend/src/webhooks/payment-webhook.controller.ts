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
import Stripe from 'stripe';
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
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: any,
  ) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !endpointSecret) {
      throw new ForbiddenException('STRIPE_WEBHOOK_SECRET not configured');
    }

    // Verifica assinatura do Stripe quando configurado (recomendado sempre em prod)
    let event: any = body;
    if (endpointSecret) {
      if (!stripeSignature) {
        throw new BadRequestException('Missing stripe-signature header');
      }
      if (!req.rawBody) {
        throw new BadRequestException(
          'Missing rawBody for Stripe webhook verification',
        );
      }
      const stripe = new Stripe(
        process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
      );
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        stripeSignature,
        endpointSecret,
      );
    }

    await this.ensureIdempotent(eventId || event?.id || body?.id, req);
    if (event?.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId) {
        throw new BadRequestException('missing_workspaceId');
      }
      await this.assertWorkspaceExists(workspaceId);
      const email = session.customer_details?.email || session.customer_email;
      const phone = session.customer_details?.phone || session.metadata?.phone;
      const amount = session.amount_total ? session.amount_total / 100 : 0;
      const currency = session.currency?.toUpperCase() || 'BRL';

      let contact: any = null;
      // Buscar contato por email OU telefone
      if (email) {
        contact = await this.prisma.contact.findFirst({
          where: { workspaceId, email },
        });
      }
      if (!contact && phone) {
        const normalizedPhone = String(phone).replace(/\D/g, '');
        contact = await this.prisma.contact.findFirst({
          where: { workspaceId, phone: normalizedPhone },
        });
      }

      // Atualizar status do pagamento (modelo Payment, se existir)
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
          this.logger.warn(
            `Não foi possível atualizar pagamento Stripe: ${paymentErr?.message}`,
          );
        }
      }

      // Atualizar status da venda (KloelSale, se existir)
      const prismaAny = this.prisma as any;
      if (prismaAny?.kloelSale?.updateMany) {
        try {
          await prismaAny.kloelSale.updateMany({
            where: {
              workspaceId,
              externalPaymentId: session.payment_intent || session.id,
            },
            data: { status: 'paid', paidAt: new Date() },
          });
        } catch (saleErr: any) {
          this.logger.warn(
            `Não foi possível atualizar KloelSale (Stripe): ${saleErr?.message}`,
          );
        }
      }

      // 🚀 NOTIFICAR CLIENTE VIA WHATSAPP
      const customerPhone =
        contact?.phone || phone
          ? String(contact?.phone || phone).replace(/\D/g, '')
          : undefined;
      if (customerPhone) {
        try {
          const formattedAmount = amount.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
          });
          const confirmationMessage =
            `✅ *Pagamento Confirmado!*\n\n` +
            `💰 Valor: ${currency === 'BRL' ? 'R$' : currency} ${formattedAmount}\n` +
            `📋 ID: ${session.payment_intent || session.id}\n\n` +
            `Obrigado pela sua compra! 🎉\n\n` +
            `Se tiver qualquer dúvida, estou à disposição.`;

          await this.whatsapp.sendMessage(
            workspaceId,
            customerPhone,
            confirmationMessage,
          );
          this.logger.log(
            `✅ [STRIPE] Notificação enviada para ${customerPhone}`,
          );
        } catch (notifyErr: any) {
          this.logger.warn(
            `⚠️ [STRIPE] Falha ao notificar cliente: ${notifyErr?.message}`,
          );
        }
      } else {
        this.logger.warn(
          `⚠️ [STRIPE] Sem telefone para notificar. Email: ${email}`,
        );
      }

      // Marcar conversão no autopilot
      await this.autopilot.markConversion({
        workspaceId,
        contactId: contact?.id,
        phone: customerPhone,
        reason: 'stripe_paid',
        meta: {
          provider: 'stripe',
          paymentIntent: session.payment_intent || session.id,
          amount,
          currency,
          email,
        },
      });

      // 🔄 Ativar autopilot para continuar atendimento pós-venda
      if (contact?.id) {
        try {
          await this.autopilot.triggerPostPurchaseFlow(
            workspaceId,
            contact.id,
            {
              provider: 'stripe',
              amount,
              productName: session.metadata?.productName,
            },
          );
        } catch (flowErr: any) {
          this.logger.warn(
            `⚠️ [STRIPE] Erro ao ativar fluxo pós-venda: ${flowErr?.message}`,
          );
        }
      }
    }

    return { received: true };
  }

  @Public()
  @Post()
  async handlePayment(
    @Headers('x-webhook-secret') secret: string,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-webhook-signature') webhookSignature: string | undefined,
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
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAYMENT_WEBHOOK_SECRET not configured');
    }
    if (expected) {
      const acceptedSignature = signature || webhookSignature;
      if (
        !this.verifySharedSecretOrSignature(
          req,
          expected,
          secret,
          acceptedSignature,
        )
      ) {
        throw new ForbiddenException('invalid_webhook_secret');
      }
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

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);

    const prismaAny = this.prisma as any;
    const normalizedPhone = body.phone
      ? String(body.phone).replace(/\D/g, '')
      : undefined;

    // Atualiza venda (KloelSale) e/ou Payment quando possível
    if (prismaAny?.kloelSale?.updateMany && (body.orderId || body.provider)) {
      try {
        await prismaAny.kloelSale.updateMany({
          where: {
            workspaceId,
            OR: [
              body.orderId
                ? { externalPaymentId: String(body.orderId) }
                : undefined,
              body.orderId ? { id: String(body.orderId) } : undefined,
            ].filter(Boolean) as any,
          },
          data: { status: 'paid', paidAt: new Date() },
        });
      } catch (saleErr: any) {
        this.logger.warn(
          `Não foi possível atualizar KloelSale (generic): ${saleErr?.message}`,
        );
      }
    }

    const paymentModel = (this.prisma as any).payment;
    if (paymentModel?.updateMany && body.orderId) {
      try {
        await paymentModel.updateMany({
          where: { workspaceId, externalId: String(body.orderId) },
          data: { status: 'RECEIVED' },
        });
      } catch (paymentErr: any) {
        this.logger.warn(
          `Não foi possível atualizar Payment (generic): ${paymentErr?.message}`,
        );
      }
    }

    // Resolve contato (se houver) para disparar pós-compra
    let contact: any = null;
    if (body.contactId) {
      contact = await this.prisma.contact.findFirst({
        where: { workspaceId, id: body.contactId },
      });
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

    // Notificação WhatsApp (garante conversa via persistência do WhatsappService)
    if (normalizedPhone) {
      try {
        const amountText =
          typeof body.amount === 'number'
            ? body.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : undefined;
        const msg =
          `✅ *Pagamento Confirmado!*\n\n` +
          (amountText ? `💰 Valor: R$ ${amountText}\n` : '') +
          (body.orderId ? `📋 Pedido: ${body.orderId}\n` : '') +
          `\nObrigado pela sua compra!`;
        await this.whatsapp.sendMessage(workspaceId, normalizedPhone, msg);
      } catch (notifyErr: any) {
        this.logger.warn(
          `Falha ao notificar cliente (generic): ${notifyErr?.message}`,
        );
      }
    }

    if (contact?.id) {
      try {
        await this.autopilot.triggerPostPurchaseFlow(workspaceId, contact.id, {
          provider: body.provider || 'generic',
          amount: body.amount,
          orderId: body.orderId,
        });
      } catch (flowErr: any) {
        this.logger.warn(
          `Erro ao ativar fluxo pós-venda (generic): ${flowErr?.message}`,
        );
      }
    }

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
    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);
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
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('ASAAS_WEBHOOK_TOKEN not configured');
    }
    if (expected) {
      if (!token || token !== expected) {
        throw new ForbiddenException('invalid_asaas_token');
      }
    }

    await this.ensureIdempotent(eventId, req);

    const status = body?.payment?.status || body?.status || '';
    const isPaid =
      status.toUpperCase() === 'CONFIRMED' || status.toLowerCase() === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId || body?.payment?.metadata?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);

    const phoneRaw =
      body?.payment?.customer?.phone ||
      body?.payment?.customer?.mobilePhone ||
      body?.phone;
    const phone = phoneRaw ? String(phoneRaw).replace(/\D/g, '') : undefined;
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
    if (phone) {
      try {
        const confirmationMessage = `✅ *Pagamento Confirmado!*\n\n💰 Valor: R$ ${amount.toFixed(2)}\n📋 ID: ${body?.payment?.id || 'N/A'}\n\nObrigado pela sua compra! 🎉\n\nSe tiver qualquer dúvida, estou à disposição.`;

        await this.whatsapp.sendMessage(
          workspaceId,
          phone,
          confirmationMessage,
        );
        this.logger.log(`✅ [ASAAS] Notificação enviada para ${phone}`);
      } catch (notifyError: any) {
        this.logger.warn(
          `⚠️ [ASAAS] Falha ao notificar cliente: ${notifyError?.message}`,
        );
      }
    }

    return { ok: true, notified: !!phone };
  }

  private async assertWorkspaceExists(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!ws) {
      throw new BadRequestException('invalid_workspaceId');
    }
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
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAGHIPER_WEBHOOK_TOKEN not configured');
    }
    if (expected) {
      if (!token || token !== expected) {
        throw new ForbiddenException('invalid_paghiper_token');
      }
    }

    await this.ensureIdempotent(eventId, req);

    const status = (
      body?.status ||
      body?.transaction?.status ||
      ''
    ).toLowerCase();
    const isPaid = ['paid', 'completed', 'complete'].some((s) =>
      status.includes(s),
    );
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId ||
      body?.metadata?.workspaceId ||
      body?.transaction?.metadata?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);

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
        transactionId:
          body?.transaction?.transaction_id || body?.transaction_id,
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
    const isPaid =
      status === 'completed' || status === 'processing' || status === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId ||
      body?.meta_data?.find?.((m: any) => m.key === 'workspaceId')?.value;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);

    const phone = body?.billing?.phone || body?.customer?.phone || body?.phone;

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
      await this.sendOpsAlert('webhook_duplicate_payment', {
        key,
        path: req?.url,
      });
      throw new ForbiddenException('duplicate_event');
    }
    await this.redis.expire(cacheKey, 300);
  }

  private verifySharedSecretOrSignature(
    req: any,
    expectedSecret: string,
    sharedSecret?: string,
    signature?: string,
  ): boolean {
    if (sharedSecret && this.safeCompare(sharedSecret, expectedSecret)) {
      return true;
    }

    if (!signature) {
      return false;
    }

    const raw = req?.rawBody || JSON.stringify(req?.body || '');
    const payload = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    const hexDigest = crypto
      .createHmac('sha256', expectedSecret)
      .update(payload)
      .digest('hex');
    const base64Digest = crypto
      .createHmac('sha256', expectedSecret)
      .update(payload)
      .digest('base64');

    return this.safeCompare(signature, hexDigest) || this.safeCompare(signature, base64Digest);
  }

  private safeCompare(left: string, right: string): boolean {
    const normalizedLeft = String(left || '').trim();
    const normalizedRight = String(right || '').trim();
    if (!normalizedLeft || normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(normalizedLeft),
      Buffer.from(normalizedRight),
    );
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
