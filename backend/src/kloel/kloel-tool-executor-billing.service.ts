import { Injectable, Logger } from '@nestjs/common';
import { StripeRuntime } from '../billing/stripe-runtime';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-tool-executor.service';
import type { ToolChangePlanArgs, ToolUpdateBillingInfoArgs } from './kloel-tool-executor.service';

/**
 * Number of milliseconds in a single day. Used to compute the default
 * `currentPeriodEnd` for FREE-tier subscriptions seeded by the agent tool
 * when a workspace has no Stripe-managed subscription yet.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Default billing period length, in days, for FREE-tier subscriptions seeded
 * locally by the agent (no Stripe customer/subscription attached yet).
 */
const FREE_TIER_BILLING_PERIOD_DAYS = 30;

/** Plan identifiers that the agent is allowed to set via tool calls. */
const VALID_PLANS = ['starter', 'pro', 'enterprise', 'free'] as const;

/** Billing tool implementations for KloelToolExecutorService. */
@Injectable()
export class KloelToolExecutorBillingService {
  private readonly logger = new Logger(KloelToolExecutorBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns a Stripe billing-portal URL the customer can use to update payment
   * information, or an honest "not configured" error if the workspace has no
   * Stripe customer attached.
   */
  public async toolUpdateBillingInfo(
    workspaceId: string,
    args: ToolUpdateBillingInfoArgs,
  ): Promise<ToolResult> {
    this.logger.log({ operation: 'toolUpdateBillingInfo', workspaceId });
    const { returnUrl } = args;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { stripeCustomerId: true },
    });
    if (workspace?.stripeCustomerId) {
      const stripe = new StripeRuntime(process.env.STRIPE_SECRET_KEY || '');
      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripeCustomerId,
        return_url: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`,
      });
      return {
        success: true,
        url: session.url,
        message: 'Acesse o link para atualizar seus dados de pagamento.',
      };
    }
    return {
      success: false,
      error: 'Nenhum método de pagamento configurado ainda. Acesse /billing para configurar.',
    };
  }

  /**
   * Returns the current billing posture for a workspace: plan code, suspension
   * flag, presence of a payment method and the linked Stripe subscription id.
   */
  public async toolGetBillingStatus(workspaceId: string): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        providerSettings: true,
        stripeCustomerId: true,
        subscription: { select: { plan: true, stripeId: true } },
      },
    });
    if (!workspace) {
      return { error: 'Workspace não encontrado', success: false };
    }
    const settings = (workspace.providerSettings as Record<string, unknown>) || {};
    const plan = String(workspace.subscription?.plan || 'FREE');

    return {
      hasPaymentMethod: !!workspace.stripeCustomerId,
      message: settings.billingSuspended
        ? 'Cobrança suspensa. Regularize para continuar usando.'
        : `Plano ${plan} ativo`,
      plan,
      status: settings.billingSuspended ? 'SUSPENDED' : 'ACTIVE',
      subscriptionId: workspace.subscription?.stripeId || null,
      success: true,
    };
  }

  /**
   * Switches the workspace plan. When a Stripe-managed subscription exists,
   * the agent must direct the user to the billing portal; otherwise it seeds
   * a local subscription record (or instructs the user to checkout for paid
   * tiers transitioning from FREE).
   */
  public async toolChangePlan(workspaceId: string, args: ToolChangePlanArgs): Promise<ToolResult> {
    const { newPlan, immediate: _immediate = true } = args;
    if (!newPlan) {
      return {
        error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)',
        success: false,
      };
    }
    if (!VALID_PLANS.includes(newPlan.toLowerCase() as (typeof VALID_PLANS)[number])) {
      return { error: `Plano inválido. Opções: ${VALID_PLANS.join(', ')}`, success: false };
    }
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { subscription: { select: { plan: true, stripeId: true } } },
    });
    const currentPlan = workspace?.subscription?.plan || 'FREE';
    const targetPlan = newPlan.toUpperCase();
    if (workspace?.subscription?.stripeId) {
      return {
        currentPlan,
        message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
        requiresAction: true,
        success: true,
        targetPlan,
      };
    }
    if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
      return {
        message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
        requiresCheckout: true,
        success: true,
        targetPlan,
      };
    }
    await this.prisma.subscription.upsert({
      where: { workspaceId },
      update: { plan: targetPlan },
      create: {
        currentPeriodEnd: new Date(Date.now() + FREE_TIER_BILLING_PERIOD_DAYS * MS_PER_DAY),
        plan: targetPlan,
        status: 'ACTIVE',
        workspaceId,
      },
    });

    return {
      message: `Plano alterado de ${currentPlan} para ${targetPlan}`,
      newPlan: targetPlan,
      previousPlan: currentPlan,
      success: true,
    };
  }
}
