import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
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
/** Billing service. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: StripeClient;
  private whatsappService: WhatsappNotifier | null = null;
  private normalizeSubscriptionStatus(status: string | null | undefined): string {
    return String(status || '')
      .trim()
      .toUpperCase();
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
    } else {
      if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
        this.logger.warn(
          'STRIPE_SECRET_KEY not found. Billing will run in MOCK mode if BILLING_MOCK_MODE=true.',
        );
      }
    }
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
  /** Get subscription. */
  async getSubscription(workspaceId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
    });
    const trialCredits = Number(
      this.configService.get<string>('TRIAL_CREDITS_USD') || process.env.TRIAL_CREDITS_USD || '5',
    );
    if (!sub) {
      return {
        status: 'none',
        plan: 'FREE',
        trialDaysLeft: 0,
        creditsBalance: 0,
        cancelAtPeriodEnd: false,
      };
    }
    let trialDaysLeft = 0;
    const normalizedStatus = this.normalizeSubscriptionStatus(sub.status);
    if (normalizedStatus === 'TRIAL' || normalizedStatus === 'TRIALING') {
      const now = new Date();
      const trialEnd = new Date(sub.currentPeriodEnd);
      const diffTime = trialEnd.getTime() - now.getTime();
      trialDaysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    let cancelAtPeriodEnd = sub.cancelAtPeriodEnd || false;
    if (this.stripe && sub.stripeId) {
      try {
        const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeId);
        cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
      } catch {
        this.logger.debug('Unable to refresh Stripe cancellation status; using stored value.');
      }
    }
    const statusMap: Record<string, string> = {
      FREE: 'none',
      ACTIVE: 'active',
      TRIAL: 'trial',
      TRIALING: 'trial',
      EXPIRED: 'expired',
      SUSPENDED: 'suspended',
      CANCELED: 'expired',
      PAST_DUE: 'expired',
    };
    const mappedStatus = statusMap[normalizedStatus] || 'none';
    const creditsBalance =
      mappedStatus === 'trial' ? (Number.isFinite(trialCredits) ? trialCredits : 5) : 0;
    return {
      status: mappedStatus,
      plan: sub.plan || 'FREE',
      trialDaysLeft,
      creditsBalance,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd,
    };
  }
  /** Activate trial. */
  async activateTrial(workspaceId: string) {
    const trialDays = Number(
      this.configService.get<string>('TRIAL_DAYS') || process.env.TRIAL_DAYS || '7',
    );
    const safeTrialDays = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 7;
    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + safeTrialDays * 24 * 60 * 60 * 1000);
    const existing = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true, plan: true },
    });
    if (existing && ['ACTIVE', 'TRIAL', 'TRIALING'].includes(existing.status)) {
      return this.getSubscription(workspaceId);
    }
    const plan = existing?.plan || 'STARTER';
    await this.prisma.$transaction(
      async (tx) => {
        await tx.subscription.upsert({
          where: { workspaceId },
          update: {
            status: 'TRIAL',
            plan,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          },
          create: {
            workspaceId,
            status: 'TRIAL',
            plan,
            currentPeriodEnd,
            cancelAtPeriodEnd: false,
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'TRIAL_ACTIVATED',
            resource: 'subscription',
            resourceId: workspaceId,
            details: { trialDays: safeTrialDays },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return this.getSubscription(workspaceId);
  }
  /** Get usage. */
  async getUsage(workspaceId: string) {
    const [messages, flows, contacts] = await Promise.all([
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }), // Current month approx
      this.prisma.flow.count({ where: { workspaceId } }),
      this.prisma.contact.count({ where: { workspaceId } }),
    ]);
    return {
      messages,
      flows,
      contacts,
    };
  }
  async createCheckoutSession(workspaceId: string, plan: string, userEmail: string) {
    if (!this.stripe) {
      const nodeEnv = this.configService.get('NODE_ENV') || process.env.NODE_ENV;
      if (nodeEnv === 'production') {
        throw new Error('Infraestrutura de cobrança indisponível em produção');
      }
      let allowMock = this.configService.get('BILLING_MOCK_MODE') === 'true';
      if (
        allowMock &&
        (this.configService.get('NODE_ENV') || process.env.NODE_ENV) === 'production'
      ) {
        this.logger.error(
          'CRITICAL: BILLING_MOCK_MODE=true is set in production! Disabling mock mode to prevent fake subscriptions.',
        );
        allowMock = false;
      }
      if (!allowMock) {
        throw new Error('Infraestrutura de cobrança indisponível');
      }
      this.logger.log(`Mocking checkout for ${workspaceId} plan ${plan}`);
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
      const mockStripeId = `mock_sub_${Date.now()}`;
      await this.prisma.$transaction(
        async (tx) => {
          await tx.subscription.upsert({
            where: { workspaceId },
            update: {
              status: 'ACTIVE',
              plan,
              stripeId: mockStripeId,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            create: {
              workspaceId,
              status: 'ACTIVE',
              plan,
              stripeId: mockStripeId,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
          await tx.auditLog.create({
            data: {
              workspaceId,
              action: 'MOCK_CHECKOUT_ACTIVATED',
              resource: 'subscription',
              resourceId: workspaceId,
              details: { plan, mockStripeId },
            },
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return { url: `${frontendUrl}/dashboard/billing?success=true&mock=true` };
    }
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    let customerId = workspace?.stripeCustomerId || undefined;
    if (!customerId) {
      const customer = await this.stripe.customers.create(
        {
          email: userEmail,
          metadata: { workspaceId },
        },
        {
          idempotencyKey: `billing:customer:${workspaceId}:${randomUUID()}`,
        },
      );
      customerId = customer.id;
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { stripeCustomerId: customerId },
      });
    }
    const prices = {
      STARTER: this.configService.get('STRIPE_PRICE_STARTER'),
      PRO: this.configService.get('STRIPE_PRICE_PRO'),
      ENTERPRISE: this.configService.get('STRIPE_PRICE_ENTERPRISE'),
    };
    const priceId = prices[plan as keyof typeof prices];
    if (!priceId) {
      throw new Error(`Plano inválido ou sem preço configurado: ${plan}`);
    }
    const session = await this.stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${this.configService.get('FRONTEND_URL')}/dashboard/billing?success=true`,
        cancel_url: `${this.configService.get('FRONTEND_URL')}/dashboard/billing?canceled=true`,
        metadata: {
          workspaceId,
          plan,
        },
      },
      {
        idempotencyKey: `billing:checkout-session:${workspaceId}:${plan}:${randomUUID()}`,
      },
    );
    return { url: session.url, sessionId: session.id };
  }
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
      const verificationFailure = {
        error: errMsg,
        signatureLength: signature?.length,
        bodyLength: rawBody?.length,
      };
      this.logger.error(
        `Webhook signature verification failed: ${JSON.stringify(verificationFailure)}`,
      );
      this.financialAlert?.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        { provider: 'stripe' },
      );
      throw new Error(`Webhook signature verification failed`);
    }
    const webhookSummary = {
      type: event.type,
      id: event.id,
    };
    this.logger.log(`Webhook recebido: ${JSON.stringify(webhookSummary)}`);
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
          const subscription = event.data.object;
          await this.syncSubscriptionStatus(subscription);
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await this.cancelSubscriptionByStripeId(sub.id);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const subId = this.readInvoiceSubscriptionId(invoice);
          if (subId) {
            await this.markSubscriptionStatus(subId, 'PAST_DUE');
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const subId = this.readInvoiceSubscriptionId(invoice);
          if (subId) {
            await this.markSubscriptionStatus(subId, 'ACTIVE');
          }
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
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Approximate, webhook updates exact date
        },
        create: {
          workspaceId,
          status: 'ACTIVE',
          plan,
          stripeId: subscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await this.activatePlanFeatures(workspaceId, plan);
      await this.notifyCustomerPaymentConfirmed(workspaceId, session, plan);
      this.logger.log(`Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
    }
  }
  private mapStripeStatus(status: string | null | undefined): string {
    if (!status) {
      return 'ACTIVE';
    }
    const normalized = status.toLowerCase();
    if (['canceled', 'cancelled'].includes(normalized)) {
      return 'CANCELED';
    }
    if (['past_due', 'incomplete', 'unpaid'].includes(normalized)) {
      return 'PAST_DUE';
    }
    if (['trialing'].includes(normalized)) {
      return 'TRIALING';
    }
    return 'ACTIVE';
  }
  private async syncSubscriptionStatus(subscription: StripeSubscription) {
    const workspaceId = await this.resolveWorkspaceId(subscription);
    if (!workspaceId) {
      return;
    }
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
    const metaWs = subscription.metadata?.workspaceId;
    if (metaWs) {
      return metaWs;
    }
    const customerId = subscription.customer as string;
    if (!customerId) {
      return null;
    }
    const ws = await this.prisma.workspace.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return ws?.id || null;
  }
  private async markSubscriptionStatus(stripeSubscriptionId: string, status: string) {
    let workspaceId: string | null = null;
    if (this.stripe) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        workspaceId = await this.resolveWorkspaceId(sub);
      } catch {
        this.logger.debug(
          'Unable to resolve workspace from Stripe subscription; checking local subscription.',
        );
      }
    }
    if (!workspaceId) {
      const subRecord = await this.prisma.subscription.findFirst({
        where: { stripeId: stripeSubscriptionId },
        select: { workspaceId: true },
      });
      workspaceId = subRecord?.workspaceId || null;
    }
    if (!workspaceId) {
      return;
    }
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
          await tx.subscription.update({
            where: { workspaceId },
            data: { status },
          });
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
      const nextSettings = { ...settings };
      if (settings.billingSuspended) {
        delete nextSettings.billingSuspended;
      }
      await this.prisma.$transaction(
        async (tx) => {
          await tx.subscription.update({
            where: { workspaceId },
            data: { status },
          });
          if (settings.billingSuspended) {
            await tx.workspace.update({
              where: { id: workspaceId },
              data: {
                providerSettings: nextSettings as Prisma.InputJsonValue,
              },
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
      await this.prisma.subscription.update({
        where: { workspaceId },
        data: { status },
      });
    }
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
      const fallbackPrices: Record<string, number> = {
        STARTER: 97,
        PRO: 297,
        ENTERPRISE: 997,
      };
      let amount = session.amount_total ? session.amount_total / 100 : 0;
      if (!amount) {
        amount = fallbackPrices[plan.toUpperCase()] || 0;
      }
      const formattedAmount = amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      });
      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
      const message = `Pagamento confirmado.\n\nObrigado por assinar o plano *${plan}*!\n\nValor: R$ ${formattedAmount}\nID: ${paymentIntentId}\n\nSua conta já está ativa com todas as funcionalidades do plano. Se precisar de ajuda, é só me chamar aqui.`;
      await whatsappService.sendMessage(workspaceId, phone, message);
      this.logger.log(`Notificação de pagamento enviada para ${phone}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      this.logger.warn(`Erro ao notificar cliente: ${errorMessage}`);
    }
  }
  private async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
    const webhook = process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL || '';
    const globalFetch = (globalThis as Record<string, unknown>).fetch as
      | ((url: string, init?: Record<string, unknown>) => Promise<unknown>)
      | undefined;
    if (!webhook || !globalFetch) {
      return;
    }
    try {
      await globalFetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    }
  }
  private async activatePlanFeatures(workspaceId: string, plan: string): Promise<void> {
    const planLimits: Record<
      string,
      {
        monthlyMessages: number;
        whatsappNumbers: number;
        autopilotLimit: number; // -1 = ilimitado
        flowsLimit: number; // -1 = ilimitado
        campaignsUnlimited: boolean;
        apiAccess: boolean;
        prioritySupport: boolean;
      }
    > = {
      STARTER: {
        monthlyMessages: 1000,
        whatsappNumbers: 1,
        autopilotLimit: 100,
        flowsLimit: 3,
        campaignsUnlimited: false,
        apiAccess: false,
        prioritySupport: false,
      },
      PRO: {
        monthlyMessages: 10000,
        whatsappNumbers: 3,
        autopilotLimit: -1, // ilimitado
        flowsLimit: -1, // ilimitado
        campaignsUnlimited: true,
        apiAccess: true,
        prioritySupport: false,
      },
      ENTERPRISE: {
        monthlyMessages: -1, // ilimitado
        whatsappNumbers: -1, // ilimitado
        autopilotLimit: -1,
        flowsLimit: -1,
        campaignsUnlimited: true,
        apiAccess: true,
        prioritySupport: true,
      },
    };
    const limits = planLimits[plan.toUpperCase()] || planLimits.STARTER;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          billingSuspended: false, // Liberar acesso
          plan: {
            name: plan,
            limits,
            activatedAt: new Date().toISOString(),
          },
          autopilot: {
            ...((currentSettings.autopilot ?? {}) as Record<string, unknown>),
            enabled: true, // Ativar autopilot por padrão em planos pagos
            monthlyLimit: limits.autopilotLimit,
          },
        },
      },
    });
    this.logger.log(
      `Plan features activated for ${workspaceId}: ${plan} ${JSON.stringify(limits)}`,
    );
  }
  async cancelSubscription(workspaceId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
    });
    if (!sub) {
      return { status: 'no_subscription' };
    }
    if (this.stripe && sub.stripeId) {
      try {
        await this.stripe.subscriptions.update(sub.stripeId, {
          cancel_at_period_end: true,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Stripe cancel failed — refusing to mark CANCELED in DB to avoid drift. workspaceId=${workspaceId} stripeId=${sub.stripeId} error=${errMessage}`,
        );
        throw new Error(
          `Failed to cancel Stripe subscription ${sub.stripeId}; DB state preserved as ${sub.status}: ${errMessage}`,
        );
      }
    }
    await this.prisma.subscription.update({
      where: { workspaceId },
      data: { status: 'CANCELED' },
    });
    return { status: 'canceled', workspaceId };
  }
  private async cancelSubscriptionByStripeId(stripeId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeId },
      select: { workspaceId: true },
    });
    if (!existing?.workspaceId) {
      return;
    }
    await this.prisma.subscription.updateMany({
      where: { stripeId, workspaceId: existing.workspaceId },
      data: { status: 'CANCELED' },
    });
    this.logger.log(`Subscription CANCELED: ${stripeId}`);
  }
}
