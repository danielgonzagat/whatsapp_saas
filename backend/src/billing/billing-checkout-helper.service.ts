
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import type { StripeClient, StripeSubscription } from './stripe-types';
import type { WhatsappNotifier } from './billing-webhook.types';

export class BillingCheckoutHelperService {
  private readonly logger = StructuredLogger.from(BillingCheckoutHelperService.name);

  constructor(
    private prisma: PrismaService,
    _configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    private stripe: StripeClient | undefined,
    _financialAlert?: FinancialAlertService,
  ) {}

  async notifyCustomerPaymentConfirmed(
    session: {
      customer_email?: string | null;
      customer_details?: { email?: string | null } | null;
      amount_total?: number | null;
      id: string;
      payment_intent?: string | { id?: string } | null;
    },
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

  async resolveWhatsappService(): Promise<WhatsappNotifier | null> {
    try {
      const { WhatsappService } = await import('../whatsapp/whatsapp.service');
      return this.moduleRef.get(WhatsappService, { strict: false }) ?? null;
    } catch {
      return null;
    }
  }

  async markSubscriptionStatus(stripeSubscriptionId: string, status: string) {
    let workspaceId: string | null = null;
    if (this.stripe) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
        workspaceId = this.resolveWorkspaceId(sub);
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

  private resolveWorkspaceId(subscription: StripeSubscription): string | null {
    const metaWs = subscription.metadata?.workspaceId;
    if (metaWs) {
      return metaWs;
    }
    const customerId = subscription.customer as string;
    return customerId || null;
  }
}
