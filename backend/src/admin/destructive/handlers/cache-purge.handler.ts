import { Injectable, Logger } from '@nestjs/common';
import { DestructiveIntentKind } from '@prisma/client';
import {
  UnsupportedUndoError,
  type DestructiveHandler,
  type DestructiveHandlerResult,
} from '../destructive-handler.registry';
import type { DestructiveIntentRecord } from '../destructive-intent.types';

/**
 * SP-8 CACHE_PURGE handler. v0 is a no-op stub that logs the
 * purge request. When the next iteration of the admin caching
 * layer lands (Redis tag-based invalidation, CDN purge via
 * Cloudflare), this handler calls the real invalidation API.
 *
 * The handler exists now so operators can call the endpoint in
 * drills and tests without hitting a 501. Reversible: false —
 * a successful purge cannot be un-purged.
 */
@Injectable()
export class CachePurgeHandler implements DestructiveHandler {
  readonly kind = DestructiveIntentKind.CACHE_PURGE;
  readonly reversible = false;
  readonly requiresOtp = false;

  private readonly logger = new Logger(CachePurgeHandler.name);

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    this.logger.warn(
      `[cache-purge] requested by ${intent.createdByAdminUserId} reason=${intent.reason}`,
    );
    return {
      ok: true,
      snapshot: {
        purged: 'noop-stub',
        note: 'CACHE_PURGE handler v0 is a logged no-op. Replace with real invalidation when the caching layer lands.',
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async undo(): Promise<DestructiveHandlerResult> {
    throw new UnsupportedUndoError(DestructiveIntentKind.CACHE_PURGE);
  }
}
