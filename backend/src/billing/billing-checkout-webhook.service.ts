import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSubscriptionService } from './billing-subscription.service';
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

export class BillingCheckoutWebhookService {
  private readonly logger = new Logger(BillingCheckoutWebhookService.name);
  private stripe: StripeClient | undefined;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    stripe: StripeClient | undefined,
    private readonly subsService: BillingSubscriptionService,
    private readonly financialAlert?: FinancialAlertService,
  ) {
    this.stripe = stripe;
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
          await this.subsService.cancelSubscriptionByStripeId(sub.id);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const subId = this.subsService.readInvoiceSubscriptionId(invoice);
          if (subId) {
            await this.markSubscriptionStatus(subId, 'PAST_DUE');
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const subId = this.subsService.readInvoiceSubscriptionId(invoice);
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
      await this.subsService.activatePlanFeatures(workspaceId, plan);
      await this.subsService.notifyCustomerPaymentConfirmed(session, plan, workspaceId);
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
      await this.subsService.notifyOps('billing_suspended', {
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
      await this.subsService.notifyOps('billing_active', {
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
}
