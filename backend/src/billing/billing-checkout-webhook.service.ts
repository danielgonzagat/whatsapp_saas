import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';
import type {
  StripeCheckoutSession,
  StripeClient,
  StripeEvent,
  StripeSubscription,
} from './stripe-types';

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
    private readonly helper: BillingCheckoutHelperService,
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
          if (subId) {
            await this.helper.markSubscriptionStatus(subId, 'PAST_DUE');
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const subId = this.readInvoiceSubscriptionId(event.data.object);
          if (subId) {
            await this.helper.markSubscriptionStatus(subId, 'ACTIVE');
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
      await this.helper.notifyCustomerPaymentConfirmed(session, plan, workspaceId);
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

  private readInvoiceSubscriptionId(invoice: {
    subscription?: string | { id?: string | null } | null;
  }): string | null {
    const subscriptionRef = invoice.subscription;
    if (typeof subscriptionRef === 'string' && subscriptionRef.trim()) {
      return subscriptionRef;
    }
    if (
      subscriptionRef &&
      typeof subscriptionRef === 'object' &&
      typeof subscriptionRef.id === 'string' &&
      (subscriptionRef as { id: string }).id.trim()
    ) {
      return (subscriptionRef as { id: string }).id;
    }
    return null;
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
