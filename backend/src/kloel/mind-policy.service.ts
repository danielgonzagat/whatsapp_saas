import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MindBeliefService } from './mind-belief.service';
import type {
  MindActionCandidate,
  MindJson,
  MindPolicyCalcStep,
  MindPolicyDecision,
  MindPolicyOption,
} from './mind.types';
import { mean, persistResolvedPolicyMemories, twoProportionZScore } from './mind-policy.helpers';

const FALLBACK_MIN_SAMPLES = 30;

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class MindPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
  ) {}

  async choose(input: {
    baseline?: string;
    baselineActionQuiet?: string;
    context: MindJson;
    decisionType: string;
    epsilon?: number;
    fallbackMinSamples?: number;
    options: MindPolicyOption[];
    outcomeKey?: string;
    subject: string;
    utilityFail?: number;
    utilitySuccess?: number;
    workspaceId: string;
  }): Promise<{ chosen: string; decision: MindPolicyDecision }> {
    const utilitySuccess = input.utilitySuccess ?? 1;
    const utilityFail = input.utilityFail ?? -0.2;
    const epsilon = input.epsilon ?? 0.5;
    const minSamples = input.fallbackMinSamples ?? FALLBACK_MIN_SAMPLES;

    const harnessResult = await this.harness(input.workspaceId, input.decisionType, 14);

    if (harnessResult.lift < 0 && harnessResult.pZScore <= -1.96 && harnessResult.n >= minSamples) {
      const baselineAction =
        input.baselineActionQuiet ??
        input.baseline ??
        input.options[input.options.length - 1]?.action ??
        'pass';

      const fallbackDecision: MindPolicyDecision = {
        workspaceId: input.workspaceId,
        subject: input.subject,
        decisionType: input.decisionType,
        context: input.context,
        baseline: baselineAction,
        baselineAction: baselineAction,
        calcSteps: [],
        candidates: [],
        chosen: baselineAction,
        epsilon,
        fallbackActive: true,
        fallbackReason: [
          `lift=${harnessResult.lift.toFixed(3)}`,
          `z=${harnessResult.pZScore.toFixed(2)}`,
          `n=${harnessResult.n}`,
          `mindMean=${harnessResult.mindMean.toFixed(3)}`,
          `baselineMean=${harnessResult.baselineMean.toFixed(3)}`,
        ].join(' '),
        outcomeKey: input.outcomeKey,
        reasonInternal: `FALLBACK: MIND underperforming baseline (lift=${harnessResult.lift.toFixed(3)} < 0)`,
        utilityFail,
        utilitySuccess,
      };

      await this.persist(fallbackDecision);
      return { chosen: baselineAction, decision: fallbackDecision };
    }

    const candidates: MindActionCandidate[] = [];
    const calcSteps: MindPolicyCalcStep[] = [];

    for (const option of input.options) {
      const belief = await this.beliefs.getOrInit(
        input.workspaceId,
        input.subject,
        option.predicate,
        option.context,
      );

      const pessimisticSuccess = Math.max(0, belief.mean);
      const pragmatic =
        pessimisticSuccess * utilitySuccess + (1 - pessimisticSuccess) * utilityFail;
      const epistemic = epsilon * belief.variance;
      const efe = -(pragmatic + epistemic);

      candidates.push({
        action: option.action,
        beliefMean: belief.mean,
        beliefVariance: belief.variance,
        pragmatic,
        epistemic,
        efe,
        uncertaintyAtChoice: belief.variance,
      });

      calcSteps.push({
        action: option.action,
        beliefMean: belief.mean,
        beliefVariance: belief.variance,
        pragmatic,
        epistemic,
        efe,
        formula: [
          'EFE=-(P+E)',
          `P=${belief.mean.toFixed(4)}*${utilitySuccess}+${(1 - belief.mean).toFixed(4)}*${utilityFail}=${pragmatic.toFixed(4)}`,
          `E=${epsilon}*${belief.variance.toFixed(4)}=${epistemic.toFixed(4)}`,
          `EFE=${efe.toFixed(4)}`,
        ].join(' '),
      });
    }

    candidates.sort((left, right) => left.efe - right.efe);
    const winner = candidates[0];
    const baselineAction =
      input.baselineActionQuiet ??
      input.baseline ??
      candidates[candidates.length - 1]?.action ??
      'pass';

    const decision: MindPolicyDecision = {
      workspaceId: input.workspaceId,
      subject: input.subject,
      decisionType: input.decisionType,
      context: input.context,
      baseline: baselineAction,
      baselineAction,
      calcSteps,
      candidates,
      chosen: winner.action,
      epsilon,
      fallbackActive: false,
      fallbackReason: null,
      outcomeKey: input.outcomeKey,
      reasonInternal: `efe=${winner.efe.toFixed(3)} pragmatic=${winner.pragmatic.toFixed(3)} epistemic=${winner.epistemic.toFixed(3)} variance=${winner.uncertaintyAtChoice.toFixed(3)}`,
      utilityFail,
      utilitySuccess,
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
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`resolve:${workspaceId}:${outcomeKey}`}))
      `;
      const rows = await tx.mindPolicy.findMany({
        where: { outcomeKey, workspaceId, resolvedAt: null },
        select: {
          id: true,
          workspaceId: true,
          subject: true,
          decisionType: true,
          chosen: true,
          baseline: true,
          outcomeKey: true,
        },
      });

      if (rows.length === 0) {
        return;
      }

      const result = await tx.mindPolicy.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, workspaceId, resolvedAt: null },
        data: {
          outcome,
          baselineOutcome: baselineOutcome ?? null,
          resolvedAt: new Date(),
        },
      });

      if (result.count > 0) {
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
        chosen: true,
        baseline: true,
        outcomeKey: true,
      },
    });

    if (rows.length > 0) {
      await this.prisma.mindPolicy.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, workspaceId: input.workspaceId },
        data: {
          outcome: input.outcome,
          baselineOutcome: input.baselineOutcome ?? null,
          resolvedAt: new Date(),
        },
      });

      await this.persistResolvedMemories(
        rows.map((r) => ({
          ...r,
          outcomeKey: r.outcomeKey ?? null,
          outcome: input.outcome,
        })),
        input.baselineOutcome,
      );
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
        chosen: true,
        baseline: true,
        outcomeKey: true,
      },
    });

    if (rows.length > 0) {
      await this.prisma.mindPolicy.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, workspaceId: input.workspaceId },
        data: {
          outcome: input.outcome,
          resolvedAt: new Date(),
        },
      });

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

  async harness(
    workspaceId: string,
    decisionType: string,
    sinceDays = 14,
  ): Promise<{
    baselineMean: number;
    lift: number;
    mindMean: number;
    n: number;
    pZScore: number;
  }> {
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
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const outcomes = rows.map((row) => row.outcome!);
    const baselineOutcomes = rows
      .map((row) => row.baselineOutcome)
      .filter((value): value is number => typeof value === 'number');
    const mindMean = mean(outcomes);
    const baselineMean = mean(baselineOutcomes);
    const lift = baselineMean > 0 ? (mindMean - baselineMean) / baselineMean : 0;
    const pZScore =
      baselineOutcomes.length > 30
        ? twoProportionZScore(mindMean, baselineMean, outcomes.length, baselineOutcomes.length)
        : 0;

    return { n: rows.length, mindMean, baselineMean, lift, pZScore };
  }

  private async persist(decision: MindPolicyDecision): Promise<void> {
    if (decision.outcomeKey) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`${decision.workspaceId}:${decision.outcomeKey}`}))
        `;
        const existing = await tx.mindPolicy.findFirst({
          where: {
            outcomeKey: decision.outcomeKey,
            workspaceId: decision.workspaceId,
          },
          select: { id: true },
        });
        if (existing) {
          return;
        }
        await this.createPolicyRow(tx, decision);
      });
      return;
    }

    try {
      await this.createPolicyRow(this.prisma, decision);
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err && typeof err === 'object' && err.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  private createPolicyRow(
    prisma: Pick<PrismaService, 'mindPolicy'> | Prisma.TransactionClient,
    decision: MindPolicyDecision,
  ) {
    return prisma.mindPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: decision.workspaceId,
        subject: decision.subject,
        decisionType: decision.decisionType,
        context: inputJson(decision.context),
        candidates: inputJson(decision.candidates),
        chosen: decision.chosen,
        baseline: decision.baseline,
        reasonInternal: decision.reasonInternal,
        outcomeKey: decision.outcomeKey ?? null,
        calcSteps: inputJson(decision.calcSteps),
        epsilon: decision.epsilon,
        utilitySuccess: decision.utilitySuccess,
        utilityFail: decision.utilityFail,
        fallbackActive: decision.fallbackActive,
        fallbackReason: decision.fallbackReason ?? null,
      },
    });
  }

  private persistResolvedMemories(
    rows: Parameters<typeof persistResolvedPolicyMemories>[1],
    baselineOutcome?: number,
    prisma: Pick<PrismaService, '$executeRaw'> | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    return persistResolvedPolicyMemories(prisma, rows, baselineOutcome);
  }
}
