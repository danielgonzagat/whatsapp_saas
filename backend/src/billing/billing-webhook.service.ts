import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { FinancialAlertService } from '../common/financial-alert.service';
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
  }
  private async syncSubscriptionStatus(subscription: StripeSubscription) {
    const workspaceId = await this.resolveWorkspaceId(subscription);
    if (!workspaceId) return;
    const status = mapStripeStatus(subscription.status);
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
          const existing = await tx.subscription.findUnique({
            where: { workspaceId },
            select: { id: true },
          });
          if (!existing) {
            this.logger.warn(
              `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
            );
            return;
          }
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
      const nextSettings = { ...settings };
      if (settings.billingSuspended) {
        delete nextSettings.billingSuspended;
      }
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.subscription.findUnique({
            where: { workspaceId },
            select: { id: true },
          });
          if (!existing) {
            this.logger.warn(
              `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
            );
            return;
          }
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
      const existing = await this.prisma.subscription.findUnique({
        where: { workspaceId },
        select: { id: true },
      });
      if (!existing) {
        this.logger.warn(
          `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
        );
        return;
      }
      await this.prisma.subscription.update({ where: { workspaceId }, data: { status } });
    }
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
    if (!workspaceId) {
      const existing = await this.prisma.subscription.findFirst({
        where: { stripeId },
        select: { workspaceId: true },
      });
      workspaceId = existing?.workspaceId ?? null;
    }
    if (!workspaceId) {
      this.logger.warn(
        `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
      );
      return;
    }
    // Tenant-safe queries: inline the workspaceId predicate so the static
    // tenant-filter scanner reads the literal token in the where body.
    const existing = await this.prisma.subscription.findFirst({
      where: { stripeId, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      this.logger.warn(
        `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
      );
      return;
    }
    const result = await this.prisma.subscription.updateMany({
      where: { stripeId, workspaceId },
      data: { status: 'CANCELED' },
    });
    this.logger.log(`Subscription CANCELED: ${stripeId} (matched ${result.count})`);
  }
  async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
    return notifyOpsHelper(this.logger, event, payload, this.financialAlert);
  }
}
