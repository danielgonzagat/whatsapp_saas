import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  compareAnticipationRowParity,
  deriveAnticipationCents,
} from './wallet.anticipation.cents';
import { isAnticipationCentsBackfillEnabled } from './wallet.anticipation-cents-backfill.flag';

/**
 * WalletAnticipation Float→cents backfill (money-ledgers migration Stage 8).
 *
 * The live dual-write (KLOEL_ANTICIPATION_CENTS_DUALWRITE) only populates the
 * new `*InCents` columns on NEW anticipation rows. Activating the reader
 * cut-over (KLOEL_ANTICIPATION_CENTS_READ) without backfilling history would
 * make every pre-migration row read from a NULL cents column. This service
 * fills those columns idempotently from the persisted Float amounts.
 *
 * Safety (mirrors {@link MindMemoryBackfillService}):
 *   - GATED: no-op unless KLOEL_ANTICIPATION_CENTS_BACKFILL='true'.
 *   - ADDITIVE-ONLY: only rows whose cents columns are NULL are touched; the
 *     `where` filters to `originalAmountInCents: null`, so a re-run — AND any
 *     overlap with the live dual-write — is a no-op. NEVER updates a non-NULL
 *     cents column, NEVER touches the Float columns, NEVER deletes.
 *   - CHUNKED + RESUMABLE: cursor-paginated by `id`; a crashed run resumes by
 *     simply re-running (already-filled rows fall out of the NULL filter).
 *   - ROUNDING PARITY: cents are derived via the SAME canonical
 *     {@link deriveAnticipationCents} the dual-write uses, so a backfilled row
 *     and a dual-written row converge byte-for-byte.
 *
 * `parity()` is READ-ONLY and NOT gated — it can always run as the cut-over gate.
 */
export interface AnticipationBackfillOptions {
  /** Restrict to a single workspace (omit to backfill all). */
  readonly workspaceId?: string;
  /** Rows per batch (clamped to [1, 5000]). Default 500. */
  readonly batchSize?: number;
  /** Optional cap on total rows scanned this run (for staged/canary runs). */
  readonly limit?: number;
}

export interface AnticipationBackfillResult {
  readonly enabled: boolean;
  readonly scanned: number;
  readonly updated: number;
  readonly skipped: number;
  readonly batches: number;
}

export interface AnticipationParityResult {
  readonly rows: number;
  readonly matched: number;
  readonly mismatched: number;
  /** Fraction of rows with all-three cents columns present AND matching. */
  readonly coverage: number;
}

@Injectable()
export class WalletAnticipationBackfillService {
  private readonly logger = StructuredLogger.from(WalletAnticipationBackfillService.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async backfill(
    options: AnticipationBackfillOptions = {},
  ): Promise<AnticipationBackfillResult> {
    if (!isAnticipationCentsBackfillEnabled()) {
      return { enabled: false, scanned: 0, updated: 0, skipped: 0, batches: 0 };
    }

    const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 5000);
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let batches = 0;
    let cursorId: string | undefined;

    for (;;) {
      const rows = await this.prisma.walletAnticipation.findMany({
        where: {
          // Only un-backfilled rows. A row that already has cents set (by the
          // dual-write or a prior backfill run) is excluded — idempotent.
          originalAmountInCents: null,
          ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursorId !== undefined ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          originalAmount: true,
          feeAmount: true,
          netAmount: true,
        },
      });

      if (rows.length === 0) {
        break;
      }
      scanned += rows.length;
      cursorId = rows[rows.length - 1]?.id;

      for (const row of rows) {
        let cents;
        try {
          cents = deriveAnticipationCents(row);
        } catch (err: unknown) {
          // A garbage/NaN Float amount cannot be converted. Skip it (leave the
          // cents columns NULL) rather than poisoning the run — an operator
          // inspects skipped rows out of band. Never throws past this point.
          skipped += 1;
          this.logger.warn(
            `wallet.anticipation_backfill skip row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
        // Re-assert the NULL guard inside the update `where` so a concurrent
        // dual-write that filled this row between the read and the write does
        // NOT get overwritten (updateMany count === 0 → already filled).
        const res = await this.prisma.walletAnticipation.updateMany({
          where: { id: row.id, originalAmountInCents: null },
          data: {
            originalAmountInCents: cents.originalAmountInCents,
            feeAmountInCents: cents.feeAmountInCents,
            netAmountInCents: cents.netAmountInCents,
          },
        });
        if (res.count > 0) {
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      batches += 1;

      if (options.limit !== undefined && scanned >= options.limit) {
        break;
      }
    }

    this.logger.log({
      operation: 'wallet.anticipation_backfill.run',
      status: 'ok',
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      scanned,
      updated,
      skipped,
      batches,
    });

    return { enabled: true, scanned, updated, skipped, batches };
  }

  /**
   * READ-ONLY parity report comparing recomputed `Float*100` cents against the
   * stored `*InCents` columns — the gate an operator checks BEFORE flipping
   * KLOEL_ANTICIPATION_CENTS_READ. Never writes. Cursor-paginated so it scales.
   */
  public async parity(
    scope: { readonly workspaceId?: string; readonly batchSize?: number } = {},
  ): Promise<AnticipationParityResult> {
    const batchSize = Math.min(Math.max(scope.batchSize ?? 1000, 1), 5000);
    let rows = 0;
    let matched = 0;
    let mismatched = 0;
    let cursorId: string | undefined;

    for (;;) {
      const batch = await this.prisma.walletAnticipation.findMany({
        where: {
          ...(scope.workspaceId !== undefined ? { workspaceId: scope.workspaceId } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursorId !== undefined ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          originalAmount: true,
          feeAmount: true,
          netAmount: true,
          originalAmountInCents: true,
          feeAmountInCents: true,
          netAmountInCents: true,
        },
      });
      if (batch.length === 0) {
        break;
      }
      cursorId = batch[batch.length - 1]?.id;
      for (const row of batch) {
        rows += 1;
        const verdict = compareAnticipationRowParity(row);
        if (verdict.matched) {
          matched += 1;
        } else {
          // Uncovered (NULL cents) OR covered-but-divergent both count as not
          // matched — the cut-over gate must see coverage===1 to flip safely.
          mismatched += 1;
        }
      }
    }

    const coverage = rows === 0 ? 1 : matched / rows;
    return { rows, matched, mismatched, coverage };
  }
}
