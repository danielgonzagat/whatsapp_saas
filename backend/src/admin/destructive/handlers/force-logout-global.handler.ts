import { Injectable } from '@nestjs/common';
import { DestructiveIntentKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UnsupportedUndoError,
  type DestructiveHandler,
  type DestructiveHandlerResult,
} from '../destructive-handler.registry';
import type { DestructiveIntentRecord } from '../destructive-intent.types';

/**
 * SP-8 FORCE_LOGOUT_GLOBAL handler. Revokes every active
 * AdminSession so every operator has to re-authenticate on their
 * next request. Used in incident response (suspected token leak,
 * compromise). Not reversible — a re-login cannot be undone by
 * calling this undo path.
 */
@Injectable()
export class ForceLogoutGlobalHandler implements DestructiveHandler {
  /** Kind property. */
  readonly kind = DestructiveIntentKind.FORCE_LOGOUT_GLOBAL;
  /** Reversible property. */
  readonly reversible = false;
  /** Requires otp property. */
  readonly requiresOtp = true;

  constructor(private readonly prisma: PrismaService) {}

  /** Execute. */
  async execute(_intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    const now = new Date();
    const result = await this.prisma.adminSession.updateMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return {
      ok: true,
      snapshot: {
        revokedSessionCount: result.count,
        revokedAt: now.toISOString(),
      },
    };
  }

  /** Undo. */
  undo(): Promise<DestructiveHandlerResult> {
    return Promise.reject(new UnsupportedUndoError(DestructiveIntentKind.FORCE_LOGOUT_GLOBAL));
  }
}
