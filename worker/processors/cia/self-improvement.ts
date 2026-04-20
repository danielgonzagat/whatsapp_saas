import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

/** Variant family type. */
export type VariantFamily = 'followup' | 'payment_recovery';
/** Variant outcome type. */
export type VariantOutcome = 'SENT' | 'REPLIED' | 'SOLD' | 'FAILED' | 'SKIPPED' | 'DISPATCHED';

/** Message variant shape. */
export interface MessageVariant {
  /** Key property. */
  key: string;
  /** Family property. */
  family: VariantFamily;
  /** Text property. */
  text: string;
  /** Score property. */
  score: number;
  /** Uses property. */
  uses: number;
}

/** Learning snapshot shape. */
export interface LearningSnapshot {
  /** Total logs property. */
  totalLogs: number;
  /** Sold count property. */
  soldCount: number;
  /** Sent count property. */
  sentCount: number;
  /** Failed count property. */
  failedCount: number;
  /** Top variant key property. */
  topVariantKey: string | null;
  /** Top variant score property. */
  topVariantScore: number;
}

/** Variant selection strategy shape. */
export interface VariantSelectionStrategy {
  /** Preferred length property. */
  preferredLength?: 'short' | 'medium' | 'long';
  /** Preferred variant family property. */
  preferredVariantFamily?: string | null;
  /** Confidence property. */
  confidence?: number;
}

const DEFAULT_VARIANTS: Record<VariantFamily, Array<Omit<MessageVariant, 'score' | 'uses'>>> = {
  followup: [
    {
      key: 'followup:direct',
      family: 'followup',
      text: 'Passei aqui porque seu atendimento ficou em aberto. Se ainda fizer sentido, eu consigo te ajudar a concluir agora.',
    },
    {
      key: 'followup:proof',
      family: 'followup',
      text: 'Muita gente volta quando entende melhor o próximo passo. Se você quiser, eu resumo tudo e deixo isso simples agora.',
    },
    {
      key: 'followup:scarcity',
      family: 'followup',
      text: 'Ainda consigo te atender com prioridade agora, mas não sei se vou manter essa condição mais tarde. Quer que eu avance?',
    },
  ],
  payment_recovery: [
    {
      key: 'payment:pix_recovery',
      family: 'payment_recovery',
      text: 'Vi que o pagamento ficou pendente. Se quiser, eu te reenfio o link agora e deixo isso resolvido em poucos minutos.',
    },
    {
      key: 'payment:confidence',
      family: 'payment_recovery',
      text: 'Seu pagamento ainda está em aberto. Posso te ajudar a concluir com segurança agora, sem perder o que já foi combinado.',
    },
    {
      key: 'payment:deadline',
      family: 'payment_recovery',
      text: 'Consigo reativar sua cobrança agora e garantir a continuidade do seu pedido. Quer que eu faça isso por você?',
    },
  ],
};

function initialVariant(input: Omit<MessageVariant, 'score' | 'uses'>): MessageVariant {
  return {
    ...input,
    score: 1,
    uses: 0,
  };
}

function applyOutcomeScore(
  current: MessageVariant,
  outcome: VariantOutcome,
  revenue?: number,
): MessageVariant {
  let delta = 0;
  if (outcome === 'SOLD') {
    delta = 10;
  } else if (outcome === 'REPLIED') {
    delta = 2;
  } else if (outcome === 'SENT' || outcome === 'DISPATCHED') {
    delta = 1;
  } else if (outcome === 'SKIPPED') {
    delta = -0.5;
  } else if (outcome === 'FAILED') {
    delta = -2;
  }

  const revenueBoost = revenue && revenue > 0 ? Math.min(revenue / 500, 10) : 0;

  return {
    ...current,
    score: Number((current.score + delta + revenueBoost).toFixed(3)),
    uses: current.uses + 1,
  };
}

function toLengthBucket(length: number): 'short' | 'medium' | 'long' {
  if (length <= 90) {
    return 'short';
  }
  if (length <= 220) {
    return 'medium';
  }
  return 'long';
}

function variantKeyPrefix(family: VariantFamily): string {
  return family === 'payment_recovery' ? 'cia_variant:payment_recovery:' : 'cia_variant:followup:';
}

async function loadStoredVariants(
  prisma: PrismaClient,
  workspaceId: string,
  keyPrefix: string,
): Promise<Array<{ value: unknown; content?: string | null }>> {
  if (!prisma?.kloelMemory?.findMany) {
    return [];
  }
  const rows = await prisma.kloelMemory
    .findMany({
      where: {
        workspaceId,
        category: 'cia_variant',
        key: { startsWith: keyPrefix },
      },
      take: 20,
    })
    .catch(() => [] as Array<{ value: unknown; content?: string | null }>);
  return rows || [];
}

function buildStoredVariantMap(
  rows: Array<{ value: unknown; content?: string | null }>,
  family: VariantFamily,
): Map<string, MessageVariant> {
  const storedMap = new Map<string, MessageVariant>();
  for (const item of rows) {
    const value = (item?.value || {}) as Partial<MessageVariant>;
    if (!value?.key) {
      continue;
    }
    storedMap.set(String(value.key), {
      key: String(value.key),
      family,
      text: String(value.text || item.content || ''),
      score: Number(value.score || 1) || 1,
      uses: Number(value.uses || 0) || 0,
    });
  }
  return storedMap;
}

function resolveVariantPool(
  defaults: MessageVariant[],
  storedMap: Map<string, MessageVariant>,
): MessageVariant[] {
  const merged = defaults.map((variant) => storedMap.get(variant.key) || variant);
  return storedMap.size === 0
    ? merged.filter((variant) => variant.uses === 0 || variant.score > 1)
    : merged;
}

function resolveEpsilon(): number {
  return Math.min(0.25, Math.max(0.05, Number(process.env.CIA_VARIANT_EPSILON || 0.1) || 0.1));
}

function computeFamilyBonus(
  strategy: VariantSelectionStrategy | null | undefined,
  family: VariantFamily,
): number {
  if (!strategy?.preferredVariantFamily) {
    return 0;
  }
  if (strategy.preferredVariantFamily === family) {
    return 0.15;
  }
  return -0.05;
}

function buildVariantRanker(
  strategy: VariantSelectionStrategy | null | undefined,
  family: VariantFamily,
): (variant: MessageVariant) => number {
  const familyBonus = computeFamilyBonus(strategy, family);
  const confidenceBonus = Number(strategy?.confidence || 0) * 0.1;
  return (variant: MessageVariant) => {
    const averageScore = variant.score / Math.max(1, variant.uses);
    const lengthBonus =
      strategy?.preferredLength && toLengthBucket(variant.text.length) === strategy.preferredLength
        ? 0.2
        : 0;
    return averageScore + lengthBonus + familyBonus + confidenceBonus;
  };
}

function weightedSamplePick(
  ordered: MessageVariant[],
  rank: (variant: MessageVariant) => number,
): MessageVariant | null {
  const weights = ordered.map((variant) => Math.max(0.1, rank(variant)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.random() * total;
  for (let index = 0; index < ordered.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return ordered[index];
    }
  }
  return null;
}

/** Pick variant. */
export async function pickVariant(
  prisma: PrismaClient,
  workspaceId: string,
  family: VariantFamily,
  strategy?: VariantSelectionStrategy | null,
): Promise<MessageVariant> {
  const defaults = DEFAULT_VARIANTS[family].map(initialVariant);
  const keyPrefix = variantKeyPrefix(family);
  const stored = await loadStoredVariants(prisma, workspaceId, keyPrefix);
  const storedMap = buildStoredVariantMap(stored, family);
  const pool = resolveVariantPool(defaults, storedMap);
  const epsilon = resolveEpsilon();
  const rank = buildVariantRanker(strategy, family);

  const ordered = [...pool].sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    if (right !== left) {
      return right - left;
    }
    return a.uses - b.uses;
  });

  if (ordered.length > 1 && Math.random() < epsilon) {
    const sampled = weightedSamplePick(ordered, rank);
    if (sampled) {
      return sampled;
    }
  }

  return ordered[0];
}

interface DecisionLogInput {
  workspaceId: string;
  contactId?: string;
  phone?: string;
  variantKey?: string | null;
  intent: string;
  message?: string;
  outcome: VariantOutcome;
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

/** Record decision log. */
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

/** Update variant outcome. */
export async function updateVariantOutcome(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    family: VariantFamily;
    variant: MessageVariant;
    outcome: VariantOutcome;
    revenue?: number;
  },
) {
  if (!prisma?.kloelMemory?.upsert) {
    return null;
  }

  const key = `cia_variant:${input.family}:${input.variant.key}`;
  const existing = prisma?.kloelMemory?.findUnique
    ? await prisma.kloelMemory
        .findUnique({
          where: {
            workspaceId_key: {
              workspaceId: input.workspaceId,
              key,
            },
          },
        })
        .catch(() => null /* not found */)
    : null;

  const current: MessageVariant = existing?.value
    ? {
        key: String(existing.value.key || input.variant.key),
        family: input.family,
        text: String(existing.value.text || input.variant.text),
        score: Number(existing.value.score || input.variant.score) || 1,
        uses: Number(existing.value.uses || input.variant.uses) || 0,
      }
    : input.variant;

  const next = applyOutcomeScore(current, input.outcome, input.revenue);

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key,
      },
    },
    update: {
      value: next as unknown as Prisma.InputJsonObject,
      content: next.text,
      metadata: {
        outcome: input.outcome,
        revenue: input.revenue || 0,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      key,
      value: next as unknown as Prisma.InputJsonObject,
      category: 'cia_variant',
      type: input.family,
      content: next.text,
      metadata: {
        outcome: input.outcome,
        revenue: input.revenue || 0,
      },
    },
  });

  return next;
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

/** Compute learning snapshot. */
export async function computeLearningSnapshot(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<LearningSnapshot> {
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
