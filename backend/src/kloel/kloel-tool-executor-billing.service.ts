import { Injectable, Logger } from '@nestjs/common';
import { StripeRuntime } from '../billing/stripe-runtime';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-tool-executor.service';
import type { ToolChangePlanArgs, ToolUpdateBillingInfoArgs } from './kloel-tool-executor.service';

/** Billing tool implementations for KloelToolExecutorService. */
@Injectable()
export class KloelToolExecutorBillingService {
  private readonly logger = new Logger(KloelToolExecutorBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async toolUpdateBillingInfo(
    workspaceId: string,
    args: ToolUpdateBillingInfoArgs,
  ): Promise<ToolResult> {
    const { returnUrl } = args;
    try {
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao gerar link de billing:', error);
      return { success: false, error: msg };
    }
  }

  async toolGetBillingStatus(workspaceId: string): Promise<ToolResult> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          stripeCustomerId: true,
          providerSettings: true,
          subscription: { select: { plan: true, stripeId: true } },
        },
      });
      if (!workspace) return { success: false, error: 'Workspace não encontrado' };
      const settings = (workspace.providerSettings as Record<string, unknown>) || {};
      const plan = String(workspace.subscription?.plan || 'FREE');
      return {
        success: true,
        plan,
        status: settings.billingSuspended ? 'SUSPENDED' : 'ACTIVE',
        hasPaymentMethod: !!workspace.stripeCustomerId,
        subscriptionId: workspace.subscription?.stripeId || null,
        message: settings.billingSuspended
          ? 'Cobrança suspensa. Regularize para continuar usando.'
          : `Plano ${plan} ativo`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao buscar status billing:', error);
      return { success: false, error: msg };
    }
  }

  async toolChangePlan(workspaceId: string, args: ToolChangePlanArgs): Promise<ToolResult> {
    const { newPlan, immediate: _immediate = true } = args;
    if (!newPlan)
      return {
        success: false,
        error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)',
      };
    const validPlans = ['starter', 'pro', 'enterprise', 'free'];
    if (!validPlans.includes(newPlan.toLowerCase()))
      return { success: false, error: `Plano inválido. Opções: ${validPlans.join(', ')}` };
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { subscription: { select: { plan: true, stripeId: true } } },
      });
      const currentPlan = workspace?.subscription?.plan || 'FREE';
      const targetPlan = newPlan.toUpperCase();
      if (workspace?.subscription?.stripeId)
        return {
          success: true,
          requiresAction: true,
          currentPlan,
          targetPlan,
          message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
        };
      if (targetPlan !== 'FREE' && currentPlan === 'FREE')
        return {
          success: true,
          requiresCheckout: true,
          targetPlan,
          message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
        };
      await this.prisma.subscription.upsert({
        where: { workspaceId },
        update: { plan: targetPlan },
        create: {
          workspaceId,
          plan: targetPlan,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      return {
        success: true,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        message: `Plano alterado de ${currentPlan} para ${targetPlan}`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao alterar plano:', error);
      return { success: false, error: msg };
    }
  }
}
