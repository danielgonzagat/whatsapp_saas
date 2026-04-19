import { redis } from '../redis-client';

const ERROR_THRESHOLD = 5; // 5 errors in window = unhealthy
const WINDOW = 60; // 1 minute

async function heartbeat(sessionId: string) {
  await redis.set(`health:${sessionId}:heartbeat`, Date.now(), 'EX', 300); // 5 min TTL
  // Successful heartbeat: reset the error count so the session returns to healthy state
  await redis.del(`health:${sessionId}:errors`);
}

async function reportError(sessionId: string, error: string) {
  const key = `health:${sessionId}:errors`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW);
  }

  if (count >= ERROR_THRESHOLD) {
    console.warn(`[WATCHDOG] Session ${sessionId} is UNHEALTHY (Errors: ${count})`);
    // Trigger alert (could publish to Redis channel for dashboard)
    await redis.publish(
      'alerts',
      JSON.stringify({
        type: 'SESSION_UNHEALTHY',
        sessionId,
        errorCount: count,
        lastError: error,
      }),
    );
  }
}

async function isHealthy(sessionId: string): Promise<boolean> {
  const errors = await redis.get(`health:${sessionId}:errors`);
  return (Number(errors) || 0) < ERROR_THRESHOLD;
}

export const Watchdog = {
  heartbeat,
  reportError,
  isHealthy,
} as const;
