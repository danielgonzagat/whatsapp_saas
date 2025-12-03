import { redis } from "../redis-client";

export class Watchdog {
  private static ERROR_THRESHOLD = 5; // 5 errors in window = unhealthy
  private static WINDOW = 60; // 1 minute

  static async heartbeat(sessionId: string) {
    await redis.set(`health:${sessionId}:heartbeat`, Date.now(), "EX", 300); // 5 min TTL
    await redis.del(`health:${sessionId}:errors`); // Reset errors on success? Maybe not.
  }

  static async reportError(sessionId: string, error: string) {
    const key = `health:${sessionId}:errors`;
    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, this.WINDOW);
    }
    
    if (count >= this.ERROR_THRESHOLD) {
        console.warn(`[WATCHDOG] Session ${sessionId} is UNHEALTHY (Errors: ${count})`);
        // Trigger alert (could publish to Redis channel for dashboard)
        await redis.publish("alerts", JSON.stringify({
            type: "SESSION_UNHEALTHY",
            sessionId,
            errorCount: count,
            lastError: error
        }));
    }
  }

  static async isHealthy(sessionId: string): Promise<boolean> {
    const errors = await redis.get(`health:${sessionId}:errors`);
    return (Number(errors) || 0) < this.ERROR_THRESHOLD;
  }
}
