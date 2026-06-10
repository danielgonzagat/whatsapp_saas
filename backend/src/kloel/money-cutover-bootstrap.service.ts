import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { WalletAnticipationBackfillService } from './wallet-anticipation-backfill.service';
import { LedgerBalanceAfterBackfillService } from './ledger-balance-after-backfill.service';
import {
  isAnticipationCentsBackfillEnabled,
  isLedgerBalanceBackfillEnabled,
} from './wallet.anticipation-cents-backfill.flag';

/**
 * Money Float→cents cutover trigger — the in-environment runner for the
 * money-ledgers Stage 5/8 backfills, so the cutover is executable without a
 * direct prod-DB connection. Twin of {@link MindCutoverBootstrapService}.
 *
 * On application bootstrap, if a backfill flag is ON it runs that backfill ONCE,
 * DETACHED (never blocks boot / readiness) and FULLY GUARDED (any error is
 * logged, never crashes the app), then logs the resulting parity coverage so an
 * operator can decide when to flip the reader cut-over
 * (KLOEL_ANTICIPATION_CENTS_READ). Both backfills are idempotent (NULL-only
 * filter + NULL-guarded updates), so a re-run on a later restart is a safe
 * no-op for already-filled rows — the operator turns the flag OFF after the run.
 *
 * Flags (default OFF):
 *   - KLOEL_ANTICIPATION_CENTS_BACKFILL → WalletAnticipation Float→cents.
 *   - KLOEL_LEDGER_BALANCE_BACKFILL     → KloelWalletLedger balanceAfter replay.
 *
 * Nothing runs when both flags are OFF (silent no-op at boot).
 */
@Injectable()
export class MoneyCutoverBootstrapService implements OnApplicationBootstrap {
  private readonly logger = StructuredLogger.from(MoneyCutoverBootstrapService.name);

  public constructor(
    private readonly anticipationBackfill: WalletAnticipationBackfillService,
    private readonly ledgerBalanceBackfill: LedgerBalanceAfterBackfillService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!isAnticipationCentsBackfillEnabled() && !isLedgerBalanceBackfillEnabled()) {
      return;
    }
    // Detached: do not block boot. The whole body is guarded.
    void this.run();
  }

  private async run(): Promise<void> {
    if (isAnticipationCentsBackfillEnabled()) {
      try {
        const r = await this.anticipationBackfill.backfill();
        const p = await this.anticipationBackfill.parity();
        this.logger.log({
          operation: 'money.cutover.anticipation_backfill',
          status: 'ok',
          scanned: r.scanned,
          updated: r.updated,
          skipped: r.skipped,
          batches: r.batches,
          parityRows: p.rows,
          parityMatched: p.matched,
          parityMismatched: p.mismatched,
          parityCoverage: Number(p.coverage.toFixed(4)),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `money.cutover.anticipation_backfill failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (isLedgerBalanceBackfillEnabled()) {
      try {
        const r = await this.ledgerBalanceBackfill.backfill();
        const p = await this.ledgerBalanceBackfill.parity();
        this.logger.log({
          operation: 'money.cutover.ledger_balance_backfill',
          status: 'ok',
          wallets: r.wallets,
          scanned: r.scanned,
          updated: r.updated,
          batches: r.batches,
          parityRows: p.rows,
          parityMatched: p.matched,
          parityMismatched: p.mismatched,
          parityCoverage: Number(p.coverage.toFixed(4)),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `money.cutover.ledger_balance_backfill failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
