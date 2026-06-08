import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { MindMessageBackfillService } from './mind-message-backfill.service';
import { MindMemoryBackfillService } from './mind-memory-backfill.service';
import { isMindMessageBackfillEnabled } from './mindmessage-backfill.flag';
import { isMindMemoryBackfillEnabled } from './mindmemory-backfill.flag';

/**
 * Brain→Mind cutover trigger — the in-environment runner for the Phase-2
 * backfills, so the cutover is executable without a direct prod-DB connection.
 *
 * On application bootstrap, if a backfill flag is ON it runs that backfill ONCE,
 * DETACHED (never blocks boot / readiness) and FULLY GUARDED (any error is logged,
 * never crashes the app), then logs the resulting parity coverage so an operator
 * can decide when to flip the reader cut-over. Both backfills are idempotent
 * (skipDuplicates on a unique key), so a re-run on a later restart is a safe
 * no-op for already-copied rows — the operator turns the flag OFF after the run.
 *
 * Flags (default OFF): KLOEL_MINDMESSAGE_BACKFILL, KLOEL_MINDMEMORY_BACKFILL.
 * The message backfill needs the RAC_MindMessage.sourceId migration applied; if it
 * is not, the backfill throws and is caught+logged here (the memory backfill needs
 * no migration). Nothing runs when both flags are OFF.
 */
@Injectable()
export class MindCutoverBootstrapService implements OnApplicationBootstrap {
  private readonly logger = StructuredLogger.from(MindCutoverBootstrapService.name);

  public constructor(
    private readonly messageBackfill: MindMessageBackfillService,
    private readonly memoryBackfill: MindMemoryBackfillService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!isMindMessageBackfillEnabled() && !isMindMemoryBackfillEnabled()) {
      return;
    }
    // Detached: do not block boot. The whole body is guarded.
    void this.run();
  }

  private async run(): Promise<void> {
    if (isMindMemoryBackfillEnabled()) {
      try {
        const r = await this.memoryBackfill.backfill();
        const p = await this.memoryBackfill.parity();
        this.logger.log({
          operation: 'mind.cutover.memory_backfill',
          status: 'ok',
          scanned: r.scanned,
          inserted: r.inserted,
          batches: r.batches,
          parityLegacy: p.legacy,
          parityMirrored: p.mirrored,
          parityCoverage: Number(p.coverage.toFixed(4)),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `mind.cutover.memory_backfill failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (isMindMessageBackfillEnabled()) {
      try {
        const before = new Date();
        const r = await this.messageBackfill.backfill({ before });
        const p = await this.messageBackfill.parity({ before });
        this.logger.log({
          operation: 'mind.cutover.message_backfill',
          status: 'ok',
          scanned: r.scanned,
          inserted: r.inserted,
          batches: r.batches,
          parityLegacy: p.legacy,
          parityMirrored: p.mirrored,
          parityCoverage: Number(p.coverage.toFixed(4)),
        });
      } catch (err: unknown) {
        this.logger.warn(
          `mind.cutover.message_backfill failed (sourceId migration applied?): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
