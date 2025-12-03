import { redis } from "./redis-client";

/**
 * =====================================================================
 * REDIS CONTEXT STORE PRO (SCALABLE)
 * =====================================================================
 * 
 * Replaces in-memory EventEmitter with Redis Pub/Sub and Lists.
 * Allows multiple workers to coordinate flow execution.
 */

export const contextStore = {
  /**
   * Waits for a user reply.
   * Uses BLPOP (Blocking Left Pop) on a Redis list unique to the user.
   * This blocks the specific async call, but allows other node events if managed correctly.
   * NOTE: In a production worker, long polling blocks the connection. 
   * Ideally, we should use a state machine + separate jobs, but this maintains current logic compatibility.
   */
  async waitForReply(user: string, timeoutSeconds: number = 86400): Promise<string | null> {
    const key = `reply:${user}`;
    console.log(`⏳ [CTX] Waiting for reply from ${user} on key ${key}...`);

    try {
      // BLPOP returns [key, element] or null if timeout
      const result = await redis.blpop(key, timeoutSeconds);
      
      if (result) {
        const [, message] = result;
        return message;
      }
      
      return null; // Timeout
    } catch (error) {
      console.error("Error in waitForReply:", error);
      return null;
    }
  },

  /**
   * Delivers a message to a waiting flow.
   * Pushes to the Redis list which 'waitForReply' is blocking on.
   */
  async deliver(user: string, message: string) {
    const key = `reply:${user}`;
    console.log(`📨 [CTX] Delivering message from ${user} to key ${key}`);
    await redis.rpush(key, message);
    
    // Set expiry to clean up old keys if no one is listening
    await redis.expire(key, 60 * 60 * 24); // 24 hours
  }
};

/**
 * =====================================================================
 * GENERIC CONTEXT STORE (KEY/VALUE + ZSET)
 * =====================================================================
 *
 * Usado pelo FlowEngineGlobal e AntiBan para:
 * - armazenar estado de execução
 * - gerenciar timeouts (ZSET)
 */
export class ContextStore {
  private prefix: string;

  constructor(prefix: string = "flow-context") {
    this.prefix = prefix;
  }

  private k(key: string) {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(this.k(key));
    return data ? (JSON.parse(data) as T) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number) {
    const str = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(this.k(key), str, "EX", ttlSeconds);
    } else {
      await redis.set(this.k(key), str);
    }
  }

  async delete(key: string) {
    await redis.del(this.k(key));
  }

  async zadd(key: string, score: number, member: string) {
    await redis.zadd(this.k(key), score, member);
  }

  async zrangeByScore(key: string, min: number, max: number) {
    return redis.zrangebyscore(this.k(key), min, max);
  }

  async zrem(key: string, member: string) {
    await redis.zrem(this.k(key), member);
  }

  async zcount(key: string, min: number, max: number) {
    return redis.zcount(this.k(key), min, max);
  }

  async zremRangeByScore(key: string, min: number, max: number) {
    await redis.zremrangebyscore(this.k(key), min, max);
  }

  async publish(channel: string, message: any) {
    await redis.publish(channel, JSON.stringify(message));
  }
}
