import { redis } from "../redis-client";
import { prisma } from "../db";
import { rateLimitCounter } from "../metrics";
import { redis as redisClient } from "../redis-client";

export class RateLimiter {
  private static WINDOW = 60; // 1 minute window
  
  // Limits per minute
  private static LIMITS: Record<string, number> = {
    'FREE': 5,
    'STARTER': 60,    // 1/sec
    'PRO': 600,       // 10/sec
    'ENTERPRISE': 3000 // 50/sec
  };

  static async checkLimit(workspaceId: string): Promise<boolean> {
    // Dev/test mode: no throttling
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      return true;
    }

    const { plan, limit } = await this.getPlanAndLimit(workspaceId);
    const allowed = await this.bumpAndCheck(`ratelimit:${workspaceId}`, limit);
    rateLimitCounter.labels({ scope: "workspace", workspaceId, result: allowed ? "allow" : "block", plan }).inc();
    if (!allowed) {
      await this.publishAlert(workspaceId, "workspace_rate_limit_block", { limit, plan });
    }
    return allowed;
  }

  /**
   * Limite por número (protege conta de burst em um único destinatário)
   */
  static async checkNumberLimit(workspaceId: string, phone: string): Promise<boolean> {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      return true;
    }

    const { plan, limit: planLimit } = await this.getPlanAndLimit(workspaceId);
    // heurística: por número = 1/5 do limite do workspace, mínimo 3
    const perNumberLimit = Math.max(3, Math.floor(planLimit / 5));
    const allowed = await this.bumpAndCheck(`ratelimit:${workspaceId}:to:${phone}`, perNumberLimit);
    rateLimitCounter.labels({ scope: "number", workspaceId, result: allowed ? "allow" : "block", plan }).inc();
    if (!allowed) {
      await this.publishAlert(workspaceId, "number_rate_limit_block", { limit: perNumberLimit, phone, plan });
    }
    return allowed;
  }

  static async getLimit(workspaceId: string): Promise<number> {
    const { limit } = await this.getPlanAndLimit(workspaceId);
    return limit;
  }

  static async getUsage(workspaceId: string): Promise<{ current: number; limit: number }> {
    const key = `ratelimit:${workspaceId}`;
    const current = await redis.get(key);
    const limit = await this.getLimit(workspaceId);
    return {
      current: Number(current) || 0,
      limit
    };
  }

  /**
   * Utilitário comum para incrementar e checar limite
   */
  private static async bumpAndCheck(key: string, limit: number): Promise<boolean> {
    try {
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, this.WINDOW);
      }

      return current <= limit;
    } catch (err) {
      console.warn('[RateLimiter] fallback allow due to redis error:', (err as any)?.message);
      return true;
    }
  }

  /**
   * Recupera plano e limite (com cache) em uma chamada
   */
  private static async getPlanAndLimit(workspaceId: string): Promise<{ plan: string; limit: number }> {
    const cacheKey = `ratelimit:limit:${workspaceId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const [p, l] = cached.split(':');
      return { plan: p || "cached", limit: Number(l) };
    }

    const sub = await prisma.subscription.findUnique({
        where: { workspaceId },
        select: { plan: true }
    });

    const plan = sub?.plan || 'FREE';
    const limit = this.LIMITS[plan] || this.LIMITS['FREE'];

    await redis.set(cacheKey, `${plan}:${limit}`, 'EX', 300);
    return { plan, limit };
  }

  private static async publishAlert(workspaceId: string, type: string, data: any) {
    try {
      await redisClient.publish(`alerts:${workspaceId}`, JSON.stringify({
        type,
        workspaceId,
        timestamp: Date.now(),
        data,
      }));
    } catch (err) {
      // Alertas não devem derrubar fluxo de envio
      console.error("[RateLimiter] Failed to publish alert", err);
    }
  }
}
