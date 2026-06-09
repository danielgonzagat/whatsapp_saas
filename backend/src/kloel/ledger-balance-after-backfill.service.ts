import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeBalanceAfter,
  replayBalanceAfter,
  type LedgerDirection,
  type LedgerReplayEntry,
} from '../common/shared-ledger.port';
import { isLedgerBalanceBackfillEnabled } from './wallet.anticipation-cents-backfill.flag';

/**
 * KloelWalletLedger `balanceAfter*Cents` historical backfill (money-ledgers
 * migration Stage 5, seller tranche).
 *
 * The live snapshot dual-write (KLOEL_LEDGER_BALANCE_SNAPSHOT) only records the
 * post-mutation bucket snapshot on NEW ledger rows. This service reconstructs
 * those snapshots for historical rows by CUMULATIVELY REPLAYING each wallet's
 * entries in `createdAt` (then `id`) order via the pure {@link replayBalanceAfter}
 * helper — the same `computeBalanceAfter` algebra the dual-write uses.
 *
 * Safety:
 *   - GATED: no-op unless KLOEL_LEDGER_BALANCE_BACKFILL='true'.
 *   - ADDITIVE-ONLY: only rows whose `balanceAfterAvailableCents` is NULL are
 *     UPDATEd; the replay still folds OVER all entries (so the running balance
 *     is correct) but writes only to the NULL rows. NEVER overwrites a non-NULL
 *     snapshot, NEVER deletes, NEVER mutates the wallet balance.
 *   - RESUMABLE: walletId-cursor paginated; a re-run re-folds each wallet and
 *     skips already-filled rows (updateMany NULL guard), so it is idempotent.
 *   - PER-WALLET ATOMIC FOLD: a wallet's full ledger is read in chronological
 *     order so the replay is exact regardless of batch boundaries.
 *
 * `parity()` is READ-ONLY and NOT gated.
 */
export interface LedgerBalanceBackfillOptions {
  readonly workspaceId?: string;
  /** Wallets per batch (clamped to [1, 2000]). Default 200. */
  readonly walletBatchSize?: number;
  /** Optional cap on total wallets processed this run. */
  readonly limit?: number;
}

export interface LedgerBalanceBackfillResult {
  readonly enabled: boolean;
  readonly wallets: number;
  readonly scanned: number;
  readonly updated: number;
  readonly batches: number;
}

export interface LedgerBalanceParityResult {
  readonly rows: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly coverage: number;
}

const WALLET_BUCKETS = ['available', 'pending', 'blocked'] as const;
type WalletBucket = (typeof WALLET_BUCKETS)[number];

@Injectable()
export class LedgerBalanceAfterBackfillService {
  private readonly logger = StructuredLogger.from(LedgerBalanceAfterBackfillService.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async backfill(
    options: LedgerBalanceBackfillOptions = {},
  ): Promise<LedgerBalanceBackfillResult> {
    if (!isLedgerBalanceBackfillEnabled()) {
      return { enabled: false, wallets: 0, scanned: 0, updated: 0, batches: 0 };
    }

    const walletBatchSize = Math.min(Math.max(options.walletBatchSize ?? 200, 1), 2000);
    let wallets = 0;
    let scanned = 0;
    let updated = 0;
    let batches = 0;
    let cursorWalletId: string | undefined;

    for (;;) {
      // Page through DISTINCT walletIds so each wallet's full ledger is folded
      // in one pass regardless of how many entries it has. Prisma `distinct` +
      // `cursor` on a non-unique column is unsupported, so resume with a
      // `walletId > cursor` keyset filter instead of a cursor object.
      const pageWallets = await this.prisma.kloelWalletLedger.findMany({
        where: {
          ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
          ...(cursorWalletId !== undefined ? { walletId: { gt: cursorWalletId } } : {}),
        },
        distinct: ['walletId'],
        orderBy: { walletId: 'asc' },
        take: walletBatchSize,
        select: { walletId: true },
      });

      if (pageWallets.length === 0) {
        break;
      }

      for (const { walletId } of pageWallets) {
        wallets += 1;
        const entries = await this.prisma.kloelWalletLedger.findMany({
          where: { walletId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            bucket: true,
            direction: true,
            amountInCents: true,
            balanceAfterAvailableCents: true,
          },
        });
        scanned += entries.length;

        const replayInput: Array<LedgerReplayEntry<WalletBucket>> = entries.map((e) => ({
          bucket: this.normalizeBucket(e.bucket),
          direction: e.direction as LedgerDirection,
          amountInCents: e.amountInCents,
        }));
        const snapshots = replayBalanceAfter(replayInput, WALLET_BUCKETS);

        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          const snap = snapshots[i];
          if (entry === undefined || snap === undefined) {
            continue;
          }
          // Only fill rows that are currently NULL (additive). The NULL guard in
          // the `where` makes a concurrent dual-write / re-run a no-op.
          if (entry.balanceAfterAvailableCents !== null) {
            continue;
          }
          const res = await this.prisma.kloelWalletLedger.updateMany({
            where: { id: entry.id, balanceAfterAvailableCents: null },
            data: {
              balanceAfterAvailableCents: snap.available,
              balanceAfterPendingCents: snap.pending,
              balanceAfterBlockedCents: snap.blocked,
            },
          });
          updated += res.count;
        }

        cursorWalletId = walletId;
      }

      batches += 1;
      if (options.limit !== undefined && wallets >= options.limit) {
        break;
      }
    }

    this.logger.log({
      operation: 'wallet.ledger_balance_backfill.run',
      status: 'ok',
      ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
      wallets,
      scanned,
      updated,
      batches,
    });

    return { enabled: true, wallets, scanned, updated, batches };
  }

  /**
   * READ-ONLY parity comparing each historical row's recomputed `balanceAfter`
   * (from the cumulative replay) against the stored snapshot. Rows whose stored
   * snapshot is NULL count as not-matched (un-backfilled). Never writes.
   */
  public async parity(
    scope: { readonly workspaceId?: string } = {},
  ): Promise<LedgerBalanceParityResult> {
    const walletRows = await this.prisma.kloelWalletLedger.findMany({
      where: {
        ...(scope.workspaceId !== undefined ? { workspaceId: scope.workspaceId } : {}),
      },
      distinct: ['walletId'],
      orderBy: { walletId: 'asc' },
      select: { walletId: true },
    });

    let rows = 0;
    let matched = 0;
    let mismatched = 0;

    for (const { walletId } of walletRows) {
      const entries = await this.prisma.kloelWalletLedger.findMany({
        where: { walletId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          bucket: true,
          direction: true,
          amountInCents: true,
          balanceAfterAvailableCents: true,
          balanceAfterPendingCents: true,
          balanceAfterBlockedCents: true,
        },
      });

      const replayInput: Array<LedgerReplayEntry<WalletBucket>> = entries.map((e) => ({
        bucket: this.normalizeBucket(e.bucket),
        direction: e.direction as LedgerDirection,
        amountInCents: e.amountInCents,
      }));
      const snapshots = replayBalanceAfter(replayInput, WALLET_BUCKETS);

      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const snap = snapshots[i];
        if (entry === undefined || snap === undefined) {
          continue;
        }
        rows += 1;
        const covered =
          entry.balanceAfterAvailableCents !== null &&
          entry.balanceAfterPendingCents !== null &&
          entry.balanceAfterBlockedCents !== null;
        if (
          covered &&
          entry.balanceAfterAvailableCents === snap.available &&
          entry.balanceAfterPendingCents === snap.pending &&
          entry.balanceAfterBlockedCents === snap.blocked
        ) {
          matched += 1;
        } else {
          mismatched += 1;
        }
      }
    }

    const coverage = rows === 0 ? 1 : matched / rows;
    return { rows, matched, mismatched, coverage };
  }

  /**
   * Map a stored bucket string to the typed union. The seller ledger stores
   * lowercase 'available'|'pending'|'blocked'; an unrecognized value would
   * corrupt the replay, so it throws rather than silently mis-bucketing.
   */
  private normalizeBucket(bucket: string): WalletBucket {
    if (bucket === 'available' || bucket === 'pending' || bucket === 'blocked') {
      return bucket;
    }
    throw new RangeError(`ledger_balance_backfill: unknown wallet bucket '${bucket}'`);
  }
}

// Re-exported for spec-level direct use of the algebra.
export { computeBalanceAfter };
