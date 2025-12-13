import { Injectable, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Optional() @Inject(forwardRef(() => WhatsappService)) private whatsappService?: WhatsappService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      console.warn(
        '⚠️ STRIPE_SECRET_KEY not found. Billing will run in MOCK mode if BILLING_MOCK_MODE=true.',
      );
    }
  }

  async getSubscription(workspaceId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
    });

    const trialCredits = Number(
      this.configService.get<string>('TRIAL_CREDITS_USD') ||
        process.env.TRIAL_CREDITS_USD ||
        '5',
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

    // Calcular dias restantes do trial (usa currentPeriodEnd como data de fim)
    let trialDaysLeft = 0;
    if (sub.status === 'TRIAL' || sub.status === 'TRIALING') {
      const now = new Date();
      const trialEnd = new Date(sub.currentPeriodEnd);
      const diffTime = trialEnd.getTime() - now.getTime();
      trialDaysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    // Tentar buscar cancelAtPeriodEnd do Stripe se tiver subscription ativa
    let cancelAtPeriodEnd = (sub as any).cancelAtPeriodEnd || false;
    if (this.stripe && sub.stripeId) {
      try {
        const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeId);
        cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
      } catch {
        // Se falhar, usa o valor do banco
      }
    }

    // Mapear status para lowercase (padrão frontend)
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

    const mappedStatus = statusMap[sub.status] || 'none';
    const creditsBalance = mappedStatus === 'trial' ? (Number.isFinite(trialCredits) ? trialCredits : 5) : 0;

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

    // Idempotência: se já está em trial/ativo, não muda.
    if (existing && ['ACTIVE', 'TRIAL', 'TRIALING'].includes(existing.status)) {
      return this.getSubscription(workspaceId);
    }

    const plan = existing?.plan || 'STARTER';

    await this.prisma.subscription.upsert({
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

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        action: 'TRIAL_ACTIVATED',
        resource: 'subscription',
        resourceId: workspaceId,
        details: { trialDays: safeTrialDays },
      },
    });

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

  /**
   * Creates a real Stripe Checkout Session.
   */
  async createCheckoutSession(
    workspaceId: string,
    plan: string,
    userEmail: string,
  ) {
    if (!this.stripe) {
      const nodeEnv = this.configService.get('NODE_ENV') || process.env.NODE_ENV;
      if (nodeEnv === 'production') {
        throw new Error('Stripe não configurado em produção (STRIPE_SECRET_KEY ausente)');
      }

      const allowMock = this.configService.get('BILLING_MOCK_MODE') === 'true';
      if (!allowMock) {
        throw new Error('Stripe não configurado e BILLING_MOCK_MODE != true');
      }
      // MOCK MODE (somente se explicitamente permitido)
      console.log(`[Billing] Mocking checkout for ${workspaceId} plan ${plan}`);

      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:3000';

      await this.prisma.subscription.upsert({
        where: { workspaceId },
        update: {
          status: 'ACTIVE',
          plan,
          stripeId: `mock_sub_${Date.now()}`,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        create: {
          workspaceId,
          status: 'ACTIVE',
          plan,
          stripeId: `mock_sub_${Date.now()}`,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return { url: `${frontendUrl}/dashboard/billing?success=true&mock=true` };
    }

    // 1. Find or Create Stripe Customer for this Workspace
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    let customerId = (workspace as any).stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { stripeCustomerId: customerId },
      });
    }

    // 2. Define Prices
    const prices = {
      STARTER: this.configService.get('STRIPE_PRICE_STARTER'),
      PRO: this.configService.get('STRIPE_PRICE_PRO'),
      ENTERPRISE: this.configService.get('STRIPE_PRICE_ENTERPRISE'),
    };

    const priceId = prices[plan];
    if (!priceId) {
      throw new Error(`Plano inválido ou sem preço configurado: ${plan}`);
    }

    // 3. Create Session
    const session = await this.stripe.checkout.sessions.create({
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
    });

    return { url: session.url, sessionId: session.id };
  }

  /**
   * Handles Stripe Webhooks securely.
   */
  async handleWebhook(signature: string, rawBody: Buffer) {
    if (!this.stripe) {
      console.warn('[BILLING] Webhook recebido mas Stripe não está configurado');
      return { received: false, reason: 'stripe_not_configured' };
    }
    if (!rawBody || !signature) {
      console.error('[BILLING] Webhook sem rawBody ou signature');
      throw new Error('Missing rawBody or signature for webhook verification');
    }

    const endpointSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    if (!endpointSecret) {
      console.error('[BILLING] STRIPE_WEBHOOK_SECRET não configurado');
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        endpointSecret,
      );
    } catch (err) {
      // Log detalhado sem expor dados sensíveis
      console.error('[BILLING] Webhook signature verification failed:', {
        error: err.message,
        signatureLength: signature?.length,
        bodyLength: rawBody?.length,
      });
      throw new Error(`Webhook signature verification failed`);
    }

    console.log('[BILLING] Webhook recebido:', { type: event.type, id: event.id });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Ignora sessões de setup (cadastro/alteração de cartão) para não ativar assinatura indevidamente.
        const mode = (session as any).mode as string | undefined;
        const hasSubscription = !!(session as any).subscription;
        if (mode === 'subscription' || hasSubscription) {
          await this.fulfillCheckout(session);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.syncSubscriptionStatus(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.cancelSubscriptionByStripeId(sub.id);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (subId) {
          await this.markSubscriptionStatus(subId, 'PAST_DUE');
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (subId) {
          await this.markSubscriptionStatus(subId, 'ACTIVE');
        }
        break;
      }
      default:
        break;
    }

    return { received: true };
  }

  private async fulfillCheckout(session: Stripe.Checkout.Session) {
    const workspaceId = session.metadata?.workspaceId;
    const plan = session.metadata?.plan || 'PRO';
    const subscriptionId = session.subscription as string;

    if (workspaceId) {
      // 1. Criar/atualizar subscription
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

      // 2. Ativar features do plano no workspace
      await this.activatePlanFeatures(workspaceId, plan);
      
      // 3. Notificar cliente via WhatsApp (se tiver número cadastrado)
      await this.notifyCustomerPaymentConfirmed(workspaceId, session, plan);
      
      console.log(`✅ Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
    }
  }

  private mapStripeStatus(status: string | null | undefined): string {
    if (!status) return 'ACTIVE';
    const normalized = status.toLowerCase();
    if (['canceled', 'cancelled'].includes(normalized)) return 'CANCELED';
    if (['past_due', 'incomplete', 'unpaid'].includes(normalized))
      return 'PAST_DUE';
    if (['trialing'].includes(normalized)) return 'TRIALING';
    return 'ACTIVE';
  }

  private async syncSubscriptionStatus(subscription: Stripe.Subscription) {
    const workspaceId = await this.resolveWorkspaceId(subscription);
    if (!workspaceId) return;
    const status = this.mapStripeStatus(subscription.status);
    const periodEnd = (subscription as any).current_period_end
      ? new Date((subscription as any).current_period_end * 1000)
      : undefined;

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

  private async resolveWorkspaceId(
    subscription: Stripe.Subscription,
  ): Promise<string | null> {
    const metaWs = (subscription.metadata as any)?.workspaceId;
    if (metaWs) return metaWs;

    const customerId = subscription.customer as string;
    if (!customerId) return null;

    const ws = await this.prisma.workspace.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return ws?.id || null;
  }

  private async markSubscriptionStatus(
    stripeSubscriptionId: string,
    status: string,
  ) {
    // Try to fetch subscription to get workspace linkage
    let workspaceId: string | null = null;
    if (this.stripe) {
      try {
        const sub = await this.stripe.subscriptions.retrieve(
          stripeSubscriptionId,
        );
        workspaceId = await this.resolveWorkspaceId(sub);
      } catch {
        // ignore, fallback below
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

    await this.prisma.subscription.update({
      where: { workspaceId },
      data: { status },
    });

    // Opcional: suspende Autopilot e marca flag de billing se status é crítico
    if (['PAST_DUE', 'CANCELED'].includes(status)) {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (ws?.providerSettings as any) || {};
      const nextSettings = {
        ...settings,
        autopilot: { ...(settings.autopilot || {}), enabled: false },
        billingSuspended: true,
      };
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { providerSettings: nextSettings },
      });
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'SUBSCRIPTION_STATUS',
          resource: 'subscription',
          resourceId: stripeSubscriptionId,
          details: { status, billingSuspended: true },
        },
      });
      await this.notifyOps('billing_suspended', {
        workspaceId,
        subscription: stripeSubscriptionId,
        status,
      });
    } else if (status === 'ACTIVE') {
      // Remove flag de suspensão para retomada normal (não reativa autopilot automaticamente)
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (ws?.providerSettings as any) || {};
      if (settings.billingSuspended) {
        const nextSettings = { ...settings };
        delete nextSettings.billingSuspended;
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: nextSettings },
        });
      }
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'SUBSCRIPTION_STATUS',
          resource: 'subscription',
          resourceId: stripeSubscriptionId,
          details: { status, billingSuspended: false },
        },
      });
      await this.notifyOps('billing_active', {
        workspaceId,
        subscription: stripeSubscriptionId,
        status,
      });
    }
  }

  /**
   * Notifica cliente via WhatsApp sobre pagamento confirmado
   */
  private async notifyCustomerPaymentConfirmed(
    workspaceId: string,
    session: Stripe.Checkout.Session,
    plan: string,
  ): Promise<void> {
    if (!this.whatsappService) {
      console.log('[BILLING] WhatsappService não disponível para notificação');
      return;
    }

    try {
      // Buscar informações do workspace
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      });

      // Tentar buscar contato pelo email do checkout
      const customerEmail = session.customer_email || (session.customer_details as any)?.email;
      let phone: string | null = null;

      if (customerEmail) {
        const contact = await this.prisma.contact.findFirst({
          where: { workspaceId, email: customerEmail },
          select: { phone: true },
        });
        phone = contact?.phone || null;
      }

      if (!phone) {
        console.log(`[BILLING] Nenhum telefone encontrado para notificar workspace ${workspaceId}`);
        return;
      }

      // Formatar valor do plano
      const planPrices: Record<string, number> = {
        STARTER: 97,
        PRO: 297,
        ENTERPRISE: 997,
      };
      const amount = planPrices[plan.toUpperCase()] || (session.amount_total ? session.amount_total / 100 : 0);
      const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      const message = 
        `✅ *Pagamento Confirmado!* 🎉\n\n` +
        `Obrigado por assinar o plano *${plan}*!\n\n` +
        `💰 Valor: R$ ${formattedAmount}\n` +
        `📋 ID: ${session.payment_intent || session.id}\n\n` +
        `Sua conta já está ativa com todas as funcionalidades do plano. ` +
        `Se precisar de ajuda, é só me chamar aqui! 🚀`;

      await this.whatsappService.sendMessage(workspaceId, phone, message);
      console.log(`📱 [BILLING] Notificação de pagamento enviada para ${phone}`);
    } catch (err: any) {
      console.warn(`[BILLING] Erro ao notificar cliente: ${err?.message}`);
    }
  }

  /**
   * Notifica canal de operações (Slack/Teams/webhook) sobre eventos críticos de billing.
   */
  private async notifyOps(
    event: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const webhook =
      process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL || '';
    if (!webhook || !(global as any).fetch) return;
    try {
      await (global as any).fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: event,
          ...payload,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
      });
    } catch (err) {
      console.warn('notifyOps billing error', (err as any)?.message);
    }
  }

  /**
   * Ativa as features do plano no workspace
   * Define limites de mensagens, autopilot, etc.
   */
  private async activatePlanFeatures(
    workspaceId: string,
    plan: string,
  ): Promise<void> {
    // Definir limites por plano
    const planLimits: Record<string, {
      monthlyMessages: number;
      whatsappNumbers: number;
      autopilotLimit: number; // -1 = ilimitado
      flowsLimit: number; // -1 = ilimitado
      campaignsUnlimited: boolean;
      apiAccess: boolean;
      prioritySupport: boolean;
    }> = {
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

    // Buscar workspace atual
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const currentSettings = (workspace?.providerSettings as any) || {};

    // Atualizar workspace com as features do plano
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
            ...(currentSettings.autopilot || {}),
            enabled: true, // Ativar autopilot por padrão em planos pagos
            monthlyLimit: limits.autopilotLimit,
          },
        },
      },
    });

    console.log(`🎯 Plan features activated for ${workspaceId}: ${plan}`, limits);
  }

  private async cancelSubscriptionByStripeId(stripeId: string) {
    await this.prisma.subscription.updateMany({
      where: { stripeId },
      data: { status: 'CANCELED' },
    });
    console.log(`❌ Subscription CANCELED: ${stripeId}`);
  }
}
