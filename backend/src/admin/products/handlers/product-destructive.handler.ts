import { Injectable } from '@nestjs/common';
import { DestructiveIntentKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UnsupportedUndoError,
  type DestructiveHandler,
  type DestructiveHandlerResult,
} from '../../destructive/destructive-handler.registry';
import type { DestructiveIntentRecord } from '../../destructive/destructive-intent.types';

/**
 * SP-8 domain handler for PRODUCT_ARCHIVE. Flips a product's
 * `active=false` and `status='ARCHIVED'` — fully reversible by
 * the `undo()` path which restores the previous pair. The snapshot
 * captures the pre-archive state so undo is deterministic.
 */
@Injectable()
export class ProductArchiveHandler implements DestructiveHandler {
  readonly kind = DestructiveIntentKind.PRODUCT_ARCHIVE;
  readonly reversible = true;
  readonly requiresOtp = false;

  constructor(private readonly prisma: PrismaService) {}

  async execute(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: intent.targetId },
      select: { id: true, active: true, status: true, name: true, workspaceId: true },
    });
    if (!product) {
      return { ok: false, snapshot: { error: 'product_not_found' } };
    }
    await this.prisma.product.update({
      where: { id: intent.targetId },
      data: { active: false, status: 'ARCHIVED' },
    });
    return {
      ok: true,
      snapshot: {
        productId: product.id,
        workspaceId: product.workspaceId,
        name: product.name,
        previousActive: product.active,
        previousStatus: product.status,
      },
    };
  }

  async undo(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    const snapshot = (intent.resultSnapshot ?? {}) as {
      previousActive?: boolean;
      previousStatus?: string;
    };
    const previousActive = snapshot.previousActive ?? true;
    const previousStatus = snapshot.previousStatus ?? 'APPROVED';
    await this.prisma.product.update({
      where: { id: intent.targetId },
      data: { active: previousActive, status: previousStatus },
    });
    return {
      ok: true,
      snapshot: { restoredActive: previousActive, restoredStatus: previousStatus },
    };
  }
}

/**
 * SP-8 domain handler for PRODUCT_DELETE. Permanent removal; no
 * undo. `undo()` throws `UnsupportedUndoError` so the service short-
 * circuits into a 409 Conflict rather than attempting anything.
 */
@Injectable()
export class ProductDeleteHandler implements DestructiveHandler {
  readonly kind = DestructiveIntentKind.PRODUCT_DELETE;
  readonly reversible = false;
  readonly requiresOtp = true;

  constructor(private readonly prisma: PrismaService) {}

  async execute(intent: DestructiveIntentRecord): Promise<DestructiveHandlerResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: intent.targetId },
      select: { id: true, name: true, workspaceId: true },
    });
    if (!product) {
      return { ok: false, snapshot: { error: 'product_not_found' } };
    }
    await this.prisma.product.delete({ where: { id: intent.targetId } });
    return {
      ok: true,
      snapshot: {
        deletedProductId: product.id,
        workspaceId: product.workspaceId,
        name: product.name,
      },
    };
  }

  undo(): Promise<DestructiveHandlerResult> {
    // Hard delete is irreversible (I-ADMIN-D1). Throw synchronously.
    return Promise.reject(new UnsupportedUndoError(DestructiveIntentKind.PRODUCT_DELETE));
  }
}
