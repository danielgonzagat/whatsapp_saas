/**
 * UTP-CREATOR-003 — Audience Saturation Detector
 *
 * Detects when an audience is overexposed to promotions, brand mentions,
 * or sponsored content. Measures promotion-to-organic ratio, negative
 * signal accumulation, and disengagement trends.
 *
 * Pure function — stateless. Input: recent events.
 * Output: AudienceSaturation.
 */

import type {
  AudienceSaturation,
  CreatorEvent,
  DisengagementTrend,
} from './types';

export interface SaturationConfig {
  readonly recentWindowMinutes: number;
  readonly maxRecentEvents: number;
  readonly saturationThreshold: number;
  readonly promotionRatioThreshold: number;
  readonly negativeSignalThreshold: number;
  readonly silenceDecayMinutes: number;
}

const DEFAULT_SATURATION_CONFIG: SaturationConfig = {
  recentWindowMinutes: 4320,
  maxRecentEvents: 50,
  saturationThreshold: 0.5,
  promotionRatioThreshold: 0.3,
  negativeSignalThreshold: 5,
  silenceDecayMinutes: 720,
};

const PROMOTION_SIGNALS = [
  'link na bio',
  'cupom',
  'desconto',
  'oferta',
  'patrocinado',
  'parceria',
  'use meu código',
  'link de afiliado',
  'promoção',
  'promo',
  'aproveite',
  'última chance',
  'condição especial',
];

function countPromotions(events: readonly CreatorEvent[]): number {
  let count = 0;
  for (const ev of events) {
    const text = extractMessageText(ev);
    if (!text) {continue;}

    const lower = text.toLowerCase();
    if (PROMOTION_SIGNALS.some((s) => lower.includes(s))) {
      count += 1;
    }
  }
  return count;
}

function countNegativeSignals(events: readonly CreatorEvent[]): number {
  return events.filter((e) => {
    if (e.eventName === 'commerce.lead.objection_raised') {return true;}
    if (e.eventName === 'commerce.lead.went_silent') {return true;}
    if (e.valence === 'negative') {return true;}
    return false;
  }).length;
}

function computeDisengagementTrend(
  events: readonly CreatorEvent[],
): DisengagementTrend {
  if (events.length < 4) {return 'stable';}

  const half = Math.floor(events.length / 2);
  const olderHalf = events.slice(0, half);
  const newerHalf = events.slice(half);

  const olderEngagement = olderHalf.filter((e) =>
    e.eventName === 'commerce.lead.replied' && e.valence === 'positive',
  ).length;

  const newerEngagement = newerHalf.filter((e) =>
    e.eventName === 'commerce.lead.replied' && e.valence === 'positive',
  ).length;

  const difference = newerEngagement - olderEngagement;

  if (difference > 1) {return 'rising';}
  if (difference < -1) {return 'falling';}
  return 'stable';
}

function extractMessageText(ev: CreatorEvent): string | undefined {
  const p = ev.payload;
  if (!p) {return undefined;}
  if (typeof p['messageBody'] === 'string') {return p['messageBody'];}
  if (typeof p['body'] === 'string') {return p['body'];}
  if (typeof p['text'] === 'string') {return p['text'];}
  return undefined;
}

/**
 * Detect audience saturation from recent events.
 */
export function detectAudienceSaturation(
  recentEvents: readonly CreatorEvent[],
  config: Partial<SaturationConfig> = {},
): AudienceSaturation {
  const cfg: SaturationConfig = { ...DEFAULT_SATURATION_CONFIG, ...config };
  const now = new Date().toISOString();

  const sampledEvents = recentEvents.slice(-cfg.maxRecentEvents);

  if (sampledEvents.length === 0) {
    return {
      saturated: false,
      saturationIndex: 0,
      promotionRatio: 0,
      recentMentions: 0,
      negativeSignalCount: 0,
      disengagementTrend: 'stable',
      reason: 'no recent events to analyze',
      generatedAt: now,
    };
  }

  const promotionCount = countPromotions(sampledEvents);
  const promotionRatio = sampledEvents.length > 0
    ? promotionCount / sampledEvents.length
    : 0;

  const negativeCount = countNegativeSignals(sampledEvents);
  const trend = computeDisengagementTrend(sampledEvents);

  const saturationIndex = Math.min(1,
    (promotionRatio / Math.max(0.01, cfg.promotionRatioThreshold)) * 0.5 +
    (negativeCount / Math.max(1, cfg.negativeSignalThreshold)) * 0.3 +
    (trend === 'falling' ? 0.2 : trend === 'rising' ? 0 : 0.1),
  );

  const saturated = saturationIndex >= cfg.saturationThreshold;

  let reason: string;
  if (saturated) {
    const parts: string[] = [];
    if (promotionRatio >= cfg.promotionRatioThreshold) {
      parts.push(`promotion ratio ${promotionRatio.toFixed(2)} exceeds threshold`);
    }
    if (negativeCount >= cfg.negativeSignalThreshold) {
      parts.push(`${negativeCount} negative signals detected`);
    }
    if (trend === 'falling') {
      parts.push('audience disengagement is falling');
    }
    reason = parts.join('; ') || 'saturation threshold reached';
  } else {
    reason = `promotion ratio ${promotionRatio.toFixed(2)}, ${negativeCount} negative signals, trend ${trend}`;
  }

  return {
    saturated,
    saturationIndex: parseFloat(saturationIndex.toFixed(3)),
    promotionRatio: parseFloat(promotionRatio.toFixed(3)),
    recentMentions: promotionCount,
    negativeSignalCount: negativeCount,
    disengagementTrend: trend,
    reason,
    generatedAt: now,
  };
}
