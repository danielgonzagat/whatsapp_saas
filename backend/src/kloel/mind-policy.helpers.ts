import { randomUUID } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';

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

export function twoProportionZScore(mindMean: number, baselineMean: number, n: number): number {
  const pooled = (mindMean + baselineMean) / 2;
  const standardError = Math.sqrt((2 * pooled * (1 - pooled)) / n);
  return standardError > 0 ? (mindMean - baselineMean) / standardError : 0;
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
