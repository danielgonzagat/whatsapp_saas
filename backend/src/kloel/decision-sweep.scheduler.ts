/**
 * ADDITIVE, flag-gated runnable surface for the chat_reply TIMEOUT-LOSS learner.
 *
 * Wires the EXISTING `DecisionOutcomeService.sweepExpired` method — which had
 * NO non-spec caller in production — into a NestJS `@Cron` so the timeout-loss
 * learning loop is actually reachable WITHOUT touching the live chat/decision
 * path.
 *
 * ## Why this is safe (flag-gated, fail-open, behaviour-preserving)
 *
 *   - Gated by `KLOEL_DECISION_SWEEP_ENABLED` (default OFF). When the flag is
 *     OFF the @Cron is a pure early-return no-op: NO enumeration query, NO
 *     sweep, NO bandit write — byte-for-byte equivalent to today. The decision
 *     recording/closing logic in `DecisionOutcomeService` is UNCHANGED in both
 *     states; this only supplies the missing periodic caller.
 *
 *   - `DecisionOutcomeService.sweepExpired` is the timeout-loss learner: for
 *     every open `RAC_DecisionOutcome` row older than the window it records
 *     `outcome=0` (LOSS, `inbound.silent_24h`) and feeds that to the contextual
 *     bandit. `sweepExpired`'s `updateMany` only fills rows whose `outcomeAt`
 *     is still null, so a decision is swept at most once even across overlapping
 *     passes (idempotent).
 *
 *   - "Active workspaces" are derived cheaply from the set of workspaces that
 *     actually have at least one OPEN decision (`outcomeAt: null`), via a
 *     `distinct` read. No global scan; no per-workspace cost for workspaces with
 *     nothing to sweep.
 *
 *   - Every pass is wrapped so a failure can never crash the scheduler or any
 *     other job (fail-open): errors are logged + routed to the optional
 *     `OpsAlertService` and swallowed.
 *
 * @see backend/src/kloel/decision-sweep.flag.ts
 * @see backend/src/kloel/decision-outcome.service.ts
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { DecisionOutcomeService } from './decision-outcome.service';
import { isDecisionSweepEnabled, DECISION_SWEEP_MAX_AGE_HOURS } from './decision-sweep.flag';

/** Aggregate outcome of one full scheduler pass across active workspaces. */
export interface DecisionSweepSummary {
  /** True when the flag was OFF and the pass was a no-op (nothing enumerated). */
  skipped: boolean;
  scannedWorkspaces: number;
  /** Total decisions recorded as timeout-losses across all workspaces. */
  sweptCount: number;
  /** Per-workspace swept counts, only for workspaces that swept ≥1 decision. */
  byWorkspace: Array<{ workspaceId: string; swept: number }>;
}

/** Narrow read surface the scheduler needs to enumerate workspaces with open decisions. */
type OpenDecisionWorkspaceReader = {
  decisionOutcome: {
    findMany: (args: unknown) => Promise<Array<{ workspaceId: string }>>;
  };
};

@Injectable()
export class DecisionSweepScheduler {
  private readonly logger = new Logger(DecisionSweepScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionOutcome: DecisionOutcomeService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /**
   * Hourly timeout-loss sweep. Flag-gated (default OFF) + fail-open.
   *
   * When `KLOEL_DECISION_SWEEP_ENABLED` is not `'true'` this returns immediately
   * — no query, no sweep. Any error is logged, routed to the optional ops-alert
   * sink, and swallowed (never re-thrown) so it can't crash the scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runDecisionSweepCron(): Promise<void> {
    if (!isDecisionSweepEnabled()) {
      return;
    }
    try {
      const summary = await this.sweepActiveWorkspaces();
      if (summary.sweptCount > 0) {
        this.logger.warn(
          `decision_timeout_loss_swept: ${JSON.stringify({
            scannedWorkspaces: summary.scannedWorkspaces,
            sweptCount: summary.sweptCount,
            byWorkspace: summary.byWorkspace,
          })}`,
        );
      } else {
        this.logger.log(
          `decision_sweep_clean: ${JSON.stringify({
            scannedWorkspaces: summary.scannedWorkspaces,
          })}`,
        );
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'DecisionSweepScheduler.runDecisionSweepCron',
      );
      this.logger.error(
        `decision_sweep_cron_failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Enumerate workspaces with at least one OPEN decision and run the existing
   * `DecisionOutcomeService.sweepExpired` for each, accumulating a structured
   * summary.
   *
   * Flag-gated: when the flag is OFF this is a no-op that enumerates nothing
   * (returns `skipped: true`). Public + returns the summary so an admin endpoint
   * or operator shell can drive an on-demand sweep.
   */
  async sweepActiveWorkspaces(
    maxAgeHours: number = DECISION_SWEEP_MAX_AGE_HOURS,
  ): Promise<DecisionSweepSummary> {
    if (!isDecisionSweepEnabled()) {
      return { skipped: true, scannedWorkspaces: 0, sweptCount: 0, byWorkspace: [] };
    }

    const workspaceIds = await this.listOpenDecisionWorkspaceIds();

    let sweptCount = 0;
    const byWorkspace: Array<{ workspaceId: string; swept: number }> = [];

    for (const workspaceId of workspaceIds) {
      const swept = await this.decisionOutcome.sweepExpired(workspaceId, maxAgeHours);
      if (swept > 0) {
        sweptCount += swept;
        byWorkspace.push({ workspaceId, swept });
      }
    }

    return {
      skipped: false,
      scannedWorkspaces: workspaceIds.length,
      sweptCount,
      byWorkspace,
    };
  }

  /**
   * READ-ONLY: distinct workspace ids that have at least one OPEN decision
   * (`outcomeAt: null`). These are exactly the workspaces that can have a
   * timeout-loss to record.
   */
  private async listOpenDecisionWorkspaceIds(): Promise<string[]> {
    const reader = this.prisma as unknown as OpenDecisionWorkspaceReader;
    const rows = await reader.decisionOutcome.findMany({
      where: { outcomeAt: null },
      select: { workspaceId: true },
      distinct: ['workspaceId'],
      take: 5000,
    });
    return rows.map((row) => row.workspaceId).filter((id) => id.length > 0);
  }
}
