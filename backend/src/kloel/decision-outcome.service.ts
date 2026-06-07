import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { isDecisionLedgerDualWriteEnabled } from './decision-ledger-dualwrite.flag';
import {
  mirrorDecisionToMindPolicy,
  resolveMirroredMindPolicy,
} from './decision-ledger-dualwrite.helpers';

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface RecordDecisionInput {
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  baselineAction?: string;
  outcomeKey: string;
  expectedWindow: number;
  contextSnapshot: Record<string, unknown>;
}

export interface CloseOutcomeInput {
  outcomeKey: string;
  outcomeName: string;
  outcomeValue?: Record<string, unknown>;
  economicValue?: number;
  wonVsBaseline?: boolean;
}

@Injectable()
export class DecisionOutcomeService {
  private readonly logger = StructuredLogger.from(DecisionOutcomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mindBandit?: MindBanditService,
  ) {}

  async recordDecision(input: RecordDecisionInput) {
    await this.prisma.decisionOutcome.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        chosenAction: input.chosenAction,
        baselineAction: input.baselineAction ?? null,
        outcomeKey: input.outcomeKey,
        expectedWindow: input.expectedWindow,
        contextSnapshot: inputJson(input.contextSnapshot),
      },
    });

    // ADDITIVE, flag-gated, best-effort dual-write to the parallel
    // `RAC_MindPolicy` ledger (P1-B prep). Behind
    // `KLOEL_DECISION_LEDGER_DUALWRITE` (default OFF). Any failure here is
    // swallowed with a warn-log so it can NEVER break the canonical
    // `RAC_DecisionOutcome` create above. No read path depends on this; no
    // backfill is performed.
    if (isDecisionLedgerDualWriteEnabled()) {
      try {
        await mirrorDecisionToMindPolicy(this.prisma, {
          workspaceId: input.workspaceId,
          decisionType: input.decisionType,
          chosenAction: input.chosenAction,
          baselineAction: input.baselineAction ?? null,
          outcomeKey: input.outcomeKey,
          contextSnapshot: input.contextSnapshot,
        });
      } catch (err: unknown) {
        this.logger.warn('Failed to mirror decision into MindPolicy ledger', {
          outcomeKey: input.outcomeKey,
          decisionType: input.decisionType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Close the bandit loop: idempotently register the arms of this decision
    // (the chosen action + its baseline, e.g. 'engage'/'silence' for
    // 'chat_reply') so the matching mindBanditArm rows exist before
    // closeOutcome later calls recordOutcome. register() upserts, so this is
    // safe to call on every decision. Fire-and-forget — a learning-side
    // failure must never break the decision-recording path.
    if (this.mindBandit) {
      const arms = Array.from(
        new Set([input.chosenAction, input.baselineAction].filter((a): a is string => !!a)),
      );
      if (arms.length > 0) {
        this.mindBandit
          .register({
            workspaceId: input.workspaceId,
            decisionType: input.decisionType,
            arms,
            context: input.contextSnapshot,
          })
          .catch((err: unknown) => {
            this.logger.warn('Failed to register bandit arms from recordDecision', {
              outcomeKey: input.outcomeKey,
              decisionType: input.decisionType,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
    }
  }

  async closeOutcome(input: CloseOutcomeInput) {
    const result = await this.prisma.decisionOutcome.updateMany({
      where: { outcomeKey: input.outcomeKey, workspaceId: { not: '' }, outcomeAt: null },
      data: {
        outcomeAt: new Date(),
        outcomeName: input.outcomeName,
        ...(input.outcomeValue ? { outcomeValue: inputJson(input.outcomeValue) } : {}),
        economicValue: input.economicValue ?? null,
        wonVsBaseline: input.wonVsBaseline ?? null,
      },
    });

    if (result.count > 0) {
      const closed = await this.prisma.decisionOutcome.findFirst({
        where: { outcomeKey: input.outcomeKey, workspaceId: { not: '' } },
        orderBy: { outcomeAt: 'desc' },
        select: {
          contextSnapshot: true,
          decisionType: true,
          chosenAction: true,
          workspaceId: true,
        },
      });

      if (closed && this.mindBandit) {
        // Append-only learning signal: feed the closed outcome's win/loss back
        // into the contextual bandit arm so Kloel learns from chat outcomes.
        // Fire-and-forget — a learning failure must never break the decision path.
        try {
          await this.mindBandit.recordOutcome({
            workspaceId: closed.workspaceId,
            decisionType: closed.decisionType,
            arm: closed.chosenAction,
            outcome: input.wonVsBaseline ? 1 : 0,
          });
        } catch (err: unknown) {
          this.logger.warn('Failed to record bandit outcome from closeOutcome', {
            outcomeKey: input.outcomeKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ADDITIVE, flag-gated, best-effort dual-write resolution of the mirrored
      // `RAC_MindPolicy` row(s) for this outcomeKey (P1-B prep). Behind
      // `KLOEL_DECISION_LEDGER_DUALWRITE` (default OFF). Any failure is
      // swallowed with a warn-log so it can NEVER break the canonical
      // `RAC_DecisionOutcome` close above. Reuses the already-fetched `closed`
      // row's workspaceId; no extra read on the user-facing path when OFF.
      if (closed && isDecisionLedgerDualWriteEnabled()) {
        try {
          await resolveMirroredMindPolicy(this.prisma, {
            workspaceId: closed.workspaceId,
            outcomeKey: input.outcomeKey,
            outcome: input.wonVsBaseline ? 1 : 0,
          });
        } catch (err: unknown) {
          this.logger.warn('Failed to resolve mirrored MindPolicy outcome', {
            outcomeKey: input.outcomeKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  async findOpenByWorkspace(workspaceId: string) {
    return this.prisma.decisionOutcome.findMany({
      where: { workspaceId, outcomeAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findClosedByDecisionType(workspaceId: string, decisionType: string, since: Date) {
    return this.prisma.decisionOutcome.findMany({
      where: {
        workspaceId,
        decisionType,
        outcomeAt: { not: null, gte: since },
      },
      orderBy: { outcomeAt: 'desc' },
    });
  }

  // @CrossWorkspaceAnalytics — used by MindLiftReportService to aggregate
  // lift across all workspaces. Not a workspace-scoped endpoint.
  async findAllClosedSince(since: Date) {
    return this.prisma.decisionOutcome.findMany({
      where: { workspaceId: { not: '' }, outcomeAt: { not: null, gte: since } },
      orderBy: { outcomeAt: 'desc' },
    });
  }

  async findAllClosedSinceForWorkspace(workspaceId: string, since: Date) {
    return this.prisma.decisionOutcome.findMany({
      where: { workspaceId, outcomeAt: { not: null, gte: since } },
      orderBy: { outcomeAt: 'desc' },
    });
  }

  async recordEvent(input: {
    workspaceId: string;
    eventType: string;
    eventKey: string;
    correlation?: Record<string, unknown>;
  }) {
    await this.prisma.decisionOutcomeEvent.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        eventType: input.eventType,
        eventKey: input.eventKey,
        ...(input.correlation ? { correlation: inputJson(input.correlation) } : {}),
      },
    });
  }

  async sweepExpired(workspaceId: string, maxAgeHours: number) {
    const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000);

    const expired = await this.prisma.decisionOutcome.findMany({
      where: {
        workspaceId,
        outcomeAt: null,
        createdAt: { lt: cutoff },
      },
      select: { id: true, outcomeKey: true, decisionType: true, chosenAction: true },
    });

    if (expired.length > 0) {
      const outcomeKeys = expired.map((e) => e.outcomeKey);
      await this.prisma.decisionOutcome.updateMany({
        where: { id: { in: expired.map((e) => e.id) }, workspaceId },
        data: {
          outcomeAt: new Date(),
          outcomeName: 'inbound.silent_24h',
          wonVsBaseline: false,
          outcomeValue: inputJson({
            reason: 'expired_without_reply',
            maxAgeHours,
            outcomeKeys,
          }),
        },
      });
      // Symmetric learning: an expired (silent-24h) decision is a LOSS for the
      // chosen arm. Feed it to the bandit so it learns from timeouts, not only
      // from closeOutcome successes (this raw updateMany previously skipped the
      // bandit, leaking the negative learning signal). Best-effort + fail-open.
      if (this.mindBandit) {
        for (const e of expired) {
          try {
            await this.mindBandit.recordOutcome({
              workspaceId,
              decisionType: e.decisionType,
              arm: e.chosenAction,
              outcome: 0,
            });
          } catch (err: unknown) {
            this.logger.warn('Failed to record bandit outcome from sweepExpired', {
              outcomeKey: e.outcomeKey,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    return expired.length;
  }

  /**
   * WON — conversation continued: close every still-OPEN `chat_reply` decision
   * for a workspace as a real WIN. Mirrors `sweepExpired`'s structure (an
   * `updateMany` over the OPEN rows + a symmetric per-row bandit feed) but with
   * the WIN polarity: a new inbound message arriving for this workspace IS the
   * observed consequence that the prior reply kept the conversation alive.
   *
   * Only the deferred-reward chat_reply rows are touched; commerce-link / sweep
   * decisions are not in scope here (different `decisionType`), so this composes
   * cleanly with the commerce-win and timeout-loss paths instead of duplicating
   * them. Idempotent: the `outcomeAt: null` filter means a row is closed at most
   * once. Best-effort + fail-open per bandit row, matching `sweepExpired`.
   *
   * Returns the number of decisions closed.
   */
  async closeOpenChatReplies(
    workspaceId: string,
    opts: { outcomeName: string; wonVsBaseline: boolean },
  ): Promise<number> {
    const open = await this.prisma.decisionOutcome.findMany({
      where: {
        workspaceId,
        decisionType: 'chat_reply',
        outcomeAt: null,
      },
      select: { id: true, outcomeKey: true, decisionType: true, chosenAction: true },
    });

    if (open.length === 0) {
      return 0;
    }

    const outcomeKeys = open.map((o) => o.outcomeKey);
    await this.prisma.decisionOutcome.updateMany({
      where: { id: { in: open.map((o) => o.id) }, workspaceId },
      data: {
        outcomeAt: new Date(),
        outcomeName: opts.outcomeName,
        wonVsBaseline: opts.wonVsBaseline,
        outcomeValue: inputJson({
          reason: 'conversation_continued',
          outcomeKeys,
        }),
      },
    });

    if (this.mindBandit) {
      const reward = opts.wonVsBaseline ? 1 : 0;
      for (const o of open) {
        try {
          await this.mindBandit.recordOutcome({
            workspaceId,
            decisionType: o.decisionType,
            arm: o.chosenAction,
            outcome: reward,
          });
        } catch (err: unknown) {
          this.logger.warn('Failed to record bandit outcome from closeOpenChatReplies', {
            outcomeKey: o.outcomeKey,
            error: err instanceof Error ? err.message : 'unknown error',
          });
        }
      }
    }

    return open.length;
  }
}
