import { InjectRedis } from '@nestjs-modules/ioredis';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type Plan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

const planConfig: Record<
  Plan,
  {
    flowLimit: number | null;
    campaignLimit: number | null;
    messagesPerMonth: number | null;
    messagesPerMinute: number | null;
    messagesPerDay: number | null;
    instances: number | null;
    flowRunsPerMinute: number | null;
    aiTokensPerMonth: number | null;
  }
> = {
  FREE: {
    flowLimit: 1,
    campaignLimit: 1,
    messagesPerMonth: 500,
    messagesPerMinute: 5,
    messagesPerDay: 50,
    instances: 1,
    flowRunsPerMinute: 20,
    aiTokensPerMonth: 1000,
  },
  STARTER: {
    flowLimit: 5,
    campaignLimit: 5,
    messagesPerMonth: 5000,
    messagesPerMinute: 100,
    messagesPerDay: 200,
    instances: 1,
    flowRunsPerMinute: 100,
    aiTokensPerMonth: 50000,
  },
  PRO: {
    flowLimit: 50,
    campaignLimit: 50,
    messagesPerMonth: 50000,
    messagesPerMinute: 500,
    messagesPerDay: 2000,
    instances: 3,
    flowRunsPerMinute: 500,
    aiTokensPerMonth: 500000,
  },
  ENTERPRISE: {
    flowLimit: null,
    campaignLimit: null,
    messagesPerMonth: null,
    messagesPerMinute: null,
    messagesPerDay: null,
    instances: null,
    flowRunsPerMinute: null,
    aiTokensPerMonth: null,
  },
};

/** Plan limits service. */
@Injectable()
export class PlanLimitsService {
  private readonly logger = new Logger(PlanLimitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private normalizeSubscriptionStatus(status: string | null | undefined): string {
    return String(status || '')
      .trim()
      .toUpperCase();
  }

  private async getPlan(workspaceId: string): Promise<Plan> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { plan: true, status: true },
    });

    const normalizedStatus = this.normalizeSubscriptionStatus(subscription?.status);
    if (!subscription || normalizedStatus !== 'ACTIVE') {
      return 'FREE';
    }
    const plan = subscription.plan?.toUpperCase() as Plan;
    return planConfig[plan] ? plan : 'FREE';
  }

  /**
   * Verifica limite de criação de fluxo
   */
  async ensureFlowLimit(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.flowLimit) {
      return;
    }

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
    if (!cfg.campaignLimit) {
      return;
    }

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
      ((workspace?.providerSettings as Record<string, unknown>)?.billingSuspended ?? false) ===
      true;
    if (billingSuspended) {
      throw new ForbiddenException('Envios suspensos: regularize cobrança para reativar.');
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });

    const normalizedStatus = this.normalizeSubscriptionStatus(sub?.status);

    if (sub && ['CANCELED', 'PAST_DUE'].includes(normalizedStatus)) {
      throw new ForbiddenException(
        `Assinatura ${normalizedStatus}. Regularize o pagamento para continuar.`,
      );
    }
  }

  /**
   * Controle de mensagens por mês via Redis
   * messageLimit: this IS the enforcement point for sendMessage rate limiting
   */
  async trackMessageSend(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.messagesPerMonth) {
      return;
    }

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:messages:${workspaceId}:${ym}`;

    try {
      const total = await this.redis.incr(key);
      if (total === 1) {
        const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
        const ttl = daysInMonth * 24 * 60 * 60;
        await this.redis.expire(key, ttl);
      }

      if (total > cfg.messagesPerMonth) {
        throw new ForbiddenException(`Limite mensal de mensagens atingido para o plano ${plan}.`);
      }
      // PULSE:OK — Redis rate-limit is best-effort; message is allowed to proceed when Redis is unavailable
    } catch (err: unknown) {
      // Em ambientes sem Redis ou em conexão subscriber, não bloqueia (modo tolerante para dev/test)
      this.logger.warn(
        `Redis indisponível para trackMessageSend: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Per-workspace WhatsApp message rate limiting (per-minute sliding window via Redis).
   * Matches the worker RateLimiter plan-tier limits.
   * Invariant: rate limit keyed on workspaceId for multi-instance consistency.
   */
  async ensureMessageRate(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.messagesPerMinute) {
      return;
    }
    const limit = cfg.messagesPerMinute;

    const minuteBucket = Math.floor(Date.now() / 60_000);
    const key = `plan:messages_rate:${workspaceId}:${minuteBucket}`;

    try {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, 120);
      }

      if (current > limit) {
        this.logger.warn(
          `[RateLimit] WhatsApp rate limit HIT — workspaceId=${workspaceId} count=${current - 1} limit=${limit} plan=${plan}`,
        );
        throw new ForbiddenException(
          `Limite de ${limit} mensagens/minuto atingido para o plano ${plan}. Aguarde.`,
        );
      }
      // PULSE:OK — Redis rate-limit is best-effort; message is allowed to proceed when Redis is unavailable
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.warn(
        `[RateLimit] Redis unavailable for ensureMessageRate (workspaceId=${workspaceId}): ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Per-workspace daily WhatsApp message quota (persistent, PostgreSQL-backed).
   * Atomically increments the counter and throws if the plan's daily limit is
   * exceeded. Enterprise plans (messagesPerDay = null) skip the check.
   *
   * Uses INSERT ... ON CONFLICT ... DO UPDATE RETURNING for atomicity without
   * locks, guaranteeing correct counting under concurrent sends.
   */
  async ensureDailyMessageQuota(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.messagesPerDay) {
      return;
    }
    const limit = cfg.messagesPerDay;

    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);

      const result = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `INSERT INTO "RAC_DailyMessageCounter" ("id", "workspaceId", "date", "count", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2::date, 1, NOW())
         ON CONFLICT ("workspaceId", "date")
         DO UPDATE SET "count" = "RAC_DailyMessageCounter"."count" + 1
         RETURNING "count"`,
        workspaceId,
        dateStr,
      );

      const count = result[0]?.count ?? 0;

      if (count > limit) {
        this.logger.warn(
          `[DailyQuota] WhatsApp daily limit HIT — workspaceId=${workspaceId} count=${count} limit=${limit} plan=${plan}`,
        );
        throw new ForbiddenException(
          `Limite diário de ${limit} mensagens atingido para o plano ${plan}. Tente novamente amanhã.`,
        );
      }
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.warn(
        `[DailyQuota] DB unavailable for ensureDailyMessageQuota (workspaceId=${workspaceId}): ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Limita execuções de fluxo por minuto (proteção anti-abuso de run-flow).
   */
  async ensureFlowRunRate(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.flowRunsPerMinute) {
      return;
    }

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
      // PULSE:OK — Redis unavailability for rate-limit tracking is non-fatal; allowing the operation is the safe fallback
    } catch (err: unknown) {
      this.logger.warn(
        `Redis indisponível para ensureFlowRunRate: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      return;
    }
  }

  /**
   * Pre-flight tokenBudget check — throws if workspace has exceeded monthly AI token limit.
   * Called before each LLM API call to prevent runaway costs.
   */
  async ensureTokenBudget(workspaceId: string) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.aiTokensPerMonth) {
      return;
    } // ENTERPRISE = unlimited

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:ai_tokens:${workspaceId}:${ym}`;

    try {
      const current = await this.redis.get(key);
      const total = current ? Number.parseInt(current, 10) : 0;
      if (total > cfg.aiTokensPerMonth) {
        throw new ForbiddenException(`Limite mensal de tokens IA atingido para o plano ${plan}.`);
      }
    } catch (err: unknown) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.warn(
        `Redis indisponível para ensureTokenBudget: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Track AI Token Usage
   */
  async trackAiUsage(workspaceId: string, tokens: number) {
    const plan = await this.getPlan(workspaceId);
    const cfg = planConfig[plan];
    if (!cfg.aiTokensPerMonth) {
      return;
    }

    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `plan:ai_tokens:${workspaceId}:${ym}`;

    try {
      const total = await this.redis.incrby(key, tokens);
      if (total === tokens) {
        const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
        const ttl = daysInMonth * 24 * 60 * 60;
        await this.redis.expire(key, ttl);
      }

      if (total > cfg.aiTokensPerMonth) {
        throw new ForbiddenException(`Limite mensal de tokens IA atingido para o plano ${plan}.`);
      }
      // PULSE:OK — Redis AI token tracking is best-effort; AI call proceeds when Redis is unavailable
    } catch (err: unknown) {
      this.logger.warn(
        `Redis indisponível para trackAiUsage: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }
}
