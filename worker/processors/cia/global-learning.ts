/**
 * ARCHITECTURAL COHESION: CIA Global Learning — a single analytical pipeline for cross-
 * workspace pattern extraction. Identifies high-performing variant patterns that work across
 * workspaces, computes cross-account aggregates, and promotes winning strategies to global
 * defaults. The aggregation, scoring, and promotion steps are sequential and lossy when
 * separated — each depends on the full intermediate dataset from the prior step.
 */

const DIACRITICS_RE = /[\u0300-\u036f]/g;
const NON_TOKEN_RE = /[^a-z0-9]+/g;
const EDGE_UNDERSCORE_RE = /^_+|_+$/g;
const PRICE_RE = /r\$|preco|preço|valor|pix|boleto/i;
/** Global learning signal shape. */
export interface GlobalLearningSignal {
  domain: string;
  intent: string;
  outcome: string;
  hour: number;
  messageLength: number;
  lengthBucket: 'short' | 'medium' | 'long';
  hasPriceMention: boolean;
  variantFamily: string | null;
  priorityBucket: 'low' | 'medium' | 'high';
  revenue: number;
}

export interface GlobalLearningPattern {
  domain: string;
  intent: string;
  samples: number;
  soldRate: number;
  repliedRate: number;
  revenuePerSignal: number;
  bestHour: number | null;
  preferredLength: 'short' | 'medium' | 'long';
  preferredVariantFamily: string | null;
  aggressiveness: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface MindAggressivenessOverride {
  aggressiveness: string;
  confidence: number;
  fallback: boolean;
}

type Aggressiveness = 'LOW' | 'MEDIUM' | 'HIGH';
type PreferredLength = 'short' | 'medium' | 'long';

function normalizeToken(value?: string | null): string {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(DIACRITICS_RE, '')
      .replace(NON_TOKEN_RE, '_')
      .replace(EDGE_UNDERSCORE_RE, '') || 'generic'
  );
}

function objectField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  const raw = source?.[key];
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

function lengthBucket(length: number): PreferredLength {
  if (length <= 90) {
    return 'short';
  }
  if (length <= 220) {
    return 'medium';
  }
  return 'long';
}

function priorityBucket(priority: number): 'low' | 'medium' | 'high' {
  if (priority >= 70) {
    return 'high';
  }
  if (priority >= 35) {
    return 'medium';
  }
  return 'low';
}

function variantFamily(variantKey?: string | null): string | null {
  const normalized = normalizeToken(variantKey);
  if (normalized.startsWith('payment')) {
    return 'payment_recovery';
  }
  if (normalized.startsWith('followup')) {
    return 'followup';
  }
  return normalized === 'generic' ? null : normalized;
}

function mostFrequentKey(values: Array<string | number | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function outcomeScore(outcome: string): number {
  if (outcome === 'sold') {
    return 4;
  }
  if (outcome === 'replied') {
    return 2;
  }
  return 0;
}

function bestHour(items: GlobalLearningSignal[]): number | null {
  const ranked = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    score: items
      .filter((item) => item.hour === hour)
      .reduce((sum, item) => sum + outcomeScore(item.outcome), 0),
  })).sort((left, right) => right.score - left.score)[0];
  return ranked?.score ? ranked.hour : null;
}

function mindAggressiveness(override?: MindAggressivenessOverride | null): Aggressiveness {
  if (!override || override.fallback || override.confidence < 0.4) {
    return 'LOW';
  }
  const value = override.aggressiveness.toUpperCase();
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : 'LOW';
}

export function inferWorkspaceDomain(providerSettings?: Record<string, unknown> | null): string {
  const businessInfo = objectField(providerSettings, 'businessInfo');
  const business = objectField(providerSettings, 'business');
  const onboarding = objectField(providerSettings, 'onboarding');
  return normalizeToken(
    String(
      providerSettings?.businessSegment ||
        providerSettings?.segment ||
        providerSettings?.businessType ||
        businessInfo?.segment ||
        businessInfo?.businessType ||
        business?.segment ||
        onboarding?.segment ||
        'generic',
    ),
  );
}

export function anonymizeDecisionLog(input: {
  domain: string;
  log: {
    createdAt?: string | Date;
    value?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}): GlobalLearningSignal | null {
  const value = input.log.value || {};
  const metadata = input.log.metadata || {};
  const valueMeta =
    value.metadata && typeof value.metadata === 'object'
      ? (value.metadata as Record<string, unknown>)
      : {};
  const intent = normalizeToken(String(value.intent || metadata.intent || 'generic'));
  if (!intent) {
    return null;
  }

  const message = String(value.message || '');
  const createdAt = input.log.createdAt ? new Date(input.log.createdAt) : new Date();
  const priority = Number(value.priority || metadata.priority || 0) || 0;
  const revenue = Number(valueMeta.revenue || metadata.revenue || value.revenue || 0) || 0;

  return {
    domain: normalizeToken(input.domain),
    intent,
    outcome: normalizeToken(String(value.outcome || metadata.outcome || 'unknown')),
    hour: Number.isFinite(createdAt.getUTCHours()) ? createdAt.getUTCHours() : 0,
    messageLength: message.length,
    lengthBucket: lengthBucket(message.length),
    hasPriceMention: PRICE_RE.test(message),
    variantFamily: variantFamily(String(value.variantKey || metadata.variantKey || '')),
    priorityBucket: priorityBucket(priority),
    revenue,
  };
}

function patternFor(key: string, items: GlobalLearningSignal[]): GlobalLearningPattern {
  const [domain, intent] = key.split(':');
  const samples = items.length;
  const sold = items.filter((item) => item.outcome === 'sold').length;
  const replied = items.filter(
    (item) => item.outcome === 'sold' || item.outcome === 'replied',
  ).length;
  const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
  return {
    domain,
    intent,
    samples,
    soldRate: Number((sold / Math.max(1, samples)).toFixed(4)),
    repliedRate: Number((replied / Math.max(1, samples)).toFixed(4)),
    revenuePerSignal: Number((revenue / Math.max(1, samples)).toFixed(2)),
    bestHour: bestHour(items),
    preferredLength: (mostFrequentKey(items.map((item) => item.lengthBucket)) ||
      'medium') as PreferredLength,
    preferredVariantFamily: mostFrequentKey(items.map((item) => item.variantFamily)),
    aggressiveness: 'LOW',
  };
}

export function computeGlobalPatterns(signals: GlobalLearningSignal[]): GlobalLearningPattern[] {
  const grouped = new Map<string, GlobalLearningSignal[]>();
  for (const signal of signals) {
    const key = `${signal.domain}:${signal.intent}`;
    grouped.set(key, [...(grouped.get(key) || []), signal]);
  }
  return [...grouped.entries()]
    .map(([key, items]) => patternFor(key, items))
    .sort(
      (left, right) =>
        right.revenuePerSignal - left.revenuePerSignal || right.samples - left.samples,
    );
}

/**
 * @deprecated Decision authority migrated to MindService.resolveBestVariant (backend).
 * Kept as pure aggregation for training data only. See ADR 0004.
 */
export function buildGlobalStrategy(input: {
  patterns: GlobalLearningPattern[];
  domain: string;
  intent: string;
  mindOverride?: MindAggressivenessOverride | null;
}) {
  const domain = normalizeToken(input.domain);
  const intent = normalizeToken(input.intent);
  const pattern =
    input.patterns.find((item) => item.domain === domain && item.intent === intent) ||
    input.patterns.find((item) => item.domain === domain) ||
    input.patterns.find((item) => item.domain === 'generic') ||
    null;

  return {
    domain: pattern?.domain || domain,
    intent: pattern?.intent || intent,
    preferredLength: pattern?.preferredLength || ('medium' as const),
    bestHour: pattern?.bestHour ?? null,
    aggressiveness: input.mindOverride ? mindAggressiveness(input.mindOverride) : 'MEDIUM',
    preferredVariantFamily: pattern?.preferredVariantFamily || null,
    confidence: Number(Math.min((pattern?.samples || 0) / 25, 1).toFixed(3)),
  };
}

export async function persistGlobalPatterns(
  redisClient: { set?: (key: string, value: string) => Promise<string | null> } | null | undefined,
  patterns: GlobalLearningPattern[],
) {
  if (!redisClient?.set) {
    return null;
  }
  const payload = { updatedAt: new Date().toISOString(), patterns };
  await redisClient.set('cia:global-patterns:v1', JSON.stringify(payload));
  return payload;
}
