import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { isMindMemoryBackfillEnabled } from './mindmemory-backfill.flag';

/**
 * Brain→Mind cutover, Phase 2 (MEMORY) — historical backfill. Twin of
 * {@link MindMessageBackfillService}.
 *
 * The live dual-write (mind-memory-item.service.ts, KLOEL_MINDMEMORY_DUALWRITE)
 * only mirrors NEW memory upserts into RAC_MindMemory. Activating the reader
 * cut-over (KLOEL_MINDMEMORY_READ_CANONICAL) without backfilling history would
 * make the canonical store miss every pre-cutover memory item. This copies that
 * history idempotently.
 *
 * Safety:
 *   - READ-ONLY on RAC_KloelMemory; ADDITIVE-ONLY on RAC_MindMemory (no updates,
 *     no deletes).
 *   - IDEMPOTENT BY THE EXISTING UNIQUE KEY: RAC_MindMemory is unique on
 *     (workspaceId, namespace, key); each KloelMemory maps to exactly one
 *     MindMemory(namespace='default', key). `createMany({ skipDuplicates })`
 *     therefore makes a re-run — AND the overlap with live dual-writes (which
 *     target the same unique) — a no-op. No correlation column and no `before`
 *     cutoff are needed (unlike the message twin, whose canonical table had no
 *     natural key). The original createdAt is preserved.
 *   - GATED: no-op unless KLOEL_MINDMEMORY_BACKFILL='true'.
 *   - CURSOR-PAGINATED: scales to large tables.
 *
 * NOTE: the pgvector `embedding` column is Prisma-Unsupported, so it is omitted
 * (it cannot be set via the typed client — the canonical re-embeds lazily), the
 * same as the live dual-write path.
 */
export interface MindMemoryBackfillOptions {
  /** Restrict to a single workspace (omit to backfill all). */
  readonly workspaceId?: string;
  /** Rows per batch (clamped to [1, 5000]). Default 500. */
  readonly batchSize?: number;
  /** Optional cap on total rows scanned this run (for staged/canary runs). */
  readonly limit?: number;
}

export interface MindMemoryBackfillResult {
  readonly enabled: boolean;
  readonly scanned: number;
  readonly inserted: number;
  readonly batches: number;
}

export interface MindMemoryParityResult {
  readonly legacy: number;
  readonly mirrored: number;
  readonly missing: number;
  readonly coverage: number;
}

@Injectable()
export class MindMemoryBackfillService {
  private readonly logger = StructuredLogger.from(MindMemoryBackfillService.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async backfill(
    options: MindMemoryBackfillOptions = {},
  ): Promise<MindMemoryBackfillResult> {
    if (!isMindMemoryBackfillEnabled()) {
      return { enabled: false, scanned: 0, inserted: 0, batches: 0 };
    }

    const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 5000);
    let scanned = 0;
    let inserted = 0;
    let batches = 0;
    let cursorId: string | undefined;

    for (;;) {
      const rows = await this.prisma.kloelMemory.findMany({
        where: {
          ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursorId !== undefined ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          workspaceId: true,
          key: true,
          value: true,
          category: true,
          type: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      });

      if (rows.length === 0) {
        break;
      }
      scanned += rows.length;

      const created = await this.prisma.mindMemory.createMany({
        data: rows.map((r) => ({
          workspaceId: r.workspaceId,
          namespace: 'default',
          key: r.key,
          value: r.value as Prisma.InputJsonValue,
          category: r.category,
          createdAt: r.createdAt,
          ...(r.type !== null ? { type: r.type } : {}),
          ...(r.content !== null ? { content: r.content } : {}),
          ...(r.metadata !== null && r.metadata !== undefined ? { metadata: r.metadata } : {}),
        })),
        skipDuplicates: true,
      });

      inserted += created.count;
      batches += 1;
      cursorId = rows[rows.length - 1]?.id;

      if (options.limit !== undefined && scanned >= options.limit) {
        break;
      }
    }

    this.logger.log({
      operation: 'mind.memory_backfill.run',
      status: 'ok',
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      scanned,
      inserted,
      batches,
    });

    return { enabled: true, scanned, inserted, batches };
  }

  /**
   * READ-ONLY parity report comparing legacy RAC_KloelMemory coverage against
   * the canonical RAC_MindMemory(namespace='default') store — the gate an
   * operator checks BEFORE flipping KLOEL_MINDMEMORY_READ_CANONICAL. Never writes.
   */
  public async parity(
    scope: { readonly workspaceId?: string } = {},
  ): Promise<MindMemoryParityResult> {
    const where = scope.workspaceId !== undefined ? { workspaceId: scope.workspaceId } : {};
    const [legacy, mirrored] = await Promise.all([
      this.prisma.kloelMemory.count({ where }),
      this.prisma.mindMemory.count({ where: { ...where, namespace: 'default' } }),
    ]);
    const missing = Math.max(0, legacy - mirrored);
    const coverage = legacy === 0 ? 1 : mirrored / legacy;
    return { legacy, mirrored, missing, coverage };
  }
}
