import crypto from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import Stripe from 'stripe';
import { Public } from '../auth/public.decorator';
import { AutopilotService } from '../autopilot/autopilot.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WebhooksService } from './webhooks.service';

/**
 * Webhook genérico de pagamento/loja para marcar conversões reais no Autopilot.
 * Use header X-Webhook-Secret para autenticar.
 */
@Controller('webhook/payment')
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly autopilot: AutopilotService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly webhooksService: WebhooksService,
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
        throw new BadRequestException('Missing rawBody for Stripe webhook verification');
      }
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        this.logger.warn('STRIPE_SECRET_KEY not configured — payment webhooks disabled');
        return {
          received: true,
          skipped: true,
          reason: 'Stripe not configured',
        };
      }
      const stripe = new Stripe(stripeKey);
      event = stripe.webhooks.constructEvent(req.rawBody, stripeSignature, endpointSecret);
    }

    const stripeDupe = await this.ensureIdempotent(eventId || event?.id || body?.id, req);
    if (stripeDupe) return stripeDupe;

    // Log webhook event for audit trail
    const stripeExternalId = event?.id || eventId || body?.id || `stripe_${Date.now()}`;
    let webhookEvent: any;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'stripe',
        event?.type || 'unknown',
        String(stripeExternalId),
        body,
      );
    } catch (err: any) {
      if (err?.code === 'P2002') {
        this.logger.log(`Duplicate Stripe webhook event ${stripeExternalId}, returning 200`);
        return {
          received: true,
          skipped: true,
          reason: 'duplicate_webhook_event',
        };
      }
      this.logger.warn(`Failed to log Stripe webhook event: ${err?.message}`);
    }

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

      // Atualizar status do pagamento (modelo Payment) with state machine validation
      try {
        if (this.prisma.payment) {
          const stripePaymentExternalId = session.payment_intent || session.id;
          const existingPayment = await this.prisma.payment.findFirst({
            where: { workspaceId, externalId: stripePaymentExternalId },
          });
          const canTransition =
            !existingPayment ||
            validatePaymentTransition(existingPayment.status || 'PENDING', 'RECEIVED', {
              paymentId: existingPayment?.id,
              provider: 'stripe',
              externalId: stripePaymentExternalId,
            });
          if (canTransition) {
            await this.prisma.payment.updateMany({
              where: { workspaceId, externalId: stripePaymentExternalId },
              data: { status: 'RECEIVED' },
            });
          } else {
            this.logger.warn(
              `Stripe webhook rejected by state machine: ${existingPayment?.status} -> RECEIVED for ${stripePaymentExternalId}`,
            );
          }
        }
      } catch (paymentErr: any) {
        this.logger.warn(`Não foi possível atualizar pagamento Stripe: ${paymentErr?.message}`);
      }

      // Atualizar status da venda (KloelSale)
      try {
        if (this.prisma.kloelSale) {
          await this.prisma.kloelSale.updateMany({
            where: {
              workspaceId,
              externalPaymentId: session.payment_intent || session.id,
            },
            data: { status: 'paid', paidAt: new Date() },
          });
        }
      } catch (saleErr: any) {
        this.logger.warn(`Não foi possível atualizar KloelSale (Stripe): ${saleErr?.message}`);
      }

      // Notificar cliente via WhatsApp
      const customerPhone =
        contact?.phone || phone ? String(contact?.phone || phone).replace(/\D/g, '') : undefined;
      if (customerPhone) {
        try {
          const formattedAmount = amount.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
          });
          const confirmationMessage =
            `Pagamento confirmado.\n\n` +
            `Valor: ${currency === 'BRL' ? 'R$' : currency} ${formattedAmount}\n` +
            `ID: ${session.payment_intent || session.id}\n\n` +
            `Obrigado pela sua compra.\n\n` +
            `Se tiver qualquer dúvida, estou à disposição.`;

          // messageLimit: enforced via PlanLimitsService.trackMessageSend
          await this.whatsapp.sendMessage(workspaceId, customerPhone, confirmationMessage);
          this.logger.log(`[STRIPE] Notificação enviada para ${customerPhone}`);
        } catch (notifyErr: any) {
          this.logger.warn(`[STRIPE] Falha ao notificar cliente: ${notifyErr?.message}`);
        }
      } else {
        this.logger.warn(`[STRIPE] Sem telefone para notificar. Email: ${email}`);
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

      // Ativar autopilot para continuar atendimento pós-venda
      if (contact?.id) {
        try {
          await this.autopilot.triggerPostPurchaseFlow(workspaceId, contact.id, {
            provider: 'stripe',
            amount,
            productName: session.metadata?.productName,
          });
        } catch (flowErr: any) {
          this.logger.warn(`[STRIPE] Erro ao ativar fluxo pós-venda: ${flowErr?.message}`);
        }
      }
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
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
      if (!this.verifySharedSecretOrSignature(req, expected, secret, acceptedSignature)) {
        throw new ForbiddenException('invalid_webhook_secret');
      }
    }

    const genericDupe = await this.ensureIdempotent(eventId, req);
    if (genericDupe) return genericDupe;

    // Log webhook event for audit trail
    const genericExternalId = eventId || body.orderId || `generic_${Date.now()}`;
    let genericWebhookEvent: any;
    try {
      genericWebhookEvent = await this.webhooksService.logWebhookEvent(
        body.provider || 'generic',
        body.status || 'unknown',
        String(genericExternalId),
        body,
      );
    } catch (err: any) {
      if (err?.code === 'P2002') {
        this.logger.log(`Duplicate generic webhook event ${genericExternalId}, returning 200`);
        return { ok: true, skipped: true, reason: 'duplicate_webhook_event' };
      }
      this.logger.warn(`Failed to log generic webhook event: ${err?.message}`);
    }

    const status = (body.status || '').toLowerCase();
    const isPaid =
      ['paid', 'pago', 'paga', 'payed', 'captured', 'success'].some((s) => status.includes(s)) ||
      status === 'payment_received';

    if (!isPaid) {
      return { ok: true, ignored: true, reason: 'status_not_paid' };
    }

    const workspaceId = body.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);

    const normalizedPhone = body.phone ? String(body.phone).replace(/\D/g, '') : undefined;

    // Atualiza venda (KloelSale) e/ou Payment quando possível
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
      } catch (saleErr: any) {
        this.logger.warn(`Não foi possível atualizar KloelSale (generic): ${saleErr?.message}`);
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
      } catch (paymentErr: any) {
        this.logger.warn(`Não foi possível atualizar Payment (generic): ${paymentErr?.message}`);
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
          `Pagamento confirmado.\n\n` +
          (amountText ? `Valor: R$ ${amountText}\n` : '') +
          (body.orderId ? `Pedido: ${body.orderId}\n` : '') +
          `\nObrigado pela sua compra!`;
        // messageLimit: enforced via PlanLimitsService.trackMessageSend
        await this.whatsapp.sendMessage(workspaceId, normalizedPhone, msg);
      } catch (notifyErr: any) {
        this.logger.warn(`Falha ao notificar cliente (generic): ${notifyErr?.message}`);
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
        this.logger.warn(`Erro ao ativar fluxo pós-venda (generic): ${flowErr?.message}`);
      }
    }

    if (genericWebhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(genericWebhookEvent.id).catch(() => {});
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
    const shopifyDupe = await this.ensureIdempotent(eventId, req);
    if (shopifyDupe) return shopifyDupe;
    const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
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
   * `/webhook/payment/asaas` — DEPRECATED route. Returns HTTP 410 Gone.
   *
   * The canonical Asaas webhook is `/checkout/webhooks/asaas`
   * (CheckoutWebhookController). PR P0-2 unified the dedup strategy
   * on the canonical route. PR P4-4 closes this legacy route by
   * returning 410 so operators reconfigure Asaas to point at
   * the canonical route.
   *
   * 410 Gone is the documented HTTP status for "intentionally
   * removed"; webhook providers stop retrying on 410 (vs 404 which
   * they treat as a transient routing issue and keep retrying).
   */
  @Public()
  @Post('asaas')
  handleAsaas() {
    this.logger.warn(
      '[GONE] /webhook/payment/asaas received traffic — return 410, configure Asaas to use /checkout/webhooks/asaas',
    );
    throw new HttpException(
      {
        ok: false,
        gone: true,
        message:
          'This webhook endpoint is deprecated. Configure Asaas to send webhooks to /checkout/webhooks/asaas instead.',
      },
      HttpStatus.GONE,
    );
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

    const paghiperDupe = await this.ensureIdempotent(eventId, req);
    if (paghiperDupe) return paghiperDupe;

    const status = (body?.status || body?.transaction?.status || '').toLowerCase();
    const isPaid = ['paid', 'completed', 'complete'].some((s) => status.includes(s));
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId || body?.metadata?.workspaceId || body?.transaction?.metadata?.workspaceId;
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
    const digest = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
    if (digest !== signature) {
      throw new ForbiddenException('invalid_wc_signature');
    }

    const status = (body?.status || '').toLowerCase();
    const isPaid = status === 'completed' || status === 'processing' || status === 'paid';
    if (!isPaid) return { ok: true, ignored: true, reason: 'status_not_paid' };

    const workspaceId =
      body.workspaceId || body?.meta_data?.find?.((m: any) => m.key === 'workspaceId')?.value;
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
        amount: body?.total ? Number.parseFloat(body.total) : undefined,
        currency: body?.currency,
        status,
      },
    });

    return { ok: true };
  }

  /**
   * Idempotência leve: usa x-event-id ou hash do rawBody; TTL 5 min.
   *
   * Returns a duplicate-response object when the event has already been
   * processed (caller should `return` it to respond with HTTP 200). Returns
   * null when the event is new and processing should proceed.
   *
   * Invariant I1 (webhook idempotency). Key changes vs previous implementation:
   *   - Atomic SET EX NX (single command) instead of non-atomic SETNX + EXPIRE.
   *     The previous pattern could leak keys forever if the process crashed
   *     between SETNX and EXPIRE.
   *   - Returns 200 instead of throwing 403. Providers (Stripe, Asaas, Shopify)
   *     interpret 4xx as a retry signal, which created a retry storm on
   *     duplicates.
   */
  private async ensureIdempotent(
    eventId: string | undefined,
    req: any,
  ): Promise<{ ok: true; received: true; duplicate: true; reason: string } | null> {
    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const key =
      eventId ||
      crypto
        .createHash('sha256')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 32);
    const cacheKey = `webhook:payment:${key}`;
    // Atomic set-if-not-exists with TTL. Returns 'OK' on first write,
    // null when the key already existed.
    const result = await this.redis.set(cacheKey, '1', 'EX', 300, 'NX');
    if (result === null) {
      this.logger.warn(`Duplicate payment webhook ignored: ${key}`);
      await this.sendOpsAlert('webhook_duplicate_payment', {
        key,
        path: req?.url,
      });
      return {
        ok: true,
        received: true,
        duplicate: true,
        reason: 'duplicate_event',
      };
    }
    return null;
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

    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const payload = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    const hexDigest = crypto.createHmac('sha256', expectedSecret).update(payload).digest('hex');
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
    return crypto.timingSafeEqual(Buffer.from(normalizedLeft), Buffer.from(normalizedRight));
  }

  private async sendOpsAlert(message: string, meta: any) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !globalThis.fetch) return;
    try {
      validateNoInternalAccess(url);
      await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: message,
          meta,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
        signal: AbortSignal.timeout(10000),
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
