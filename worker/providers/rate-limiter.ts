import { prisma } from '../db';
import { rateLimitCounter } from '../metrics';
import { redis } from '../redis-client';
import { redis as redisClient } from '../redis-client';

const WINDOW = 60; // 1 minute window

// Limits per minute
const LIMITS: Record<string, number> = {
  FREE: 5,
  STARTER: 60, // 1/sec
  PRO: 600, // 10/sec
  ENTERPRISE: 3000, // 50/sec
};

/**
 * Utilitário comum para incrementar e checar limite
 */
async function bumpAndCheck(key: string, limit: number): Promise<boolean> {
  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, WINDOW);
    }

    return current <= limit;
  } catch (err: unknown) {
    console.warn(
      '[RateLimiter] fallback allow due to redis error:',
      err instanceof Error ? err.message : String(err),
    );
    return true;
  }
}

/**
 * Recupera plano e limite (com cache) em uma chamada
 */
async function getPlanAndLimit(workspaceId: string): Promise<{ plan: string; limit: number }> {
  const cacheKey = `ratelimit:limit:${workspaceId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const [p, l] = cached.split(':');
    return { plan: p || 'cached', limit: Number(l) };
  }

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: { plan: true },
  });

  const plan = sub?.plan || 'FREE';
  const limit = LIMITS[plan] || LIMITS.FREE;

  await redis.set(cacheKey, `${plan}:${limit}`, 'EX', 300);
  return { plan, limit };
}

async function publishAlert(workspaceId: string, type: string, data: Record<string, unknown>) {
  try {
    await redisClient.publish(
      `alerts:${workspaceId}`,
      JSON.stringify({
        type,
        workspaceId,
        timestamp: Date.now(),
        data,
      }),
    );
  } catch (err: unknown) {
    // PULSE:OK — Alert publish non-critical; rate limiting still enforced regardless
    console.error('[RateLimiter] Failed to publish alert', err);
  }
}

export const RateLimiter = {
  async checkLimit(workspaceId: string): Promise<boolean> {
    // Dev/test mode: no throttling
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      return true;
    }

    const { plan, limit } = await getPlanAndLimit(workspaceId);
    const allowed = await bumpAndCheck(`ratelimit:${workspaceId}`, limit);
    rateLimitCounter
      .labels({ scope: 'workspace', workspaceId, result: allowed ? 'allow' : 'block', plan })
      .inc();
    if (!allowed) {
      await publishAlert(workspaceId, 'workspace_rate_limit_block', { limit, plan });
    }
    return allowed;
  },

  /**
   * Limite por número (protege conta de burst em um único destinatário)
   */
  async checkNumberLimit(workspaceId: string, phone: string): Promise<boolean> {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      return true;
    }

    const { plan, limit: planLimit } = await getPlanAndLimit(workspaceId);
    // heurística: por número = 1/5 do limite do workspace, mínimo 3
    const perNumberLimit = Math.max(3, Math.floor(planLimit / 5));
    const allowed = await bumpAndCheck(`ratelimit:${workspaceId}:to:${phone}`, perNumberLimit);
    rateLimitCounter
      .labels({ scope: 'number', workspaceId, result: allowed ? 'allow' : 'block', plan })
      .inc();
    if (!allowed) {
      await publishAlert(workspaceId, 'number_rate_limit_block', {
        limit: perNumberLimit,
        phone,
        plan,
      });
    }
    return allowed;
  },

  async getLimit(workspaceId: string): Promise<number> {
    const { limit } = await getPlanAndLimit(workspaceId);
    return limit;
  },

  async getUsage(workspaceId: string): Promise<{ current: number; limit: number }> {
    const key = `ratelimit:${workspaceId}`;
    const current = await redis.get(key);
    const limit = await RateLimiter.getLimit(workspaceId);
    return {
      current: Number(current) || 0,
      limit,
    };
  },
};
