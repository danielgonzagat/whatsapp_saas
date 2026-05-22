
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import type { StripeClient } from './stripe-types';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';

/**
 * @cluster whatsapp_saas/backend/billing
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class BillingSubscriptionService {
  private readonly logger = StructuredLogger.from(BillingSubscriptionService.name);
  private stripe: StripeClient | undefined;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    _moduleRef: ModuleRef,
    stripe: StripeClient | undefined,
    _helper: BillingCheckoutHelperService,
  ) {
    this.stripe = stripe;
  }

  normalizeSubscriptionStatus(status: string | null | undefined): string {
    return String(status || '')
      .trim()
      .toUpperCase();
  }

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

  async getUsage(workspaceId: string) {
    const [messages, flows, contacts] = await Promise.all([
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
      this.prisma.flow.count({ where: { workspaceId } }),
      this.prisma.contact.count({ where: { workspaceId } }),
    ]);
    return {
      messages,
      flows,
      contacts,
    };
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

  async cancelSubscriptionByStripeId(stripeId: string) {
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

  async activatePlanFeatures(workspaceId: string, plan: string): Promise<void> {
    const planLimits: Record<
      string,
      {
        monthlyMessages: number;
        whatsappNumbers: number;
        autopilotLimit: number;
        flowsLimit: number;
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
        autopilotLimit: -1,
        flowsLimit: -1,
        campaignsUnlimited: true,
        apiAccess: true,
        prioritySupport: false,
      },
      ENTERPRISE: {
        monthlyMessages: -1,
        whatsappNumbers: -1,
        autopilotLimit: -1,
        flowsLimit: -1,
        campaignsUnlimited: true,
        apiAccess: true,
        prioritySupport: true,
      },
    };
    const limitsCandidate = planLimits[plan.toUpperCase()] ?? planLimits['STARTER'];
    if (!limitsCandidate) {
      return;
    }
    const limits = limitsCandidate;
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
          billingSuspended: false,
          plan: {
            name: plan,
            limits,
            activatedAt: new Date().toISOString(),
          },
          autopilot: {
            ...((currentSettings.autopilot ?? {}) as Record<string, unknown>),
            enabled: true,
            monthlyLimit: limits.autopilotLimit,
          },
        },
      },
    });
    this.logger.log(
      `Plan features activated for ${workspaceId}: ${plan} ${JSON.stringify(limits)}`,
    );
  }
}
