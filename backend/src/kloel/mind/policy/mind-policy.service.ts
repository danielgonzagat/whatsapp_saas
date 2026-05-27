import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { KloelGlobalPriorService } from '../../kloel-global-prior.service';
import { WisdomRelevanceFilter } from '../../wisdom/wisdom-relevance-filter.service';
import { WisdomPatternStore } from '../../wisdom/wisdom-pattern-store.service';
import { MindBeliefService } from '../../mind-belief.service';
import { extractChannel } from '../../mind-belief-by-channel';
import type { MindBelief, MindPolicyDecision } from '../../mind.types';
import {
  buildFallbackDecision,
  buildPolicyArtifacts,
  buildPolicyDecision,
  type MindPolicyHarnessResult,
  type MindPolicyInput,
  resolveBaselineAction,
  shouldUseBaselineFallback,
  summarizePolicyHarness,
} from '../../mind-policy-calculation';
import {
  createPolicyRow,
  estimateCounterfactualBaselineOutcome,
  persistResolvedPolicyMemories,
} from '../../mind-policy.helpers';
import { applyWisdomPriors } from '../../mind-policy.wisdom-prior.helpers';

const FALLBACK_MIN_SAMPLES = 30;
const COLD_START_THRESHOLD = 30;

@Injectable()
export class MindPolicyService {
  private readonly logger = StructuredLogger.from(MindPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
    @Optional() private readonly globalPrior?: KloelGlobalPriorService,
    @Optional() private readonly wisdomFilter?: WisdomRelevanceFilter,
    @Optional() private readonly wisdomStore?: WisdomPatternStore,
  ) {
    this.logger.debug?.(`MindPolicyService initialized`);
  }

  async choose(input: MindPolicyInput): Promise<{ chosen: string; decision: MindPolicyDecision }> {
    const utilitySuccess = input.utilitySuccess ?? 1;
    const utilityFail = input.utilityFail ?? -0.2;
    const epsilon = input.epsilon ?? 0.5;
    const minSamples = input.fallbackMinSamples ?? FALLBACK_MIN_SAMPLES;

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

    let usedGlobalPrior = false;
    let maxPriorWeight = 0;

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

    const beliefs = wisdomNudged.map((m) => {
      if (m.usedPrior) {
        usedGlobalPrior = true;
        if (m.priorWeight > maxPriorWeight) {
          maxPriorWeight = m.priorWeight;
        }
      }
      return { mean: m.mixedMean, variance: m.belief.variance };
    });

    const artifacts = buildPolicyArtifacts({
      beliefs,
      epsilon,
      options: input.options,
      policy: input,
      utilityFail,
      utilitySuccess,
    });
    const fallbackAction = artifacts.candidates.at(-1)?.action;
    const baselineAction = resolveBaselineAction({
      ...(input.baseline !== undefined ? { baseline: input.baseline } : {}),
      ...(input.baselineActionQuiet !== undefined
        ? { baselineActionQuiet: input.baselineActionQuiet }
        : {}),
      ...(fallbackAction !== undefined ? { fallback: fallbackAction } : {}),
    });
    const decision = {
      ...buildPolicyDecision({
        artifacts,
        baselineAction,
        epsilon,
        policy: input,
        utilityFail,
        utilitySuccess,
      }),
      usedGlobalPrior,
      priorWeight: maxPriorWeight,
    };

    await this.persist(decision);
    return { chosen: decision.chosen, decision };
  }

  async resolveOutcome(
    workspaceId: string,
    outcomeKey: string,
    outcome: number,
    baselineOutcome?: number,
  ): Promise<void> {
    // Gap 6: collect (channel, decisionType, action) tuples to feed back into
    // the global prior after the transaction commits.
    const priorRows: Array<{ channel: string; decisionType: string; action: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw /* raw justified: PostgreSQL advisory lock for outcome resolution */ `
        SELECT pg_advisory_xact_lock(hashtext(${`resolve:${workspaceId}:${outcomeKey}`}))
      `;
      const rows = await tx.mindPolicy.findMany({
        where: { outcomeKey, workspaceId, resolvedAt: null },
        select: {
          id: true,
          workspaceId: true,
          subject: true,
          decisionType: true,
          context: true,
          chosen: true,
          baseline: true,
          outcomeKey: true,
        },
      });

      if (rows.length === 0) {
        return;
      }

      const resolvedAt = new Date();
      let resolvedCount = 0;

      for (const row of rows) {
        const result = await tx.mindPolicy.updateMany({
          where: { id: row.id, workspaceId, resolvedAt: null },
          data: {
            outcome,
            resolvedAt,
            baselineOutcome:
              baselineOutcome ??
              estimateCounterfactualBaselineOutcome({
                baseline: row.baseline,
                chosen: row.chosen,
                context: row.context,
                outcome,
              }),
          },
        });
        resolvedCount += result.count;
      }

      if (resolvedCount > 0) {
        for (const row of rows) {
          const channel = extractChannel(row.context as Record<string, unknown>);
          if (channel) {
            priorRows.push({ channel, decisionType: row.decisionType, action: row.chosen });
          }
        }

        await this.persistResolvedMemories(
          rows.map((r) => ({
            ...r,
            outcomeKey: r.outcomeKey ?? null,
            outcome,
          })),
          baselineOutcome,
          tx,
        );
      }
    });

    // Gap 6: feed resolved outcomes back into the cross-workspace global prior.
    if (this.globalPrior && priorRows.length > 0) {
      const success = outcome >= 0.5;
      for (const row of priorRows) {
        try {
          await this.globalPrior.recordObservation(
            row.channel,
            row.decisionType,
            row.action,
            success,
          );
        } catch (err: unknown) {
          this.logger.error('Failed to record global prior observation from resolveOutcome', {
            outcomeKey,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
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
      select: {
        id: true,
        workspaceId: true,
        subject: true,
        decisionType: true,
        context: true,
        chosen: true,
        baseline: true,
        outcomeKey: true,
      },
    });

    if (rows.length > 0) {
      await Promise.all(
        rows.map((row) =>
          this.prisma.mindPolicy.updateMany({
            where: { id: row.id, workspaceId: input.workspaceId, resolvedAt: null },
            data: {
              outcome: input.outcome,
              baselineOutcome:
                input.baselineOutcome ??
                estimateCounterfactualBaselineOutcome({
                  baseline: row.baseline,
                  chosen: row.chosen,
                  context: row.context,
                  outcome: input.outcome,
                }),
              resolvedAt: new Date(),
            },
          }),
        ),
      );

      await this.persistResolvedMemories(
        rows.map((r) => ({
          ...r,
          outcomeKey: r.outcomeKey ?? null,
          outcome: input.outcome,
        })),
        input.baselineOutcome,
      );
    }

    // Gap 6: feed resolved outcomes from this subject back into the
    // cross-workspace global prior.
    if (this.globalPrior && rows.length > 0) {
      const success = input.outcome >= 0.5;
      for (const row of rows) {
        const channel = extractChannel(row.context as Record<string, unknown>);
        if (!channel) {
          continue;
        }
        try {
          await this.globalPrior.recordObservation(
            channel,
            row.decisionType,
            row.chosen,
            success,
          );
        } catch (err: unknown) {
          this.logger.error('Failed to record global prior observation from resolveOpenForSubject', {
            subject: input.subject,
            decisionType: input.decisionType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return rows.length;
  }

  async sweepExpiredOutcomes(input: {
    decisionType: string;
    maxAgeHours: number;
    outcome: number;
    workspaceId: string;
  }): Promise<number> {
    const cutoff = new Date(Date.now() - input.maxAgeHours * 3600 * 1000);

    const rows = await this.prisma.mindPolicy.findMany({
      where: {
        workspaceId: input.workspaceId,
        decisionType: input.decisionType,
        resolvedAt: null,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        workspaceId: true,
        subject: true,
        decisionType: true,
        context: true,
        chosen: true,
        baseline: true,
        outcomeKey: true,
      },
    });

    if (rows.length > 0) {
      await Promise.all(
        rows.map((row) =>
          this.prisma.mindPolicy.updateMany({
            where: { id: row.id, workspaceId: input.workspaceId, resolvedAt: null },
            data: {
              outcome: input.outcome,
              baselineOutcome: estimateCounterfactualBaselineOutcome({
                baseline: row.baseline,
                chosen: row.chosen,
                context: row.context,
                outcome: input.outcome,
              }),
              resolvedAt: new Date(),
            },
          }),
        ),
      );

      await this.persistResolvedMemories(
        rows.map((r) => ({
          ...r,
          outcomeKey: r.outcomeKey ?? null,
          outcome: input.outcome,
        })),
      );
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
    const windowMinutes = params.windowMinutes ?? 30;
    const now = new Date();
    const windowCutoff = new Date(now.getTime() - windowMinutes * 60 * 1000);

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
      if (ctx.outcomeConfidence !== undefined && ctx.outcomeConfidence !== null) {
        continue;
      }

      const isWithinWindow = row.resolvedAt != null && row.resolvedAt >= windowCutoff;
      const newConfidence: string = isWithinWindow ? 'confirmed' : 'unanswered';

      await this.prisma.mindPolicy.update({
        where: { id: row.id },
        data: {
          context: { ...ctx, outcomeConfidence: newConfidence } as Prisma.InputJsonValue,
        },
      });

      if (isWithinWindow) {
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
    const since = new Date(Date.now() - sinceDays * 86400 * 1000);
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
  }): Promise<
    Array<{ belief: MindBelief; mixedMean: number; usedPrior: boolean; priorWeight: number }>
  > {
    return Promise.all(
      input.beliefs.map(async (belief, index) => {
        if (
          input.workspaceOptedOut ||
          !input.channel ||
          !this.globalPrior ||
          belief.samples >= COLD_START_THRESHOLD
        ) {
          return {
            belief,
            mixedMean: belief.mean,
            usedPrior: false,
            priorWeight: 0,
          };
        }

        const action = input.inputOptions[index]?.action;
        if (!action) {
          return { belief, mixedMean: belief.mean, usedPrior: false, priorWeight: 0 };
        }

        const prior = await this.globalPrior.getPrior(input.channel, input.decisionType, action);

        if (!prior) {
          return { belief, mixedMean: belief.mean, usedPrior: false, priorWeight: 0 };
        }

        const localN = belief.samples;
        const localMean = belief.mean;
        const globalN = prior.observations;
        const globalMean = prior.mean;
        const globalNWeight = Math.min(globalN, COLD_START_THRESHOLD - localN);
        const mixedMean =
          (localN * localMean + globalNWeight * globalMean) / (localN + globalNWeight);
        const priorWeight = globalNWeight / (localN + globalNWeight);

        return { belief, mixedMean, usedPrior: true, priorWeight };
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
      const err = error as { code?: string };
      if (err && typeof err === 'object' && err.code === 'P2002') {
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
