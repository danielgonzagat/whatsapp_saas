import type Redis from 'ioredis';

export function getLockKey(ws: string): string {
  return `whatsapp:catchup:${ws}`;
}

export function getCooldownKey(ws: string): string {
  return `whatsapp:catchup:cooldown:${ws}`;
}

export async function releaseLock(redis: Redis, ws: string, token: string): Promise<void> {
  const lk = getLockKey(ws);
  const current = await redis.get(lk);
  if (current === token) await redis.del(lk);
}
