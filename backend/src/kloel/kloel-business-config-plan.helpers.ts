import type { StructuredLogger } from '../logging/structured-logger';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { PrismaService } from '../prisma/prisma.service';

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ToolChangePlanArgs {
  newPlan: string;
  immediate?: boolean;
}

export async function runChangePlan(
  prisma: PrismaService,
  opsAlert: OpsAlertService | undefined,
  logger: Pick<StructuredLogger, 'error'>,
  workspaceId: string,
  args: ToolChangePlanArgs,
): Promise<ToolResult> {
  const { newPlan, immediate: _immediate = true } = args;
  if (!newPlan) {
    return { success: false, error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)' };
  }
  const validPlans = ['starter', 'pro', 'enterprise', 'free'];
  if (!validPlans.includes(newPlan.toLowerCase())) {
    return { success: false, error: `Plano inválido. Opções: ${validPlans.join(', ')}` };
  }
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { subscription: { select: { plan: true, stripeId: true } } },
    });
    const currentPlan = workspace?.subscription?.plan || 'FREE';
    const targetPlan = newPlan.toUpperCase();
    if (workspace?.subscription?.stripeId) {
      return {
        success: true,
        requiresAction: true,
        currentPlan,
        targetPlan,
        message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
      };
    }
    if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
      return {
        success: true,
        requiresCheckout: true,
        targetPlan,
        message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
      };
    }
    await prisma.subscription.upsert({
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
    void opsAlert?.alertOnCriticalError(error, 'KloelBusinessConfigToolsService.upsert');
    const msg = error instanceof Error ? error.message : 'unknown error';
    logger.error('Erro ao alterar plano:', error);
    return { success: false, error: msg };
  }
}
