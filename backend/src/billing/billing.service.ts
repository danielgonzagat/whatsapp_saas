import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { activatePlanFeatures } from './billing-plan-features';
import { BillingWebhookService } from './billing-webhook.service';
import { StripeRuntime } from './stripe-runtime';
import type { StripeClient, StripeInvoice } from './stripe-types';

const VALID_PLANS = new Set(['FREE', 'STARTER', 'PRO', 'ENTERPRISE']);

type StripeInvoiceWithSubscription = StripeInvoice & {
  subscription?: string | { id?: string | null } | null;
};

/** Billing service. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: StripeClient;

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
    private readonly webhookService: BillingWebhookService,
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

  /** Create checkout session. */
  async createCheckoutSession(workspaceId: string, plan: string, userEmail: string) {
    if (!VALID_PLANS.has(plan)) {
      throw new Error(`Invalid plan: ${plan}. Allowed: ${[...VALID_PLANS].join(', ')}`);
    }

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

  /** Handle webhook — delegates to BillingWebhookService. */
  async handleWebhook(signature: string, rawBody: Buffer) {
    return this.webhookService.handleWebhook(signature, rawBody);
  }

  /** Cancel subscription — sets cancel_at_period_end so the subscription
   *  stays active until the period ends, then Stripe fires
   *  `customer.subscription.deleted` which the webhook handles. */
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
      } catch (err: unknown) {
        this.logger.error(`Stripe cancel error: ${String(err)}`);
        this.financialAlert?.paymentFailed(err instanceof Error ? err : new Error(String(err)), {
          workspaceId,
          gateway: 'stripe',
        });
        throw err;
      }
    }
    await this.prisma.$transaction(
      async (tx) => {
        await tx.subscription.update({
          where: { workspaceId },
          data: {
            cancelAtPeriodEnd: true,
            status: this.stripe && sub.stripeId ? sub.status : 'CANCELED',
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'SUBSCRIPTION_CANCEL',
            resource: 'subscription',
            resourceId: workspaceId,
            details: {
              mode:
                this.stripe && sub.stripeId ? 'stripe_cancel_at_period_end' : 'immediate_cancel',
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    return { status: 'canceled', workspaceId };
  }

  /** Activate plan features — delegates to billing-plan-features. */
  async activatePlanFeaturesForWorkspace(workspaceId: string, plan: string): Promise<void> {
    return activatePlanFeatures(this.prisma, workspaceId, plan);
  }

  /** Mark subscription status — delegates to BillingWebhookService. */
  async markSubscriptionStatus(stripeSubscriptionId: string, status: string): Promise<void> {
    return this.webhookService.markSubscriptionStatus(stripeSubscriptionId, status);
  }

  /** Notify ops — delegates to BillingWebhookService. */
  async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
    return this.webhookService.notifyOps(event, payload);
  }
}
