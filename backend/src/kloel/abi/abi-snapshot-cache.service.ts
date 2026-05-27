import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { StructuredLogger } from '../../logging/structured-logger';
import type { CognitiveStateAbi } from './abi-schema';

const SNAPSHOT_KEY_PREFIX = 'abi:snap:';
const SNAPSHOT_TTL_SECONDS = 300;

/**
 * CIA Gap 2 — ABI snapshot cache.
 *
 * Caches the last successful ABI snapshot per workspace in Redis (TTL 5 min)
 * as a fast-path fallback when ABI build or validation fails, so the LLM
 * never receives the hardcoded zero-state while a recent valid snapshot exists.
 *
 * All Redis operations are try/catch-wrapped — Redis failure NEVER breaks
 * message delivery.
 */
@Injectable()
export class AbiSnapshotCacheService {
  private readonly logger = StructuredLogger.from(AbiSnapshotCacheService.name);

  constructor(@Optional() @InjectRedis() private readonly redis?: Redis) {}

  async cacheSnapshot(workspaceId: string, payload: CognitiveStateAbi): Promise<void> {
    if (!this.redis) {return;}
    try {
      const key = `${SNAPSHOT_KEY_PREFIX}${workspaceId}`;
      await this.redis.set(key, JSON.stringify(payload), 'EX', SNAPSHOT_TTL_SECONDS);
    } catch (err: unknown) {
      this.logger.warn(
        `Cache write failed for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getCachedSnapshot(workspaceId: string): Promise<CognitiveStateAbi | null> {
    if (!this.redis) {return null;}
    try {
      const key = `${SNAPSHOT_KEY_PREFIX}${workspaceId}`;
      const raw = await this.redis.get(key);
      if (!raw) {return null;}
      return JSON.parse(raw) as CognitiveStateAbi;
    } catch (err: unknown) {
      this.logger.warn(
        `Cache read failed for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
