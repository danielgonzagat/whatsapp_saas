import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DestructiveIntentKind } from '@prisma/client';
import type Redis from 'ioredis';
import { AdminAuditService } from '../../audit/admin-audit.service';
import {
  UnsupportedUndoError,
  type DestructiveHandler,
  type DestructiveHandlerResult,
} from '../destructive-handler.registry';
import type { DestructiveIntentRecord } from '../destructive-intent.types';

export class NotConfiguredException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredException';
  }
}

interface PurgeResult {
  redisKeysDeleted: number;
  redisPattern: string;
  cdnPurged: boolean;
  cdnProvider: string | null;
  cdnError: string | null;
  targetType: string;
  targetId: string;
}

@Injectable()
export class CachePurgeHandler implements DestructiveHandler {
  readonly kind = DestructiveIntentKind.CACHE_PURGE;
  readonly reversible = false;
  readonly requiresOtp = false;

  private readonly logger = new Logger(CachePurgeHandler.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Optional() private readonly adminAudit?: AdminAuditService,
  ) {}

  async execute(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    const { targetType, targetId } = intent;

    const redisUrl = process.env.REDIS_URL;
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;

    if (!redisUrl) {
      throw new NotConfiguredException(
        'Cache purge requires REDIS_URL environment variable',
      );
    }

    const pattern = `cache:${targetType}:${targetId}*`;

    const result: PurgeResult = {
      redisKeysDeleted: 0,
      redisPattern: pattern,
      cdnPurged: false,
      cdnProvider: null,
      cdnError: null,
      targetType,
      targetId,
    };

    result.redisKeysDeleted = await this.purgeRedisByPattern(pattern);

    if (cfToken && cfZoneId) {
      const { purged, error } = await this.purgeCloudflare(intent, cfToken, cfZoneId);
      result.cdnPurged = purged;
      result.cdnProvider = 'cloudflare';
      result.cdnError = error;
    } else {
      this.logger.warn(
        '[cache-purge] CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set — skipping CDN purge',
      );
    }

    await this.persistAudit(intent, result);

    return {
      ok: true,
      snapshot: {
        redisKeysDeleted: result.redisKeysDeleted,
        redisPattern: result.redisPattern,
        cdnPurged: result.cdnPurged,
        cdnProvider: result.cdnProvider,
        cdnError: result.cdnError,
        targetType: result.targetType,
        targetId: result.targetId,
        purgedAt: new Date().toISOString(),
      },
    };
  }

  undo(): Promise<DestructiveHandlerResult> {
    return Promise.reject(new UnsupportedUndoError(DestructiveIntentKind.CACHE_PURGE));
  }

  private async purgeRedisByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    let cursor = '0';
    const batchSize = 100;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        batchSize,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
    } while (cursor !== '0');

    this.logger.log(`[cache-purge] Redis: deleted ${deleted} keys matching ${pattern}`);
    return deleted;
  }

  private async purgeCloudflare(
    intent: DestructiveIntentRecord,
    token: string,
    zoneId: string,
  ): Promise<{ purged: boolean; error: string | null }> {
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
    const cacheTag = `kloel-${intent.targetType}-${intent.targetId}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags: [cacheTag] }),
      });

      const json = (await response.json()) as { success?: boolean; errors?: unknown[] };

      if (!response.ok || !json.success) {
        const errorMsg = `Cloudflare purge returned errors: ${JSON.stringify(json.errors)}`;
        this.logger.warn(`[cache-purge] ${errorMsg}`);
        return { purged: false, error: errorMsg };
      }

      this.logger.log(`[cache-purge] Cloudflare: purged tag ${cacheTag}`);
      return { purged: true, error: null };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[cache-purge] Cloudflare API call failed: ${errorMsg}`);
      return { purged: false, error: errorMsg };
    }
  }

  private async persistAudit(
    intent: DestructiveIntentRecord,
    result: PurgeResult,
  ): Promise<void> {
    if (!this.adminAudit) {
      this.logger.warn('[cache-purge] AdminAuditService not available — skipping audit log');
      return;
    }

    await this.adminAudit.append({
      adminUserId: intent.createdByAdminUserId,
      action: 'CACHE_PURGE',
      entityType: result.targetType,
      entityId: result.targetId,
      details: {
        redisKeysDeleted: result.redisKeysDeleted,
        redisPattern: result.redisPattern,
        cdnPurged: result.cdnPurged,
        cdnProvider: result.cdnProvider,
        cdnError: result.cdnError,
        reason: intent.reason,
      },
      ip: intent.ip,
      userAgent: intent.userAgent,
    });
  }
}
