import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { StripeClient, StripeSubscription } from './stripe-types';
import type { WhatsappNotifier } from './billing-webhook.types';

export class BillingSubscriptionService {
  private readonly logger = new Logger(BillingSubscriptionService.name);
  private stripe: StripeClient | undefined;
  private whatsappService: WhatsappNotifier | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    stripe: StripeClient | undefined,
    private readonly financialAlert?: FinancialAlertService,
  ) {
    this.stripe = stripe;
  }

  normalizeSubscriptionStatus(status: string | null | undefined): string {
    return String(status || '')
      .trim()
      .toUpperCase();
  }

  readInvoiceSubscriptionId(invoice: {
    subscription?: string | { id?: string | null } | null;
  }): string | null {
    const subscriptionRef = invoice.subscription;
    if (typeof subscriptionRef === 'string' && subscriptionRef.trim()) {
      return subscriptionRef;
    }
    if (
      subscriptionRef &&
      typeof subscriptionRef === 'object' &&
      typeof (subscriptionRef as { id?: string | null }).id === 'string' &&
      (subscriptionRef as { id: string }).id.trim()
    ) {
      return (subscriptionRef as { id: string }).id;
    }
    return null;
  }

  async resolveWhatsappService(): Promise<WhatsappNotifier | null> {
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

  async notifyCustomerPaymentConfirmed(
    session: { customer_email?: string | null; customer_details?: { email?: string | null } | null; amount_total?: number | null; id: string; payment_intent?: string | { id?: string } | null },
    plan: string,
    workspaceId: string,
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

  async notifyOps(event: string, payload: Record<string, unknown>): Promise<void> {
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
}
