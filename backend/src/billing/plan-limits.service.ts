import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

type Plan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

const planConfig: Record<
  Plan,
  {
    flowLimit: number | null;
    campaignLimit: number | null;
    messagesPerMonth: number | null;
    instances: number | null;
    flowRunsPerMinute: number | null;
    aiTokensPerMonth: number | null;
  }
> = {
  FREE: {
    flowLimit: 1,
    campaignLimit: 1,
    messagesPerMonth: 500,
    instances: 1,
    flowRunsPerMinute: 20,
    aiTokensPerMonth: 1000,
  },
  STARTER: {
    flowLimit: 5,
    campaignLimit: 5,
    messagesPerMonth: 5000,
    instances: 1,
    flowRunsPerMinute: 100,
    aiTokensPerMonth: 50000,
  },
  PRO: {
    flowLimit: 50,
    campaignLimit: 50,
    messagesPerMonth: 50000,
    instances: 3,
    flowRunsPerMinute: 500,
    aiTokensPerMonth: 500000,
  },
  ENTERPRISE: {
    flowLimit: null,
    campaignLimit: null,
    messagesPerMonth: null,
    instances: null,
    flowRunsPerMinute: null,
    aiTokensPerMonth: null,
  },
};

@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private async getPlan(workspaceId: string): Promise<Plan> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { plan: true, status: true },
    });

    if (!subscription || subscription.status !== 'ACTIVE') return 'FREE';
    const plan = subscription.plan?.toUpperCase() as Plan;
    return planConfig[plan] ? plan : 'FREE';
  }

  /**
   * Verifica limite de criação de fluxo
   */
  async ensureFlowLimit(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.flowLimit) return;

    const count = await this.prisma.flow.count({ where: { workspaceId } });
    if (count >= cfg.flowLimit) {
      throw new ForbiddenException(
        `Limite de fluxos atingido para o plano ${plan}. Aumente o plano para criar mais fluxos.`,
      );
    }
  }

  /**
   * Verifica limite de criação de campanha
   */
  async ensureCampaignLimit(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.campaignLimit) return;

    const count = await this.prisma.campaign.count({ where: { workspaceId } });
    if (count >= cfg.campaignLimit) {
      throw new ForbiddenException(
        `Limite de campanhas atingido para o plano ${plan}. Aumente o plano para criar mais campanhas.`,
      );
    }
  }

  /**
   * Garante que a assinatura está ativa ou em trial; bloqueia status inválidos.
   */
  async ensureSubscriptionActive(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const billingSuspended =
      ((workspace?.providerSettings as any)?.billingSuspended ?? false) ===
      true;
    if (billingSuspended) {
      throw new ForbiddenException(
        'Envios suspensos: regularize cobrança para reativar.',
      );
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });

    if (sub && ['CANCELED', 'PAST_DUE'].includes(sub.status)) {
      throw new ForbiddenException(
        `Assinatura ${sub.status}. Regularize o pagamento para continuar.`,
      );
    }
  }

  /**
   * Controle de mensagens por mês via Redis
   */
  async trackMessageSend(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.messagesPerMonth) return;

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:messages:${workspaceId}:${ym}`;

    try {
      const total = await this.redis.incr(key);
      if (total === 1) {
        const daysInMonth = new Date(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
        ).getDate();
        const ttl = daysInMonth * 24 * 60 * 60;
        await this.redis.expire(key, ttl);
      }

      if (total > cfg.messagesPerMonth) {
        throw new ForbiddenException(
          `Limite mensal de mensagens atingido para o plano ${plan}.`,
        );
      }
    } catch (err: any) {
      // Em ambientes sem Redis ou em conexão subscriber, não bloqueia (modo tolerante para dev/test)
      console.warn(
        '[PlanLimits] Redis indisponível para trackMessageSend:',
        err?.message,
      );
    }
  }

  /**
   * Limita execuções de fluxo por minuto (proteção anti-abuso de run-flow).
   */
  async ensureFlowRunRate(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.flowRunsPerMinute) return;

    const key = `plan:flow_runs:${workspaceId}:${Math.floor(Date.now() / 60000)}`;
    try {
      const total = await this.redis.incr(key);
      if (total === 1) {
        await this.redis.expire(key, 60);
      }
      if (total > cfg.flowRunsPerMinute) {
        throw new ForbiddenException(
          `Limite de execuções por minuto atingido para o plano ${plan}.`,
        );
      }
    } catch (err: any) {
      console.warn(
        '[PlanLimits] Redis indisponível para ensureFlowRunRate:',
        err?.message,
      );
      return;
    }
  }

  /**
   * Track AI Token Usage
   */
  async trackAiUsage(workspaceId: string, tokens: number) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.aiTokensPerMonth) return;

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:ai_tokens:${workspaceId}:${ym}`;

    try {
      const total = await this.redis.incrby(key, tokens);
      if (total === tokens) {
        const daysInMonth = new Date(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
        ).getDate();
        const ttl = daysInMonth * 24 * 60 * 60;
        await this.redis.expire(key, ttl);
      }

      if (total > cfg.aiTokensPerMonth) {
        throw new ForbiddenException(
          `Limite mensal de tokens IA atingido para o plano ${plan}.`,
        );
      }
    } catch (err: any) {
      console.warn(
        '[PlanLimits] Redis indisponível para trackAiUsage:',
        err?.message,
      );
    }
  }
}
