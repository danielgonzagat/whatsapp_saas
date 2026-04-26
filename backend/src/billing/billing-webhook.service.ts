import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { getTraceHeaders } from '../common/trace-headers';
import { PrismaService } from '../prisma/prisma.service';
import { activatePlanFeatures } from './billing-plan-features';
import { StripeRuntime } from './stripe-runtime';
import type {
  StripeCheckoutSession,
  StripeClient,
  StripeEvent,
  StripeInvoice,
  StripeSubscription,
} from './stripe-types';
type StripeInvoiceWithSubscription = StripeInvoice & {
  subscription?: string | { id?: string | null } | null;
};
type StripeSubscriptionWithPeriodEnd = StripeSubscription & {
  current_period_end?: number | null;
};
type WhatsappNotifier = {
  sendMessage(workspaceId: string, phone: string, message: string): Promise<unknown>;
};
/**
 * BillingWebhookService
 *
 * Handles Stripe webhook verification, checkout fulfillment,
 * subscription status sync, and ops notifications.
 * Extracted from BillingService to keep file size manageable.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private stripe: StripeClient;
  private whatsappService: WhatsappNotifier | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    private readonly financialAlert?: FinancialAlertService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new StripeRuntime(secretKey);
    }
  }
  private readInvoiceSubscriptionId(invoice: StripeInvoice): string | null {
    const subscriptionRef = (invoice as StripeInvoiceWithSubscription).subscription;
    if (typeof subscriptionRef === 'string' && subscriptionRef.trim()) {
      return subscriptionRef;
    }
    if (
      subscriptionRef &&
      typeof subscriptionRef === 'object' &&
      typeof subscriptionRef.id === 'string' &&
      subscriptionRef.id.trim()
    ) {
      return subscriptionRef.id;
    }
    return null;
  }
  private async resolveWhatsappService(): Promise<WhatsappNotifier | null> {
    if (this.whatsappService) {
      return this.whatsappService;
    }
    try {
      const { WhatsappService } = await import('../whatsapp/whatsapp.service');
      this.whatsappService = this.moduleRef.get(WhatsappService, { strict: false }) ?? null;
      return this.whatsappService;
    } catch {
      return null;
    }
  }

  /** Handle Stripe webhook event. */
  async handleWebhook(signature: string, rawBody: Buffer) {
    if (!this.stripe) {
      this.logger.warn('Webhook recebido mas Stripe não está configurado');
      return { received: false, reason: 'stripe_not_configured' };
    }
    if (!rawBody || !signature) {
      this.logger.error('Webhook sem rawBody ou signature');
      throw new Error('Missing rawBody or signature for webhook verification');
    }
    const endpointSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    if (!endpointSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET não configurado');
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }
    let event: StripeEvent;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Webhook signature verification failed: ${JSON.stringify({ error: errMsg, signatureLength: signature?.length, bodyLength: rawBody?.length })}`,
      );
      this.financialAlert?.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        { provider: 'stripe' },
      );
      throw new Error(`Webhook signature verification failed`);
    }
    this.logger.log(`Webhook recebido: ${JSON.stringify({ type: event.type, id: event.id })}`);
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const checkoutSession = session;
          const mode = checkoutSession.mode as string | undefined;
          const hasSubscription = !!checkoutSession.subscription;
          if (mode === 'subscription' || hasSubscription) {
            await this.fulfillCheckout(session);
          }
          break;
        }
        case 'customer.subscription.updated': {
          await this.syncSubscriptionStatus(event.data.object);
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await this.cancelSubscriptionByStripeId(sub.id);
          break;
        }
        case 'invoice.payment_failed': {
          const subId = this.readInvoiceSubscriptionId(event.data.object);
          if (subId) await this.markSubscriptionStatus(subId, 'PAST_DUE');
          break;
        }
        case 'invoice.payment_succeeded': {
          const subId = this.readInvoiceSubscriptionId(event.data.object);
          if (subId) await this.markSubscriptionStatus(subId, 'ACTIVE');
          break;
        }
        default:
          break;
      }
    } catch (err) {
      this.financialAlert?.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        { provider: 'stripe', eventType: event.type, externalId: event.id },
      );
      throw err;
    }
    return { received: true };
  }
  private async fulfillCheckout(session: StripeCheckoutSession) {
    const workspaceId = session.metadata?.workspaceId;
    const plan = session.metadata?.plan || 'PRO';
    const subscriptionId = session.subscription as string;
    if (workspaceId) {
      await this.prisma.subscription.upsert({
        where: { workspaceId },
        update: {
          status: 'ACTIVE',
          plan,
          stripeId: subscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        create: {
          workspaceId,
          status: 'ACTIVE',
          plan,
          stripeId: subscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await activatePlanFeatures(this.prisma, workspaceId, plan);
      await this.notifyCustomerPaymentConfirmed(workspaceId, session, plan);
      this.logger.log(`Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
    }
  }
  private mapStripeStatus(status: string | null | undefined): string {
    if (!status) return 'ACTIVE';
    const normalized = status.toLowerCase();
    if (['canceled', 'cancelled'].includes(normalized)) return 'CANCELED';
    if (['past_due', 'incomplete', 'unpaid'].includes(normalized)) return 'PAST_DUE';
    if (['trialing'].includes(normalized)) return 'TRIALING';
    return 'ACTIVE';
  }
  private async syncSubscriptionStatus(subscription: StripeSubscription) {
    const workspaceId = await this.resolveWorkspaceId(subscription);
    if (!workspaceId) return;
    const status = this.mapStripeStatus(subscription.status);
    const currentPeriodEndRaw = (subscription as StripeSubscriptionWithPeriodEnd)
      .current_period_end;
    const periodEnd = currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : undefined;
    await this.prisma.subscription.upsert({
      where: { workspaceId },
      update: {
        status,
        plan: subscription.items.data[0]?.price?.id || subscription.id,
        stripeId: subscription.id,
        currentPeriodEnd: periodEnd || new Date(),
      },
      create: {
        workspaceId,
        status,
        plan: subscription.items.data[0]?.price?.id || 'PRO',
        stripeId: subscription.id,
        currentPeriodEnd: periodEnd || new Date(),
      },
    });
  }
  private async resolveWorkspaceId(subscription: StripeSubscription): Promise<string | null> {
    const metaWs = (subscription.metadata as Record<string, string> | null)?.workspaceId;
    if (metaWs) return metaWs;
    const customerId = subscription.customer as string;
    if (!customerId) return null;
    const ws = await this.prisma.workspace.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return ws?.id || null;
  }
  async markSubscriptionStatus(stripeSubscriptionId: string, status: string) {
    let workspaceId: string | null = null;
    if (this.stripe) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        workspaceId = await this.resolveWorkspaceId(sub);
      } catch {
        this.logger.debug('Unable to resolve workspace from Stripe subscription; checking local.');
      }
    }
    if (!workspaceId) {
      const subRecord = await this.prisma.subscription.findFirst({
        where: { stripeId: stripeSubscriptionId },
        select: { workspaceId: true },
      });
      workspaceId = subRecord?.workspaceId || null;
    }
    if (!workspaceId) return;

    if (['PAST_DUE', 'CANCELED'].includes(status)) {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (ws?.providerSettings as Record<string, unknown>) || {};
      const autopilot = (settings.autopilot ?? {}) as Record<string, unknown>;
      const nextSettings = {
        ...settings,
        autopilot: { ...autopilot, enabled: false },
        billingSuspended: true,
      };
      await this.prisma.$transaction(
        async (tx) => {
          await tx.subscription.update({ where: { workspaceId }, data: { status } });
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { providerSettings: nextSettings },
          });
          await tx.auditLog.create({
            data: {
              workspaceId,
              action: 'SUBSCRIPTION_STATUS',
              resource: 'subscription',
              resourceId: stripeSubscriptionId,
              details: { status, billingSuspended: true },
            },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      await this.notifyOps('billing_suspended', {
        workspaceId,
        subscription: stripeSubscriptionId,
        status,
      });
    } else if (status === 'ACTIVE') {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (ws?.providerSettings as Record<string, unknown>) || {};
      const nextSettings = { ...settings } as Record<string, unknown>;
      if (settings.billingSuspended) {
        delete nextSettings.billingSuspended;
      }
      await this.prisma.$transaction(
        async (tx) => {
          await tx.subscription.update({ where: { workspaceId }, data: { status } });
          if (settings.billingSuspended) {
            await tx.workspace.update({
              where: { id: workspaceId },
              data: { providerSettings: nextSettings as Prisma.InputJsonValue },
            });
          }
          await tx.auditLog.create({
            data: {
              workspaceId,
              action: 'SUBSCRIPTION_STATUS',
              resource: 'subscription',
              resourceId: stripeSubscriptionId,
              details: { status, billingSuspended: false },
            },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      await this.notifyOps('billing_active', {
        workspaceId,
        subscription: stripeSubscriptionId,
        status,
      });
    } else {
      await this.prisma.subscription.update({ where: { workspaceId }, data: { status } });
    }
  }
  private async cancelSubscriptionByStripeId(stripeId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.subscription.findFirst({
          where: { stripeId },
          select: { workspaceId: true },
        });
        if (!target) return;

        await tx.subscription.updateMany({
          where: { stripeId, workspaceId: target.workspaceId },
          data: { status: 'CANCELED' },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    this.logger.log(`Subscription CANCELED: ${stripeId}`);
  }
  private async notifyCustomerPaymentConfirmed(
    workspaceId: string,
    session: StripeCheckoutSession,
    plan: string,
  ): Promise<void> {
    const whatsappService = await this.resolveWhatsappService();
    if (!whatsappService) {
      this.logger.log('WhatsappService não disponível para notificação');
      return;
    }
    try {
      const customerEmail = session.customer_email || session.customer_details?.email;
      let phone: string | null = null;
      if (customerEmail) {
        const contact = await this.prisma.contact.findFirst({
          where: { workspaceId, email: customerEmail },
          select: { phone: true },
        });
        phone = contact?.phone || null;
      }
      if (!phone) {
        this.logger.log(`Nenhum telefone encontrado para notificar workspace ${workspaceId}`);
        return;
      }
      const fallbackPrices: Record<string, number> = { STARTER: 97, PRO: 297, ENTERPRISE: 997 };
      let amount = session.amount_total ? session.amount_total / 100 : 0;
      if (!amount) amount = fallbackPrices[plan.toUpperCase()] || 0;
      const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
      const message = `Pagamento confirmado.\n\nObrigado por assinar o plano *${plan}*!\n\nValor: R$ ${formattedAmount}\nID: ${paymentIntentId}\n\nSua conta já está ativa com todas as funcionalidades do plano. Se precisar de ajuda, é só me chamar aqui.`;
      await whatsappService.sendMessage(workspaceId, phone, message);
      this.logger.log(`Notificação de pagamento enviada para ${phone}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      this.logger.warn(`Erro ao notificar cliente: ${errorMessage}`);
      this.financialAlert?.reconciliationAlert('billing customer notification failed', {
        workspaceId,
        details: { plan, error: errorMessage },
      });
    }
  }
  async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
    const webhook = process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL || '';
    const globalFetch = (globalThis as Record<string, unknown>).fetch as
      | ((url: string, init?: Record<string, unknown>) => Promise<unknown>)
      | undefined;
    if (!webhook || !globalFetch) return;
    try {
      await globalFetch(webhook, {
        method: 'POST',
        headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: event,
          ...payload,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      this.logger.warn(`notifyOps billing error: ${errMsg}`);
      this.financialAlert?.reconciliationAlert('billing ops notification failed', {
        details: { event, error: errMsg },
      });
    }
  }
}
