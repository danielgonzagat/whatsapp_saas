import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { isMindMessageBackfillEnabled } from './mindmessage-backfill.flag';

/**
 * Brain→Mind cutover, Phase 2 — historical backfill.
 *
 * The live dual-write (`mirrorMindMessage`, flag KLOEL_MINDMESSAGE_DUALWRITE)
 * only mirrors NEW messages into the canonical RAC_MindMessage table. Activating
 * the reader cut-over (KLOEL_MINDMESSAGE_READ_CANONICAL) without first backfilling
 * the historical RAC_KloelMessage rows would make the unified ledger lose all
 * pre-cutover history. This service copies that history idempotently.
 *
 * Safety:
 *   - READ-ONLY on RAC_KloelMessage; ADDITIVE-ONLY on RAC_MindMessage (no
 *     updates, no deletes).
 *   - IDEMPOTENT: each row is mirrored with `sourceId = <RAC_KloelMessage.id>`
 *     and `source = 'brain'`; the unique (workspaceId, source, sourceId) index +
 *     `createMany({ skipDuplicates })` make a re-run a no-op for already-copied
 *     rows. The original `createdAt` is preserved so post-cutover history orders
 *     correctly.
 *   - OVERLAP-SAFE: pass `before` = the timestamp the live dual-write was
 *     activated, so messages already mirrored live (sourceId = NULL) are not also
 *     backfilled (which would otherwise create a second, sourceId-keyed copy).
 *   - GATED: no-op unless KLOEL_MINDMESSAGE_BACKFILL='true' (a deliberate bulk
 *     operation, never run by accident).
 *   - CURSOR-PAGINATED: scales to large tables without loading everything.
 */
export interface MindMessageBackfillOptions {
  /** Only backfill legacy rows strictly older than this (the dual-write boundary). */
  readonly before: Date;
  /** Restrict to a single workspace (omit to backfill all). */
  readonly workspaceId?: string;
  /** Rows per batch (clamped to [1, 5000]). Default 500. */
  readonly batchSize?: number;
  /** Optional cap on total rows scanned this run (for staged/canary runs). */
  readonly limit?: number;
}

export interface MindMessageBackfillResult {
  readonly enabled: boolean;
  readonly scanned: number;
  readonly inserted: number;
  readonly batches: number;
}

export interface MindMessageParityResult {
  /** Legacy RAC_KloelMessage rows in scope. */
  readonly legacy: number;
  /** Backfilled RAC_MindMessage rows (source='brain', sourceId set) in scope. */
  readonly mirrored: number;
  /** legacy - mirrored — rows still missing from the canonical table. */
  readonly missing: number;
  /** mirrored / legacy in [0, 1] (1 when legacy is empty). */
  readonly coverage: number;
}

@Injectable()
export class MindMessageBackfillService {
  private readonly logger = StructuredLogger.from(MindMessageBackfillService.name);

  public constructor(private readonly prisma: PrismaService) {}

  /**
   * READ-ONLY parity report comparing legacy RAC_KloelMessage coverage against
   * the backfilled canonical rows — the gate an operator checks BEFORE flipping
   * the reader cut-over (KLOEL_MINDMESSAGE_READ_CANONICAL). Backfilled rows
   * preserve the legacy createdAt, so the same `before`/`workspaceId` scope
   * applies to both sides. Never writes.
   */
  public async parity(
    scope: {
      readonly before?: Date;
      readonly workspaceId?: string;
    } = {},
  ): Promise<MindMessageParityResult> {
    const legacyWhere = {
      ...(scope.before !== undefined ? { createdAt: { lt: scope.before } } : {}),
      ...(scope.workspaceId !== undefined ? { workspaceId: scope.workspaceId } : {}),
    };
    const [legacy, mirrored] = await Promise.all([
      this.prisma.kloelMessage.count({ where: legacyWhere }),
      this.prisma.mindMessage.count({
        where: { ...legacyWhere, source: 'brain', sourceId: { not: null } },
      }),
    ]);
    const missing = Math.max(0, legacy - mirrored);
    const coverage = legacy === 0 ? 1 : mirrored / legacy;
    return { legacy, mirrored, missing, coverage };
  }

  public async backfill(options: MindMessageBackfillOptions): Promise<MindMessageBackfillResult> {
    if (!isMindMessageBackfillEnabled()) {
      return { enabled: false, scanned: 0, inserted: 0, batches: 0 };
    }

    const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 5000);
    let scanned = 0;
    let inserted = 0;
    let batches = 0;
    let cursorId: string | undefined;

    for (;;) {
      const rows = await this.prisma.kloelMessage.findMany({
        where: {
          createdAt: { lt: options.before },
          ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursorId !== undefined ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          workspaceId: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      });

      if (rows.length === 0) {
        break;
      }
      scanned += rows.length;

      const created = await this.prisma.mindMessage.createMany({
        data: rows.map((r) => ({
          workspaceId: r.workspaceId,
          source: 'brain',
          role: r.role,
          content: r.content,
          sourceId: r.id,
          createdAt: r.createdAt,
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
      operation: 'mind.message_backfill.run',
      status: 'ok',
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      scanned,
      inserted,
      batches,
    });

    return { enabled: true, scanned, inserted, batches };
  }
}
