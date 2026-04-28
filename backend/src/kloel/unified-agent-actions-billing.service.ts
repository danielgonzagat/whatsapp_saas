import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StripeRuntime } from '../billing/stripe-runtime';
import type { StripeClient, StripeSubscription } from '../billing/stripe-types';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolArgs } from './unified-agent.service';
import { createFunnelFlows } from './unified-agent-actions-billing.helpers';

type AnalyticsResult = Record<string, unknown>;

type UnknownRecord = Record<string, unknown>;

/**
 * Handles billing tool actions and product data query tools for the Unified Agent.
 */
@Injectable()
export class UnifiedAgentActionsBillingService {
  private readonly logger = new Logger(UnifiedAgentActionsBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ───────── helpers ─────────

  private readRecord(value: unknown): UnknownRecord {
    return typeof value === 'object' && value !== null ? (value as UnknownRecord) : {};
  }

  private readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return String(value);
    return fallback;
  }

  private readOptionalText(value: unknown): string | undefined {
    const normalized = this.readText(value).trim();
    return normalized || undefined;
  }

  private createStripeClient(): StripeClient | null {
    const secretKey = this.readOptionalText(process.env.STRIPE_SECRET_KEY);
    if (!secretKey) return null;
    return new StripeRuntime(secretKey);
  }

  private async updateWorkspaceProviderSettings(
    workspaceId: string,
    buildNextSettings: (currentSettings: UnknownRecord) => UnknownRecord,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        });
        const currentSettings = this.readRecord(workspace?.providerSettings);
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: buildNextSettings(currentSettings) as Prisma.InputJsonValue,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  // ───────── analytics ─────────

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  async actionGetAnalytics(workspaceId: string, args: ToolArgs) {
    const now = new Date();
    const periodMap: Record<string, number> = { today: 0, week: 7, month: 30, year: 365 };
    const days = periodMap[this.str(args.period, 'week')] ?? 7;
    const startDate =
      days === 0
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let result: AnalyticsResult = {};
    switch (args.metric) {
      case 'messages':
        result = {
          total: await this.prisma.message.count({
            where: { workspaceId, createdAt: { gte: startDate } },
          }),
        };
        break;
      case 'contacts':
        result = {
          total: await this.prisma.contact.count({
            where: { workspaceId, createdAt: { gte: startDate } },
          }),
          active: await this.prisma.contact.count({
            where: { workspaceId, updatedAt: { gte: startDate } },
          }),
        };
        break;
      case 'sales':
        result = {
          count: await this.prisma.autopilotEvent.count({
            where: { workspaceId, action: 'PAYMENT_RECEIVED', createdAt: { gte: startDate } },
          }),
        };
        break;
      case 'conversions': {
        const events = await this.prisma.autopilotEvent.groupBy({
          by: ['status'],
          where: { workspaceId, createdAt: { gte: startDate } },
          _count: true,
        });
        result = { events };
        break;
      }
      case 'response_time': {
        const rows = await this.prisma.$queryRaw<{ avg_minutes: number | null }[]>`
          SELECT AVG(EXTRACT(EPOCH FROM (ob."createdAt" - ib."createdAt")) / 60)::float AS avg_minutes
          FROM "RAC_Message" ib
          JOIN LATERAL (
            SELECT "createdAt" FROM "RAC_Message" ob2
            WHERE ob2."conversationId" = ib."conversationId"
              AND ob2.direction = 'OUTBOUND'
              AND ob2."createdAt" > ib."createdAt"
            ORDER BY ob2."createdAt" ASC LIMIT 1
          ) ob ON TRUE
          WHERE ib."workspaceId" = ${workspaceId} AND ib.direction = 'INBOUND' AND ib."createdAt" >= ${startDate}
        `;
        const avg = rows[0]?.avg_minutes;
        result =
          avg != null
            ? { averageMinutes: Math.round(avg * 10) / 10 }
            : { averageMinutes: null, noData: true };
        break;
      }
    }
    return { success: true, metric: args.metric, period: args.period, data: result };
  }

  async actionGenerateSalesFunnel(workspaceId: string, args: ToolArgs) {
    const {
      funnelName,
      productId,
      stages = ['awareness', 'interest', 'purchase'],
      includeFollowUps = true,
    } = args;
    const product = productId
      ? await this.prisma.product.findFirst({ where: { id: productId, workspaceId } })
      : null;
    const productName = product?.name || 'seu produto';
    const productPrice = product?.price || 0;
    const normalizedFunnelName = funnelName ?? 'Funil de Vendas';
    const createdFlows = await createFunnelFlows(
      this.prisma,
      workspaceId,
      normalizedFunnelName,
      Array.isArray(stages) ? stages : ['awareness', 'interest', 'purchase'],
      productName,
      productPrice,
      includeFollowUps,
    );
    return {
      success: true,
      message: `Funil "${normalizedFunnelName}" criado com ${createdFlows.length} fluxos!`,
      flows: createdFlows,
      nextStep: 'Ative os fluxos quando estiver pronto!',
    };
  }

  // ───────── billing actions ─────────

  async actionUpdateBillingInfo(workspaceId: string, args: ToolArgs) {
    try {
      const stripe = this.createStripeClient();
      if (!stripe)
        return {
          success: false,
          error: 'Infraestrutura de cobrança indisponível no momento.',
          suggestion: 'Tente novamente em alguns minutos ou fale com o suporte Kloel.',
        };
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) return { success: false, error: 'Workspace não encontrado' };
      const settings = this.readRecord(workspace.providerSettings);
      let customerId =
        this.readOptionalText(settings.stripeCustomerId) ||
        this.readOptionalText(workspace.stripeCustomerId);
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: `workspace-${workspaceId}@kloel.com`,
          name: workspace.name || 'Workspace',
          metadata: { workspaceId },
        });
        customerId = customer.id;
        await this.prisma.$transaction(
          async (tx) => {
            const latest = await tx.workspace.findUnique({
              where: { id: workspaceId },
              select: { providerSettings: true },
            });
            const latestSettings = this.readRecord(latest?.providerSettings);
            await tx.workspace.update({
              where: { id: workspaceId },
              data: {
                stripeCustomerId: customerId,
                providerSettings: {
                  ...latestSettings,
                  stripeCustomerId: customerId,
                },
              },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        metadata: { workspaceId },
      });
      const returnUrl =
        args?.returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/account`;
      return {
        success: true,
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        returnUrl,
        instructions:
          'Use o client_secret para completar o cadastro do cartão no frontend usando Stripe Elements.',
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao criar SetupIntent: ${errMsg}`);
      throw error;
    }
  }

  async actionGetBillingStatus(workspaceId: string) {
    try {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) return { success: false, error: 'Workspace não encontrado' };
      const settings = this.readRecord(workspace.providerSettings);
      const limits = this.readRecord(settings.limits);
      return {
        success: true,
        billing: {
          plan: this.readOptionalText(settings.plan) || 'free',
          status: this.readOptionalText(settings.subscriptionStatus) || 'inactive',
          stripeCustomerId: this.readOptionalText(settings.stripeCustomerId) || null,
          stripeSubscriptionId: this.readOptionalText(settings.stripeSubscriptionId) || null,
          currentPeriodEnd: this.readOptionalText(settings.currentPeriodEnd) || null,
          hasPaymentMethod: !!this.readOptionalText(settings.paymentMethodId),
          isSuspended: settings.billingSuspended === true,
        },
        limits: {
          contacts: Number(limits.contacts || 100),
          messagesPerDay: Number(limits.messagesPerDay || 50),
          flows: Number(limits.flows || 3),
          campaigns: Number(limits.campaigns || 1),
        },
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao obter status de billing: ${errMsg}`);
      throw error;
    }
  }

  async actionChangePlan(workspaceId: string, args: ToolArgs) {
    try {
      const plan = args.plan || '';
      if (!['starter', 'pro', 'enterprise'].includes(plan))
        return { success: false, error: 'Plano inválido. Use: starter, pro ou enterprise' };
      const stripe = this.createStripeClient();
      if (!stripe)
        return { success: false, error: 'Infraestrutura de cobrança indisponível no momento.' };
      const priceIds: Record<string, string | undefined> = {
        starter: process.env.STRIPE_PRICE_STARTER,
        pro: process.env.STRIPE_PRICE_PRO,
        enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
      };
      const priceId = priceIds[plan];
      if (!priceId) return { success: false, error: `Preço não configurado para plano ${plan}` };
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) return { success: false, error: 'Workspace não encontrado' };
      const settings = this.readRecord(workspace.providerSettings);
      const customerId = this.readOptionalText(settings.stripeCustomerId);
      const subscriptionId = this.readOptionalText(settings.stripeSubscriptionId);
      if (!customerId)
        return {
          success: false,
          error: 'Nenhum cartão cadastrado',
          action: 'Cadastre um cartão primeiro usando a ferramenta update_billing_info',
        };
      let result: StripeSubscription;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        result = await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: subscription.items.data[0].id, price: priceId }],
          proration_behavior: 'create_prorations',
        });
      } else {
        result = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          metadata: { workspaceId },
        });
        await this.updateWorkspaceProviderSettings(workspaceId, (s) => ({
          ...s,
          stripeSubscriptionId: result.id,
          plan,
          subscriptionStatus: result.status,
        }));
      }
      return {
        success: true,
        plan,
        subscriptionId: result.id,
        status: result.status,
        message: `Plano alterado para ${plan} com sucesso!`,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Erro ao alterar plano: ${errMsg}`);
      throw error;
    }
  }

  // ───────── product data query tools ─────────

  async getProductPlans(productId: string) {
    return {
      plans: await this.prisma.productPlan.findMany({
        where: { productId },
        select: {
          id: true,
          name: true,
          price: true,
          billingType: true,
          maxInstallments: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    };
  }

  async getProductAIConfig(productId: string) {
    return { config: await this.prisma.productAIConfig.findUnique({ where: { productId } }) };
  }

  async getProductReviews(productId: string) {
    return {
      reviews: await this.prisma.productReview.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    };
  }

  async getProductUrls(productId: string) {
    return {
      urls: await this.prisma.productUrl.findMany({
        where: { productId, active: true },
        select: { id: true, productId: true, url: true, description: true, active: true },
        take: 20,
      }),
    };
  }

  async validateCoupon(productId: string, code: string) {
    const coupon = await this.prisma.productCoupon.findFirst({
      where: { productId, code, active: true },
    });
    if (!coupon) return { valid: false, reason: 'not_found' };
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      return { valid: false, reason: 'max_uses_reached' };
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return { valid: false, reason: 'expired' };
    return { valid: true, coupon };
  }
}
