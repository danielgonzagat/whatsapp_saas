import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { MindPolicyDecision } from './mind.types';

export type ResolvedPolicyRow = {
  baseline: string;
  chosen: string;
  decisionType: string;
  id: string;
  outcome: number;
  outcomeKey: string | null;
  subject: string;
  workspaceId: string;
};

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function twoProportionZScore(
  mindMean: number,
  baselineMean: number,
  mindSamples: number,
  baselineSamples: number,
): number {
  const totalSamples = mindSamples + baselineSamples;
  if (mindSamples <= 0 || baselineSamples <= 0 || totalSamples <= 0) {
    return 0;
  }
  const pooled =
    (mindMean * mindSamples + baselineMean * baselineSamples) / (mindSamples + baselineSamples);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / mindSamples + 1 / baselineSamples));
  return standardError > 0 ? (mindMean - baselineMean) / standardError : 0;
}

export function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createPolicyRow(
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

export async function persistResolvedPolicyMemories(
  prisma: Pick<PrismaService, '$executeRaw'>,
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

    await prisma.$executeRaw`
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
