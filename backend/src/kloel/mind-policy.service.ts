import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MindBeliefService } from './mind-belief.service';
import type { MindPolicyDecision } from './mind.types';
import {
  buildFallbackDecision,
  buildPolicyArtifacts,
  buildPolicyDecision,
  type MindPolicyHarnessResult,
  type MindPolicyInput,
  resolveBaselineAction,
  shouldUseBaselineFallback,
  summarizePolicyHarness,
} from './mind-policy-calculation';
import {
  createPolicyRow,
  estimateCounterfactualBaselineOutcome,
  persistResolvedPolicyMemories,
} from './mind-policy.helpers';

const FALLBACK_MIN_SAMPLES = 30;

@Injectable()
export class MindPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beliefs: MindBeliefService,
  ) {}

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

    const beliefs = await Promise.all(
      input.options.map((option) =>
        this.beliefs.getOrInit(input.workspaceId, input.subject, option.predicate, option.context),
      ),
    );
    const artifacts = buildPolicyArtifacts({
      beliefs,
      epsilon,
      options: input.options,
      policy: input,
      utilityFail,
      utilitySuccess,
    });
    const baselineAction = resolveBaselineAction({
      ...(input.baseline !== undefined ? { baseline: input.baseline } : {}),
      ...(input.baselineActionQuiet !== undefined
        ? { baselineActionQuiet: input.baselineActionQuiet }
        : {}),
      ...(artifacts.candidates.at(-1)?.action !== undefined
        ? { fallback: artifacts.candidates.at(-1)?.action }
        : {}),
    });
    const decision = buildPolicyDecision({
      artifacts,
      baselineAction,
      epsilon,
      policy: input,
      utilityFail,
      utilitySuccess,
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
