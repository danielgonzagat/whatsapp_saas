import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { markSubscriptionStatusHelper } from './__companions__/billing-webhook.service.companion';
import { cancelSubscriptionByStripeId as cancelSubscriptionByStripeIdHelper } from './__parts__/billing-webhook.cancel';
import { syncSubscriptionStatus as syncSubscriptionStatusHelper } from './__parts__/billing-webhook.sync-subscription';
import { activatePlanFeatures } from './billing-plan-features';
import {
  notifyCustomerPaymentConfirmedHelper,
  notifyOpsHelper,
  readInvoiceSubscriptionId,
} from './billing-webhook.helpers';
import { StripeRuntime } from './stripe-runtime';
import type {
  StripeCheckoutSession,
  StripeClient,
  StripeEvent,
  StripeSubscription,
} from './stripe-types';
import type { WhatsappNotifier } from './billing-webhook.types';
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
      const { ChannelTransportRegistry } = await import('../kloel/channel-transport.registry');
      const transports = this.moduleRef.get(ChannelTransportRegistry, { strict: false });
      this.whatsappService = transports
        ? {
            sendMessage: (workspaceId, phone, message) =>
              transports.send(workspaceId, {
                workspaceId,
                channel: 'whatsapp',
                recipientId: phone,
                content: message,
              }),
          }
        : null;
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
          const subId = readInvoiceSubscriptionId(invoice);
          if (subId) {
            await this.markSubscriptionStatus(subId, 'PAST_DUE');
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const subId = readInvoiceSubscriptionId(invoice);
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
      await activatePlanFeatures(this.prisma, workspaceId, plan);
      await notifyCustomerPaymentConfirmedHelper(
        this.logger,
        this.prisma,
        await this.resolveWhatsappService(),
        workspaceId,
        session,
        plan,
        this.financialAlert,
      );
      this.logger.log(`Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
    }
  }
  private async syncSubscriptionStatus(subscription: StripeSubscription) {
    return syncSubscriptionStatusHelper(
      {
        prisma: this.prisma,
        resolveWorkspaceId: (sub: StripeSubscription) => this.resolveWorkspaceId(sub),
      },
      subscription,
    );
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
    return markSubscriptionStatusHelper(
      {
        prisma: this.prisma,
        stripe: this.stripe,
        logger: this.logger,
        financialAlert: this.financialAlert,
        resolveWorkspaceId: (sub: StripeSubscription) => this.resolveWorkspaceId(sub),
        notifyOps: (event: string, payload: Record<string, unknown>) =>
          notifyOpsHelper(this.logger, event, payload, this.financialAlert),
      },
      stripeSubscriptionId,
      status,
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
    return cancelSubscriptionByStripeIdHelper(
      {
        prisma: this.prisma,
        stripe: this.stripe,
        logger: this.logger,
        resolveWorkspaceId: (sub: StripeSubscription) => this.resolveWorkspaceId(sub),
      },
      stripeId,
    );
  }
}
