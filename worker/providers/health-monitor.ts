import { redis } from "../redis-client";

/**
 * ==========================================================
 * HEALTH MONITOR PRO (UWE-Ω) - WORKER EDITION
 * ==========================================================
 *
 * Monitors health per Workspace/Instance, not just provider type.
 * Stores status in Redis for shared visibility.
 */

export type InstanceStatus = "CONNECTED" | "DISCONNECTED" | "BANNED" | "QRCODE" | "UNKNOWN";

type ProviderStat = {
  provider: string;
  success: number;
  fail: number;
  avgLatency: number;
  lastUpdate: number;
};

// Lightweight provider health tracker used by the WhatsApp drivers.
const providerStats: Record<string, ProviderStat> = {};

export class HealthMonitor {
  private static KEY_PREFIX = "health:instance";

  /**
   * Report current status of an instance.
   */
  static async reportStatus(workspaceId: string, status: InstanceStatus, meta: any = {}) {
    const key = `${this.KEY_PREFIX}:${workspaceId}`;
    const data = {
      status,
      lastCheck: Date.now(),
      meta,
    };
    
    // Save to Redis (expire in 24h if no updates)
    await redis.set(key, JSON.stringify(data), "EX", 86400);
    
    // Publish event if banned
    if (status === "BANNED") {
      await redis.publish("events:ban", JSON.stringify({ workspaceId, timestamp: Date.now() }));
    }
  }

  /**
   * Get health score (0-100) based on recent message success rate.
   */
  static async updateMetrics(workspaceId: string, success: boolean, latency: number) {
    const key = `metrics:${workspaceId}`;
    const now = Date.now();
    
    // Use Redis lists to store last 50 events for rolling window calculation
    const event = success ? `1:${latency}` : `0:${latency}`;
    await redis.lpush(key, event);
    await redis.ltrim(key, 0, 49); // Keep only last 50
    
    // Set expiry
    await redis.expire(key, 3600); // 1 hour metrics
  }

  static async getHealth(workspaceId: string): Promise<{ score: number; avgLatency: number }> {
    const key = `metrics:${workspaceId}`;
    const events = await redis.lrange(key, 0, -1);
    
    if (events.length === 0) return { score: 100, avgLatency: 0 };

    let successCount = 0;
    let totalLatency = 0;

    events.forEach(e => {
      const [ok, lat] = e.split(":");
      if (ok === "1") successCount++;
      totalLatency += Number(lat);
    });

    return {
      score: Math.round((successCount / events.length) * 100),
      avgLatency: Math.round(totalLatency / events.length)
    };
  }

  /**
   * Publica um alerta simples em um canal Redis.
   * Pode ser consumido pelo backend para notificar UI/ops.
   */
  static async pushAlert(workspaceId: string, kind: string, meta: any = {}) {
    const payload = {
      workspaceId,
      kind,
      meta,
      ts: Date.now(),
    };
    await redis.publish("alerts", JSON.stringify(payload));
  }
}

/**
 * Compatibility helper used by the provider drivers.
 * Tracks health per provider type and can be extended to persist in Redis.
 */
export const providerStatus = {
  success(provider: string, latency: number = 0) {
    const current = providerStats[provider] || {
      provider,
      success: 0,
      fail: 0,
      avgLatency: latency || 0,
      lastUpdate: Date.now(),
    };

    const total = current.success + current.fail + 1;
    const newAvg = current.avgLatency + (latency - current.avgLatency) / total;

    providerStats[provider] = {
      ...current,
      success: current.success + 1,
      avgLatency: Math.round(newAvg),
      lastUpdate: Date.now(),
    };

    // Update global metrics (workspace-agnostic)
    HealthMonitor.updateMetrics("global", true, latency).catch(() => {});
  },

  error(provider: string) {
    const current = providerStats[provider] || {
      provider,
      success: 0,
      fail: 0,
      avgLatency: 0,
      lastUpdate: Date.now(),
    };

    providerStats[provider] = {
      ...current,
      fail: current.fail + 1,
      lastUpdate: Date.now(),
    };

    HealthMonitor.updateMetrics("global", false, 0).catch(() => {});
  },

  getHealthRanking(): string[] {
    const defaults = ["meta", "wpp", "evolution", "ultrawa"];

    const ranking = Object.values(providerStats)
      .map((p) => {
        const total = p.success + p.fail;
        const score = total === 0 ? 0.5 : p.success / total;
        return { ...p, score };
      })
      .sort((a, b) => {
        // Higher score first, then lower latency
        if (b.score !== a.score) return b.score - a.score;
        return (a.avgLatency || 0) - (b.avgLatency || 0);
      })
      .map((p) => p.provider);

    // If we still have providers not seen yet, append them in default order
    for (const p of defaults) {
      if (!ranking.includes(p)) ranking.push(p);
    }

    return ranking;
  },
};
