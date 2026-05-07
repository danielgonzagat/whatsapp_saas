import { Injectable } from '@nestjs/common';
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

type ResolvedPolicyRow = {
  baseline: string;
  chosen: string;
  decisionType: string;
  id: string;
  outcome: number;
  outcomeKey: string | null;
  subject: string;
  workspaceId: string;
};

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

const FALLBACK_MIN_SAMPLES = 30;

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

    const harness = await this.harness(input.workspaceId, input.decisionType, 14);

    if (harness.lift < 0 && harness.pZScore <= -1.96 && harness.n >= minSamples) {
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
          `lift=${harness.lift.toFixed(3)}`,
          `z=${harness.pZScore.toFixed(2)}`,
          `n=${harness.n}`,
          `mindMean=${harness.mindMean.toFixed(3)}`,
          `baselineMean=${harness.baselineMean.toFixed(3)}`,
        ].join(' '),
        outcomeKey: input.outcomeKey,
        reasonInternal: `FALLBACK: MIND underperforming baseline (lift=${harness.lift.toFixed(3)} < 0)`,
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
    const rows = await this.prisma.$queryRaw<ResolvedPolicyRow[]>`
      UPDATE "RAC_MindPolicy"
      SET "outcome" = ${outcome},
          "baselineOutcome" = ${baselineOutcome ?? null},
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "outcomeKey" = ${outcomeKey}
        AND "workspaceId" = ${workspaceId}
        AND "resolvedAt" IS NULL
      RETURNING id, "workspaceId", subject, "decisionType", chosen, baseline, "outcomeKey", outcome
    `;
    await this.persistResolvedMemories(rows, baselineOutcome);
  }

  async resolveOpenForSubject(input: {
    baselineOutcome?: number;
    decisionType: string;
    outcome: number;
    subject: string;
    workspaceId: string;
  }): Promise<number> {
    const rows = await this.prisma.$queryRaw<ResolvedPolicyRow[]>`
      UPDATE "RAC_MindPolicy"
      SET "outcome" = ${input.outcome},
          "baselineOutcome" = ${input.baselineOutcome ?? null},
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "workspaceId" = ${input.workspaceId}
        AND "subject" = ${input.subject}
        AND "decisionType" = ${input.decisionType}
        AND "resolvedAt" IS NULL
      RETURNING id, "workspaceId", subject, "decisionType", chosen, baseline, "outcomeKey", outcome
    `;
    await this.persistResolvedMemories(rows, input.baselineOutcome);
    return rows.length;
  }

  async sweepExpiredOutcomes(input: {
    decisionType: string;
    maxAgeHours: number;
    outcome: number;
    workspaceId: string;
  }): Promise<number> {
    const rows = await this.prisma.$queryRaw<ResolvedPolicyRow[]>`
      UPDATE "RAC_MindPolicy"
      SET "outcome" = ${input.outcome},
          "resolvedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "workspaceId" = ${input.workspaceId}
        AND "decisionType" = ${input.decisionType}
        AND "resolvedAt" IS NULL
        AND "createdAt" < NOW() - (${input.maxAgeHours} * INTERVAL '1 hour')
      RETURNING id, "workspaceId", subject, "decisionType", chosen, baseline, "outcomeKey", outcome
    `;
    await this.persistResolvedMemories(rows);
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
    const rawRows = await this.prisma.$queryRaw<
      Array<{ baselineOutcome: number | null; outcome: number }>
    >`
      SELECT "baselineOutcome", "outcome"
      FROM "RAC_MindPolicy"
      WHERE "workspaceId" = ${workspaceId}
        AND "decisionType" = ${decisionType}
        AND "resolvedAt" >= ${since}
        AND "outcome" IS NOT NULL
    `;
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const outcomes = rows.map((row) => row.outcome);
    const baselineOutcomes = rows
      .map((row) => row.baselineOutcome)
      .filter((value): value is number => typeof value === 'number');
    const mindMean = mean(outcomes);
    const baselineMean = mean(baselineOutcomes);
    const lift = baselineMean > 0 ? (mindMean - baselineMean) / baselineMean : 0;
    const pZScore =
      baselineOutcomes.length > 30
        ? this.twoProportionZScore(mindMean, baselineMean, baselineOutcomes.length)
        : 0;

    return { n: rows.length, mindMean, baselineMean, lift, pZScore };
  }

  private async persist(decision: MindPolicyDecision): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "RAC_MindPolicy"
        ("id","workspaceId","subject","decisionType","context","candidates",
         "chosen","baseline","reasonInternal","outcomeKey",
         "calcSteps","epsilon","utilitySuccess","utilityFail",
         "fallbackActive","fallbackReason")
      VALUES
        (${randomUUID()}, ${decision.workspaceId}, ${decision.subject}, ${decision.decisionType},
         ${JSON.stringify(decision.context)}::jsonb, ${JSON.stringify(decision.candidates)}::jsonb,
         ${decision.chosen}, ${decision.baseline}, ${decision.reasonInternal},
         ${decision.outcomeKey ?? null},
         ${JSON.stringify(decision.calcSteps)}::jsonb, ${decision.epsilon},
         ${decision.utilitySuccess}, ${decision.utilityFail},
         ${decision.fallbackActive}, ${decision.fallbackReason ?? null})
    `;
  }

  private async persistResolvedMemories(
    rows: ResolvedPolicyRow[],
    baselineOutcome?: number,
  ): Promise<void> {
    for (const row of rows) {
      const value = {
        baseline: row.baseline,
        baselineOutcome,
        chosen: row.chosen,
        decisionType: row.decisionType,
        outcome: row.outcome,
        outcomeKey: row.outcomeKey,
        subject: row.subject,
      };
      const content = [
        `decision=${row.decisionType}`,
        `subject=${row.subject}`,
        `chosen=${row.chosen}`,
        `baseline=${row.baseline}`,
        `outcome=${row.outcome}`,
      ].join(' ');

      await this.prisma.$executeRaw`
        INSERT INTO "RAC_KloelMemory"
          ("id","workspaceId","key","value","category","type","content","metadata","createdAt","updatedAt")
        VALUES
          (${randomUUID()}, ${row.workspaceId}, ${`mind:policy:${row.id}`},
           ${JSON.stringify(value)}::jsonb, 'mind_outcomes', 'policy_outcome',
           ${content}, ${JSON.stringify({ policyId: row.id })}::jsonb, NOW(), NOW())
        ON CONFLICT ("workspaceId", "key") DO UPDATE
        SET "value" = EXCLUDED."value",
            "content" = EXCLUDED."content",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = NOW()
      `;
    }
  }

  private twoProportionZScore(mindMean: number, baselineMean: number, n: number): number {
    const pooled = (mindMean + baselineMean) / 2;
    const standardError = Math.sqrt((2 * pooled * (1 - pooled)) / n);
    return standardError > 0 ? (mindMean - baselineMean) / standardError : 0;
  }
}
