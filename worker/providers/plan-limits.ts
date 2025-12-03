import { prisma } from "../db";
import { redis } from "../redis-client";
import { planLimitCounter } from "../metrics";

type Plan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

const planConfig: Record<
  Plan,
  {
    flowLimit: number | null;
    campaignLimit: number | null;
    messagesPerMonth: number | null;
    instances: number | null;
    flowRunsPerMinute: number | null;
  }
> = {
  FREE: { flowLimit: 1, campaignLimit: 1, messagesPerMonth: 500, instances: 1, flowRunsPerMinute: 20 },
  STARTER: { flowLimit: 5, campaignLimit: 5, messagesPerMonth: 5000, instances: 1, flowRunsPerMinute: 100 },
  PRO: { flowLimit: 50, campaignLimit: 50, messagesPerMonth: 50000, instances: 3, flowRunsPerMinute: 500 },
  ENTERPRISE: { flowLimit: null, campaignLimit: null, messagesPerMonth: null, instances: null, flowRunsPerMinute: null },
};

export class PlanLimitsProvider {
  private static async getPlan(workspaceId: string): Promise<Plan> {
    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId },
      select: { plan: true, status: true },
    });

    if (!subscription || subscription.status !== 'ACTIVE') return 'FREE';
    const plan = subscription.plan?.toUpperCase() as Plan;
    return planConfig[plan] ? plan : 'FREE';
  }

  /**
   * Verifica se pode enviar mensagem (limite mensal)
   * Retorna true se permitido, false se bloqueado.
   */
  static async checkMessageLimit(workspaceId: string): Promise<{ allowed: boolean; reason?: string }> {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    
    // Se não tem limite (null), permite
    if (cfg.messagesPerMonth === null) {
      planLimitCounter.labels({ workspaceId, type: "messages", result: "allow", plan }).inc();
      return { allowed: true };
    }

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:messages:${workspaceId}:${ym}`;

    // Incrementa atomicamente
    const total = await redis.incr(key);
    
    // Se for o primeiro incremento, define TTL para o fim do mês
    if (total === 1) {
      const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
      const ttl = daysInMonth * 24 * 60 * 60;
      await redis.expire(key, ttl);
    }

    if (total > cfg.messagesPerMonth) {
      planLimitCounter.labels({ workspaceId, type: "messages", result: "block", plan }).inc();
      return { 
        allowed: false, 
        reason: `Monthly message limit reached for plan ${plan} (${total}/${cfg.messagesPerMonth})` 
      };
    }

    planLimitCounter.labels({ workspaceId, type: "messages", result: "allow", plan }).inc();
    return { allowed: true };
  }

  /**
   * Verifica se a assinatura está ativa para execução de fluxos
   */
  static async checkSubscriptionStatus(workspaceId: string): Promise<{ active: boolean; reason?: string }> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const billingSuspended =
      ((workspace?.providerSettings as any)?.billingSuspended ?? false) ===
      true;
    if (billingSuspended) {
      planLimitCounter.labels({ workspaceId, type: "subscription", result: "block", plan: "BILLING_SUSPENDED" }).inc();
      return { active: false, reason: "billing_suspended" };
    }

    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });

    // Se não existe, assume FREE (que é active por padrão, mas limitado)
    // Mas se existe e está CANCELLED ou PAST_DUE, bloqueia
    if (subscription && (subscription.status === 'CANCELED' || subscription.status === 'PAST_DUE')) {
        planLimitCounter.labels({ workspaceId, type: "subscription", result: "block", plan: subscription.status }).inc();
        return { active: false, reason: `Subscription status is ${subscription.status}` };
    }

    planLimitCounter.labels({ workspaceId, type: "subscription", result: "allow", plan: subscription?.status || "FREE" }).inc();
    return { active: true };
  }

  /**
   * Limite de execuções de fluxo por minuto (proteção contra abuso).
   */
  static async checkFlowRunRate(workspaceId: string): Promise<{ allowed: boolean; reason?: string }> {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.flowRunsPerMinute) {
      return { allowed: true };
    }

    const key = `plan:flow_runs:${workspaceId}:${Math.floor(Date.now() / 60000)}`;
    const total = await redis.incr(key);
    if (total === 1) {
      await redis.expire(key, 60);
    }

    if (total > cfg.flowRunsPerMinute) {
      planLimitCounter.labels({ workspaceId, type: "flow_runs", result: "block", plan }).inc();
      return { allowed: false, reason: `Flow run rate limit reached for plan ${plan}` };
    }

    planLimitCounter.labels({ workspaceId, type: "flow_runs", result: "allow", plan }).inc();
    return { allowed: true };
  }
}
