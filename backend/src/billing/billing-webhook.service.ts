import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { FinancialAlertService } from '../common/financial-alert.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { activatePlanFeatures } from './billing-plan-features';
import {
  mapStripeStatus,
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
import type { StripeSubscriptionWithPeriodEnd, WhatsappNotifier } from './billing-webhook.types';
import { markSubscriptionStatusHelper } from './__companions__/billing-webhook.service.companion';
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
    @Optional()
    private readonly opsAlert?: OpsAlertService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new StripeRuntime(secretKey);
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      console.error('[billing-webhook] Failed to resolve WhatsApp service:', err.message);
      try {
        Sentry.captureException(err);
      } catch {
        // discarded — Sentry may not be initialised
      }
      void this.opsAlert?.alertOnCriticalError(err, 'BillingWebhookService.resolveWhatsappService');
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
    } catch (err: unknown) {
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

    const webhookIdempotencyKey = `stripe:${event.id}`;

    // PULSE_OK: atomic idempotency gate — read-then-create race fixed via
    // $transaction + unique-constraint fallback
    const idempotent = await this.prisma.$transaction(async (tx) => {
      const alreadyProcessed = await tx.webhookEvent.findFirst({
        where: { provider: 'stripe', externalId: webhookIdempotencyKey, status: 'processed' },
      });
      if (alreadyProcessed) return true;

      try {
        await tx.webhookEvent.create({
          data: {
            provider: 'stripe',
            eventType: event.type,
            externalId: webhookIdempotencyKey,
            payload: event as unknown as Prisma.InputJsonValue,
            status: 'received',
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return true;
        }
        throw err;
      }
      return false;
    });

    if (idempotent) {
      this.logger.log(`Webhook idempotent skip: ${event.type} (id=${event.id})`);
      return { received: true, idempotent: true };
    }

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
          const subId = readInvoiceSubscriptionId(event.data.object);
          if (subId) await this.markSubscriptionStatus(subId, 'PAST_DUE');
          break;
        }
        case 'invoice.payment_succeeded': {
          const subId = readInvoiceSubscriptionId(event.data.object);
          if (subId) await this.markSubscriptionStatus(subId, 'ACTIVE');
          break;
        }
        default:
          break;
      }
    } catch (err: unknown) {
      await this.prisma.webhookEvent
        .update({
          where: { provider_externalId: { provider: 'stripe', externalId: webhookIdempotencyKey } },
          data: {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            processedAt: new Date(),
          },
        })
        .catch(() => {
          /* best-effort */
        });
      this.financialAlert?.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        { provider: 'stripe', eventType: event.type, externalId: event.id },
      );
      throw err;
    }

    await this.prisma.webhookEvent
      .update({
        where: { provider_externalId: { provider: 'stripe', externalId: webhookIdempotencyKey } },
        data: { status: 'processed', processedAt: new Date() },
      })
      .catch(() => {
        /* best-effort */
      });

    return { received: true };
  }
  private async fulfillCheckout(session: StripeCheckoutSession) {
    const workspaceId = session.metadata?.workspaceId;
    const plan = session.metadata?.plan || 'PRO';
    const subscriptionId = session.subscription as string;
    if (!workspaceId) {
      return;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      this.logger.warn(
        `fulfillCheckout: workspace ${workspaceId} not found, skipping subscription upsert`,
      );
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.subscription.upsert({
          where: { workspaceId },
          update: {
            status: 'ACTIVE',
            plan,
            stripeId: subscriptionId,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
          },
          create: {
            workspaceId,
            status: 'ACTIVE',
            plan,
            stripeId: subscriptionId,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
          },
        });
        await activatePlanFeatures(tx, workspaceId, plan);
      },
      { isolationLevel: 'ReadCommitted' },
    );

    const whatsappService = await this.resolveWhatsappService();
    await notifyCustomerPaymentConfirmedHelper(
      this.logger,
      this.prisma,
      whatsappService,
      workspaceId,
      session,
      plan,
      this.financialAlert,
    );
    this.logger.log(`Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
  }
  private async syncSubscriptionStatus(subscription: StripeSubscription) {
    const workspaceId = await this.resolveWorkspaceId(subscription);
    if (!workspaceId) return;
    const status = mapStripeStatus(subscription.status);
    const currentPeriodEndRaw = (subscription as StripeSubscriptionWithPeriodEnd)
      .current_period_end;
    const periodEnd = currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : undefined;

    // PULSE_OK: read-then-upsert wrapped in $transaction to prevent stale plan
    // reads during concurrent sync events
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { workspaceId },
        select: { plan: true },
      });

      const inferredPlan =
        existing?.plan || (subscription.metadata as Record<string, string> | null)?.plan || 'PRO';

      await tx.subscription.upsert({
        where: { workspaceId },
        update: {
          status,
          stripeId: subscription.id,
          currentPeriodEnd: periodEnd || new Date(),
        },
        create: {
          workspaceId,
          status,
          plan: inferredPlan,
          stripeId: subscription.id,
          currentPeriodEnd: periodEnd || new Date(),
        },
      });
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
    return markSubscriptionStatusHelper(
      {
        prisma: this.prisma,
        stripe: this.stripe,
        logger: this.logger,
        financialAlert: this.financialAlert,
        resolveWorkspaceId: (sub: StripeSubscription) => this.resolveWorkspaceId(sub),
        notifyOps: (event: string, payload: Record<string, unknown>) =>
          this.notifyOps(event, payload),
      },
      stripeSubscriptionId,
      status,
    );
  }
  private async cancelSubscriptionByStripeId(stripeId: string) {
    let workspaceId: string | null = null;
    if (this.stripe) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(stripeId);
        workspaceId = await this.resolveWorkspaceId(sub);
      } catch {
        this.logger.debug(
          'Unable to resolve workspace from Stripe subscription; checking local record.',
        );
      }
    }

    if (workspaceId) {
      try {
        await this.prisma.subscription.updateMany({
          where: { stripeId, workspaceId },
          data: { status: 'CANCELED' },
        });
        this.logger.log(`Subscription CANCELED: ${stripeId}`);
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
          throw error;
        }
        this.logger.warn(
          `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
        );
      }
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.subscription.findFirst({
          where: { stripeId },
          select: { workspaceId: true, updatedAt: true },
        });

        if (!existing) {
          this.logger.warn(
            `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
          );
          return;
        }

        await tx.subscription.updateMany({
          where: {
            stripeId,
            workspaceId: existing.workspaceId,
            updatedAt: existing.updatedAt,
          },
          data: { status: 'CANCELED' },
        });

        this.logger.log(`Subscription CANCELED: ${stripeId}`);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
    return notifyOpsHelper(this.logger, event, payload, this.financialAlert);
  }
}
