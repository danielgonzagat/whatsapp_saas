const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /^_+|_+$/g;
const R___PRECO_PRE_O_VALOR_PI_RE = /r\$|preco|preço|valor|pix|boleto/i;
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

function normalizeToken(value?: string | null) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(A_Z0_9_RE, '_')
      .replace(PATTERN_RE, '') || 'generic'
  );
}

function toLengthBucket(length: number): 'short' | 'medium' | 'long' {
  if (length <= 90) return 'short';
  if (length <= 220) return 'medium';
  return 'long';
}

function toPriorityBucket(priority: number): 'low' | 'medium' | 'high' {
  if (priority >= 70) return 'high';
  if (priority >= 35) return 'medium';
  return 'low';
}

function inferVariantFamily(variantKey?: string | null) {
  const normalized = normalizeToken(variantKey);
  if (normalized.startsWith('payment')) return 'payment_recovery';
  if (normalized.startsWith('followup')) return 'followup';
  return normalized === 'generic' ? null : normalized;
}

export function inferWorkspaceDomain(providerSettings?: Record<string, unknown> | null): string {
  const bInfo = (
    providerSettings?.businessInfo && typeof providerSettings.businessInfo === 'object'
      ? providerSettings.businessInfo
      : null
  ) as Record<string, unknown> | null;
  const biz = (
    providerSettings?.business && typeof providerSettings.business === 'object'
      ? providerSettings.business
      : null
  ) as Record<string, unknown> | null;
  const onb = (
    providerSettings?.onboarding && typeof providerSettings.onboarding === 'object'
      ? providerSettings.onboarding
      : null
  ) as Record<string, unknown> | null;
  const direct =
    providerSettings?.businessSegment ||
    providerSettings?.segment ||
    providerSettings?.businessType ||
    bInfo?.segment ||
    bInfo?.businessType ||
    biz?.segment ||
    onb?.segment;

  return normalizeToken(String(direct || 'generic'));
}

export function anonymizeDecisionLog(input: {
  domain: string;
  log: {
    createdAt?: string | Date;
    value?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}): GlobalLearningSignal | null {
  const value = (input.log?.value || {}) as Record<string, unknown>;
  const metadata = (input.log?.metadata || {}) as Record<string, unknown>;
  const valueMeta = (
    value.metadata && typeof value.metadata === 'object' ? value.metadata : {}
  ) as Record<string, unknown>;
  const intent = normalizeToken(String(value.intent || metadata.intent || 'generic'));
  if (!intent) return null;

  const message = String(value.message || '');
  const messageLength = message.length;
  const createdAt = input.log?.createdAt ? new Date(input.log.createdAt) : new Date();
  const hour = Number.isFinite(createdAt.getUTCHours()) ? createdAt.getUTCHours() : 0;
  const revenue = Number(valueMeta.revenue || metadata.revenue || value.revenue || 0) || 0;
  const priority = Number(value.priority || metadata.priority || 0) || 0;

  return {
    domain: normalizeToken(String(input.domain)),
    intent,
    outcome: normalizeToken(String(value.outcome || metadata.outcome || 'unknown')),
    hour,
    messageLength,
    lengthBucket: toLengthBucket(messageLength),
    hasPriceMention: R___PRECO_PRE_O_VALOR_PI_RE.test(message),
    variantFamily: inferVariantFamily(String(value.variantKey || metadata.variantKey || '')),
    priorityBucket: toPriorityBucket(priority),
    revenue,
  };
}

export function computeGlobalPatterns(signals: GlobalLearningSignal[]): GlobalLearningPattern[] {
  const grouped = new Map<string, GlobalLearningSignal[]>();

  for (const signal of signals) {
    const key = `${signal.domain}:${signal.intent}`;
    const current = grouped.get(key) || [];
    current.push(signal);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const [domain, intent] = key.split(':');
      const samples = items.length;
      const sold = items.filter((item) => item.outcome === 'sold').length;
      const replied = items.filter((item) => ['replied', 'sold'].includes(item.outcome)).length;
      const revenue = items.reduce((sum, item) => sum + item.revenue, 0);
      const bestHourEntry = [...Array.from({ length: 24 }, (_, hour) => hour)]
        .map((hour) => ({
          hour,
          score: items
            .filter((item) => item.hour === hour)
            .reduce(
              (sum, item) =>
                sum + (item.outcome === 'sold' ? 4 : item.outcome === 'replied' ? 2 : 0),
              0,
            ),
        }))
        .sort((left, right) => right.score - left.score)[0];

      const bucketFrequency = items.reduce<Record<string, number>>((acc, item) => {
        acc[item.lengthBucket] = (acc[item.lengthBucket] || 0) + 1;
        return acc;
      }, {});
      const variantFrequency = items.reduce<Record<string, number>>((acc, item) => {
        if (!item.variantFamily) return acc;
        acc[item.variantFamily] = (acc[item.variantFamily] || 0) + 1;
        return acc;
      }, {});

      const preferredLength = (Object.entries(bucketFrequency).sort(
        (left, right) => right[1] - left[1],
      )[0]?.[0] || 'medium') as GlobalLearningPattern['preferredLength'];
      const preferredVariantFamily =
        Object.entries(variantFrequency).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
      const soldRate = Number((sold / Math.max(samples, 1)).toFixed(4));
      const repliedRate = Number((replied / Math.max(samples, 1)).toFixed(4));
      const revenuePerSignal = Number((revenue / Math.max(samples, 1)).toFixed(2));
      const aggressiveness: GlobalLearningPattern['aggressiveness'] =
        soldRate >= 0.3 || revenuePerSignal >= 150
          ? 'HIGH'
          : soldRate >= 0.15 || repliedRate >= 0.4
            ? 'MEDIUM'
            : 'LOW';

      return {
        domain,
        intent,
        samples,
        soldRate,
        repliedRate,
        revenuePerSignal,
        bestHour: bestHourEntry?.score ? bestHourEntry.hour : null,
        preferredLength,
        preferredVariantFamily,
        aggressiveness,
      };
    })
    .sort((left, right) => {
      if (right.revenuePerSignal !== left.revenuePerSignal) {
        return right.revenuePerSignal - left.revenuePerSignal;
      }
      if (right.soldRate !== left.soldRate) {
        return right.soldRate - left.soldRate;
      }
      return right.samples - left.samples;
    });
}

export function buildGlobalStrategy(input: {
  patterns: GlobalLearningPattern[];
  domain: string;
  intent: string;
}) {
  const domainKey = normalizeToken(input.domain);
  const intentKey = normalizeToken(input.intent);
  const pattern =
    input.patterns.find((item) => item.domain === domainKey && item.intent === intentKey) ||
    input.patterns.find((item) => item.domain === domainKey) ||
    input.patterns.find((item) => item.domain === 'generic') ||
    null;

  if (!pattern) {
    return {
      domain: domainKey,
      intent: intentKey,
      preferredLength: 'medium' as const,
      bestHour: null,
      aggressiveness: 'LOW' as const,
      preferredVariantFamily: null,
      confidence: 0,
    };
  }

  return {
    domain: pattern.domain,
    intent: pattern.intent,
    preferredLength: pattern.preferredLength,
    bestHour: pattern.bestHour,
    aggressiveness: pattern.aggressiveness,
    preferredVariantFamily: pattern.preferredVariantFamily,
    confidence: Number(Math.min(pattern.samples / 25, 1).toFixed(3)),
  };
}

export async function persistGlobalPatterns(
  redisClient: { set?: (key: string, value: string) => Promise<string | null> } | null | undefined,
  patterns: GlobalLearningPattern[],
) {
  if (!redisClient?.set) return null;
  const payload = {
    updatedAt: new Date().toISOString(),
    patterns,
  };
  await redisClient.set('cia:global-patterns:v1', JSON.stringify(payload));
  return payload;
}
