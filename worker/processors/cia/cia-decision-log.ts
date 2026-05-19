import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

interface DecisionLogInput {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  variantKey?: string | null;
  intent: string;
  message?: string;
  outcome: string;
  priority?: number;
  metadata?: Prisma.InputJsonObject;
}

function buildDecisionLogKey(input: DecisionLogInput): string {
  const scope = input.contactId || input.phone || 'workspace';
  return `decision_log:${scope}:${Date.now()}:${randomUUID()}`;
}

function buildDecisionLogValue(input: DecisionLogInput): Prisma.InputJsonObject {
  return {
    variantKey: input.variantKey || null,
    intent: input.intent,
    message: input.message || null,
    outcome: input.outcome,
    priority: input.priority || null,
    metadata: input.metadata || {},
  };
}

function buildDecisionLogMetadata(input: DecisionLogInput): Prisma.InputJsonObject {
  return {
    contactId: input.contactId || null,
    phone: input.phone || null,
    outcome: input.outcome,
    variantKey: input.variantKey || null,
  };
}

export async function recordDecisionLog(prisma: PrismaClient, input: DecisionLogInput) {
  if (!prisma?.kloelMemory?.create) {
    return null;
  }

  return prisma.kloelMemory.create({
    data: {
      workspaceId: input.workspaceId,
      key: buildDecisionLogKey(input),
      value: buildDecisionLogValue(input),
      category: 'decision_log',
      type: input.intent,
      content: input.message || input.intent,
      metadata: buildDecisionLogMetadata(input),
    },
  });
}

async function loadRecentDecisionLogs(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<Array<{ value: unknown; metadata?: unknown }>> {
  if (!prisma?.kloelMemory?.findMany) {
    return [];
  }
  const rows = await prisma.kloelMemory
    .findMany({
      where: {
        workspaceId,
        category: 'decision_log',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    .catch(() => [] as Array<{ value: unknown; metadata?: unknown }>);
  return rows || [];
}

const outcomeToVariantScore = (outcome: string): number => {
  if (outcome === 'SOLD') {
    return 10;
  }
  if (outcome === 'REPLIED') {
    return 2;
  }
  if (outcome === 'SENT') {
    return 1;
  }
  if (outcome === 'FAILED') {
    return -2;
  }
  return 0;
};

interface OutcomeAggregate {
  soldCount: number;
  sentCount: number;
  failedCount: number;
  variantScores: Map<string, number>;
}

interface DecisionLogItem {
  value: unknown;
  metadata?: unknown;
}

interface ExtractedOutcome {
  outcome: string;
  variantKey: string;
}

const extractOutcomeFromLog = (item: DecisionLogItem): ExtractedOutcome => {
  const value = (item?.value || {}) as Record<string, unknown>;
  const itemMeta = (item?.metadata || {}) as Record<string, unknown>;
  return {
    outcome: String(value?.outcome || itemMeta?.outcome || ''),
    variantKey: String(value?.variantKey || itemMeta?.variantKey || ''),
  };
};

const isSoldOrSentOrReplied = (outcome: string): boolean =>
  outcome === 'SENT' || outcome === 'REPLIED' || outcome === 'SOLD';

const accumulateVariantScore = (
  variantScores: Map<string, number>,
  variantKey: string,
  outcome: string,
): void => {
  if (!variantKey) {
    return;
  }
  const score = outcomeToVariantScore(outcome);
  variantScores.set(variantKey, (variantScores.get(variantKey) || 0) + score);
};

function aggregateDecisionOutcomes(logs: Array<DecisionLogItem>): OutcomeAggregate {
  const variantScores = new Map<string, number>();
  let soldCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const item of logs) {
    const { outcome, variantKey } = extractOutcomeFromLog(item);

    if (outcome === 'SOLD') {
      soldCount += 1;
    }
    if (isSoldOrSentOrReplied(outcome)) {
      sentCount += 1;
    }
    if (outcome === 'FAILED') {
      failedCount += 1;
    }

    accumulateVariantScore(variantScores, variantKey, outcome);
  }

  return { soldCount, sentCount, failedCount, variantScores };
}

function pickTopVariant(variantScores: Map<string, number>): [string | null, number] {
  return [...variantScores.entries()].sort((a, b) => b[1] - a[1])[0] || [null as string | null, 0];
}

export async function computeLearningSnapshot(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<{
  totalLogs: number;
  soldCount: number;
  sentCount: number;
  failedCount: number;
  topVariantKey: string | null;
  topVariantScore: number;
}> {
  const logs = await loadRecentDecisionLogs(prisma, workspaceId);
  const { soldCount, sentCount, failedCount, variantScores } = aggregateDecisionOutcomes(logs);
  const [topVariantKey, topVariantScore] = pickTopVariant(variantScores);

  return {
    totalLogs: logs.length,
    soldCount,
    sentCount,
    failedCount,
    topVariantKey,
    topVariantScore,
  };
}
