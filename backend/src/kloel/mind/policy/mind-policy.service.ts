import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WisdomRelevanceFilter } from '../../wisdom/wisdom-relevance-filter.service';
import { WisdomPatternStore } from '../../wisdom/wisdom-pattern-store.service';
import { MindBeliefService } from '../inference/mind-belief.service';
import { extractChannel } from '../inference/mind-belief-by-channel';
import type { MindBelief, MindPolicyDecision } from '../../mind.types';
import {
  buildFallbackDecision,
  buildPolicyArtifacts,
  type MindPolicyHarnessResult,
  type MindPolicyInput,
  resolveBaselineAction,
  shouldUseBaselineFallback,
  summarizePolicyHarness,
} from './mind-policy-calculation';
import {
  buildResolveOutcomeUpdateData,
  createPolicyRow,
  persistResolvedPolicyMemories,
  recordOutcomeGlobalPrior,
  RESOLUTION_ROW_SELECT,
} from './mind-policy.helpers';
import { applyWisdomPriors } from './mind-policy.wisdom-prior.helpers';
import {
  buildBeliefMeanSummaries,
  classifyAutopilotConfirmation,
  computeGlobalPriorMix,
  shouldSkipGlobalPriorMix,
} from './mind-policy.global-prior.helpers';
import {
  assembleChooseDecision,
  buildBaselineActionInput,
  buildConfirmWindowCutoff,
  buildHarnessSince,
  buildMixedBeliefDefault,
  buildMixedBeliefMixed,
  buildSweepCutoff,
  extractChooseDefaults,
  isPrismaUniqueConstraintError,
  type MixedBeliefEntry,
  resolveConfirmWindowMinutes,
  toResolvedPolicyRows,
} from './mind-policy.service.helpers';
import { MindGlobalPriorService } from '../memory/mind-global-prior.service';

@Injectable()
export class MindPolicyService {
  private readonly logger = StructuredLogger.from(MindPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    @Optional() private readonly globalPrior?: MindGlobalPriorService,
    @Optional() private readonly wisdomFilter?: WisdomRelevanceFilter,
    @Optional() private readonly wisdomStore?: WisdomPatternStore,
  ) {
    this.logger.debug?.(`MindPolicyService initialized`);
  }

  async choose(input: MindPolicyInput): Promise<{ chosen: string; decision: MindPolicyDecision }> {
    const { utilitySuccess, utilityFail, epsilon, minSamples } = extractChooseDefaults(input);

    const harnessResult = await this.harness(input.workspaceId, input.decisionType, 14);

    if (shouldUseBaselineFallback(harnessResult, minSamples)) {
      const baselineAction = resolveBaselineAction(input);
      const fallbackDecision = buildFallbackDecision({
        baselineAction,
        epsilon,
        harnessResult,
        policy: input,
        utilityFail,
        utilitySuccess,
      });

      await this.persist(fallbackDecision);
      return { chosen: baselineAction, decision: fallbackDecision };
    }

    const channel = input.channel ?? extractChannel(input.context);
    let workspaceOptedOut = false;
    if (channel) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { globalPriorOptOut: true },
      });
      workspaceOptedOut = workspace?.globalPriorOptOut ?? false;
    }

    const rawBeliefs = await Promise.all(
      input.options.map((option) =>
        this.beliefs.getOrInit(input.workspaceId, input.subject, option.predicate, option.context),
      ),
    );

    const mixedBeliefs = await this.mixWithGlobalPrior({
      beliefs: rawBeliefs,
      channel,
      decisionType: input.decisionType,
      inputOptions: input.options,
      workspaceOptedOut,
    });

    // Wisdom prior pass — cross-workspace patterns as Beta priors (CIA Gap 9)
    const wisdomNudged = applyWisdomPriors({
      mixedBeliefs,
      channel,
      decisionType: input.decisionType,
      inputOptions: input.options,
      workspaceId: input.workspaceId,
      ...(this.wisdomFilter !== undefined ? { wisdomFilter: this.wisdomFilter } : {}),
      ...(this.wisdomStore !== undefined ? { wisdomStore: this.wisdomStore } : {}),
      logger: this.logger,
    });

    const {
      summaries: beliefs,
      usedGlobalPrior,
      maxPriorWeight,
    } = buildBeliefMeanSummaries(wisdomNudged);

    const artifacts = buildPolicyArtifacts({
      beliefs,
      epsilon,
      options: input.options,
      policy: input,
      utilityFail,
      utilitySuccess,
    });
    const fallbackAction = artifacts.candidates.at(-1)?.action;
    const baselineAction = resolveBaselineAction(buildBaselineActionInput(input, fallbackAction));
    const decision = assembleChooseDecision({
      artifacts,
      baselineAction,
      epsilon,
      policy: input,
      utilityFail,
      utilitySuccess,
      usedGlobalPrior,
      maxPriorWeight,
    });

    await this.persist(decision);
    return { chosen: decision.chosen, decision };
  }

  async resolveOutcome(
    workspaceId: string,
    outcomeKey: string,
    outcome: number,
    baselineOutcome?: number,
  ): Promise<void> {
    let resolutionRows: Array<{
      context: unknown;
      decisionType: string;
      chosen: string;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw /* raw justified: PostgreSQL advisory lock for outcome resolution */ `
        SELECT pg_advisory_xact_lock(hashtext(${`resolve:${workspaceId}:${outcomeKey}`}))
      `;
      const rows = await tx.mindPolicy.findMany({
        where: { outcomeKey, workspaceId, resolvedAt: null },
        select: RESOLUTION_ROW_SELECT,
      });

      if (rows.length === 0) {
        return;
      }

      const resolvedAt = new Date();
      let resolvedCount = 0;

      for (const row of rows) {
        const result = await tx.mindPolicy.updateMany({
          where: { id: row.id, workspaceId, resolvedAt: null },
          data: buildResolveOutcomeUpdateData(row, outcome, baselineOutcome, resolvedAt),
        });
        resolvedCount += result.count;
      }

      if (resolvedCount > 0) {
        resolutionRows = rows;

        await this.persistResolvedMemories(
          toResolvedPolicyRows(rows, outcome),
          baselineOutcome,
          tx,
        );
      }
    });

    // Gap 6: feed resolved outcomes back into the cross-workspace global prior.
    if (this.globalPrior && resolutionRows.length > 0) {
      await recordOutcomeGlobalPrior({
        globalPrior: this.globalPrior,
        rows: resolutionRows,
        outcome,
        logContext: { outcomeKey },
        logger: this.logger,
      });
    }
  }

  async resolveOpenForSubject(input: {
    baselineOutcome?: number;
    decisionType: string;
    outcome: number;
    subject: string;
    workspaceId: string;
  }): Promise<number> {
    const rows = await this.prisma.mindPolicy.findMany({
      where: {
        workspaceId: input.workspaceId,
        subject: input.subject,
        decisionType: input.decisionType,
        resolvedAt: null,
      },
      select: RESOLUTION_ROW_SELECT,
    });

    if (rows.length > 0) {
      await Promise.all(
        rows.map((row) =>
          this.prisma.mindPolicy.updateMany({
            where: { id: row.id, workspaceId: input.workspaceId, resolvedAt: null },
            data: buildResolveOutcomeUpdateData(row, input.outcome, input.baselineOutcome),
          }),
        ),
      );

      await this.persistResolvedMemories(
        toResolvedPolicyRows(rows, input.outcome),
        input.baselineOutcome,
      );
    }

    // Gap 6: feed resolved outcomes from this subject back into the
    // cross-workspace global prior.
    if (this.globalPrior) {
      await recordOutcomeGlobalPrior({
        globalPrior: this.globalPrior,
        rows,
        outcome: input.outcome,
        logContext: { subject: input.subject, decisionType: input.decisionType },
        logger: this.logger,
      });
    }

    return rows.length;
  }

  async sweepExpiredOutcomes(input: {
    decisionType: string;
    maxAgeHours: number;
    outcome: number;
    workspaceId: string;
  }): Promise<number> {
    const cutoff = buildSweepCutoff({ maxAgeHours: input.maxAgeHours });

    const rows = await this.prisma.mindPolicy.findMany({
      where: {
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        resolvedAt: null,
        createdAt: { lt: cutoff },
      },
      select: RESOLUTION_ROW_SELECT,
    });

    if (rows.length > 0) {
      await Promise.all(
        rows.map((row) =>
          this.prisma.mindPolicy.updateMany({
            where: { id: row.id, workspaceId: input.workspaceId, resolvedAt: null },
            data: buildResolveOutcomeUpdateData(row, input.outcome),
          }),
        ),
      );

      await this.persistResolvedMemories(toResolvedPolicyRows(rows, input.outcome));
    }

    return rows.length;
  }

  /**
   * CIA Gap 4 Phase 2 — delayed message.received outcome resolution.
   *
   * When a message.received arrives, check resolved autopilot_action policies
   * (outcome=1) for the contact. Policies resolved within the window get
   * context.outcomeConfidence='confirmed'; those outside get 'unanswered'.
   */
  async confirmAutopilotOutcome(params: {
    workspaceId: string;
    contactId: string;
    windowMinutes?: number;
  }): Promise<{ confirmed: number; unanswered: number }> {
    const windowMinutes = resolveConfirmWindowMinutes(params.windowMinutes);
    const windowCutoff = buildConfirmWindowCutoff({ windowMinutes });

    const rows = await this.prisma.mindPolicy.findMany({
      where: {
        workspaceId: params.workspaceId,
        subject: `contact:${params.contactId}`,
        decisionType: 'autopilot_action',
        outcome: 1,
        resolvedAt: { not: null },
      },
      select: {
        id: true,
        context: true,
        resolvedAt: true,
      },
    });

    let confirmed = 0;
    let unanswered = 0;

    for (const row of rows) {
      const ctx = (row.context as Record<string, unknown>) ?? {};
      const decision = classifyAutopilotConfirmation({
        existingConfidence: ctx.outcomeConfidence,
        resolvedAt: row.resolvedAt,
        windowCutoff,
      });
      if (decision === 'skip') {
        continue;
      }

      await this.prisma.mindPolicy.updateMany({
        where: { id: row.id, workspaceId: params.workspaceId },
        data: {
          context: { ...ctx, outcomeConfidence: decision },
        },
      });

      if (decision === 'confirmed') {
        confirmed += 1;
      } else {
        unanswered += 1;
      }
    }

    if (confirmed > 0 || unanswered > 0) {
      this.logger.debug?.({
        operation: 'mind_policy.confirmAutopilotOutcome',
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        windowMinutes,
        confirmed,
        unanswered,
      });
    }

    return { confirmed, unanswered };
  }

  async harness(
    workspaceId: string,
    decisionType: string,
    sinceDays = 14,
  ): Promise<MindPolicyHarnessResult> {
    const since = buildHarnessSince({ sinceDays });
    const rawRows = await this.prisma.mindPolicy.findMany({
      where: {
        workspaceId,
        decisionType,
        resolvedAt: { gte: since },
        outcome: { not: null },
      },
      select: {
        baselineOutcome: true,
        outcome: true,
      },
    });
    return summarizePolicyHarness(Array.isArray(rawRows) ? rawRows : []);
  }

  private async mixWithGlobalPrior(input: {
    beliefs: MindBelief[];
    channel: string | undefined;
    decisionType: string;
    inputOptions: Array<{ action: string }>;
    workspaceOptedOut: boolean;
  }): Promise<MixedBeliefEntry[]> {
    const globalPrior = this.globalPrior;
    const channel = input.channel;
    return Promise.all(
      input.beliefs.map(async (belief, index) => {
        if (
          shouldSkipGlobalPriorMix({
            workspaceOptedOut: input.workspaceOptedOut,
            channel,
            hasGlobalPrior: !!globalPrior,
            beliefSamples: belief.samples,
          }) ||
          !globalPrior ||
          !channel
        ) {
          return buildMixedBeliefDefault(belief);
        }

        const action = input.inputOptions[index]?.action;
        if (!action) {
          return buildMixedBeliefDefault(belief);
        }

        const prior = await globalPrior.getPriorTuple(channel, input.decisionType, action);

        if (!prior) {
          return buildMixedBeliefDefault(belief);
        }

        const mix = computeGlobalPriorMix({
          localN: belief.samples,
          localMean: belief.mean,
          globalN: prior.observations,
          globalMean: prior.mean,
        });

        return buildMixedBeliefMixed(belief, mix);
      }),
    );
  }

  private async persist(decision: MindPolicyDecision): Promise<void> {
    const { outcomeKey } = decision;
    if (outcomeKey) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw /* raw justified: PostgreSQL advisory lock for outcome deduplication */ `
          SELECT pg_advisory_xact_lock(hashtext(${`${decision.workspaceId}:${outcomeKey}`}))
        `;
        const existing = await tx.mindPolicy.findFirst({
          where: {
            outcomeKey,
            workspaceId: decision.workspaceId,
          },
          select: { id: true },
        });
        if (existing) {
          return;
        }
        await createPolicyRow(tx, decision);
      });
      return;
    }

    try {
      await createPolicyRow(this.prisma, decision);
    } catch (error: unknown) {
      if (isPrismaUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }
  }

  private persistResolvedMemories(
    rows: Parameters<typeof persistResolvedPolicyMemories>[1],
    baselineOutcome?: number,
    prisma: Pick<PrismaService, 'kloelMemory'> | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    return persistResolvedPolicyMemories(prisma, rows, baselineOutcome);
  }
}
