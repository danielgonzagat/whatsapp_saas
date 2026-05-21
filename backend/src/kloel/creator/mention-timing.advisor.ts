/**
 * UTP-CREATOR-002 — Mention Timing Advisor
 *
 * Advises on optimal timing for brand/partner mentions based on
 * audience engagement recency, mention cadence, saturation signals,
 * and receptivity indicators.
 *
 * Pure function — stateless. Input: recent events + mention history.
 * Output: MentionTiming.
 */

import type {
  CreatorEvent,
  MentionTiming,
  MentionTimingRecommendation,
} from './types';

export interface MentionHistoryEntry {
  readonly mentionedAt: string;
  readonly partnerId: string;
  readonly engagementCount: number;
}

export interface TimingConfig {
  readonly recentWindowMinutes: number;
  readonly minDaysBetweenMentions: number;
  readonly idealDaysBetweenMentions: number;
  readonly maxConsecutivePromotions: number;
  readonly minEngagementBeforeMention: number;
  readonly receptivityHighThreshold: number;
  readonly saturationPauseThreshold: number;
}

const DEFAULT_TIMING_CONFIG: TimingConfig = {
  recentWindowMinutes: 1440,
  minDaysBetweenMentions: 1,
  idealDaysBetweenMentions: 3,
  maxConsecutivePromotions: 5,
  minEngagementBeforeMention: 3,
  receptivityHighThreshold: 0.7,
  saturationPauseThreshold: 0.6,
};

function computeDaysSinceLastMention(
  history: readonly MentionHistoryEntry[],
  now: number,
): number {
  if (history.length === 0) return Infinity;

  const latest = history.reduce((max, h) => {
    const t = new Date(h.mentionedAt).getTime();
    return t > max ? t : max;
  }, 0);

  return (now - latest) / (1000 * 60 * 60 * 24);
}

function computeRecentPromotionCount(
  recentEvents: readonly CreatorEvent[],
): number {
  return recentEvents.filter((e) => {
    const text = extractMessageText(e);
    if (!text) return false;

    const lower = text.toLowerCase();
    const promoSignals = [
      'link na bio',
      'cupom',
      'desconto',
      'oferta',
      'patrocinado',
      'parceria',
      'use meu código',
      'link de afiliado',
      'garantia',
    ];
    return promoSignals.some((s) => lower.includes(s));
  }).length;
}

function computeEngagementSinceLastMention(
  recentEvents: readonly CreatorEvent[],
  history: readonly MentionHistoryEntry[],
  now: number,
): number {
  if (history.length === 0) return recentEvents.length;

  const latestMentionAt = history.reduce((max, h) => {
    const t = new Date(h.mentionedAt).getTime();
    return t > max ? t : max;
  }, 0);

  return recentEvents.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return t > latestMentionAt && t <= now;
  }).length;
}

function computeAudienceReceptivity(
  recentEvents: readonly CreatorEvent[],
): number {
  if (recentEvents.length === 0) return 0.5;

  const positiveCount = recentEvents.filter((e) =>
    e.valence === 'positive',
  ).length;

  const negativeCount = recentEvents.filter((e) =>
    e.valence === 'negative',
  ).length;

  const silenceCount = recentEvents.filter(
    (e) => e.eventName === 'commerce.lead.went_silent',
  ).length;

  const baseReceptivity = 0.5 + (positiveCount - negativeCount) * 0.05;
  const silencePenalty = Math.min(0.3, silenceCount * 0.1);

  return Math.max(0, Math.min(1, baseReceptivity - silencePenalty));
}

function determineRecommendation(
  daysSinceLastMention: number,
  saturationIndex: number,
  receptivity: number,
  recentPromotions: number,
  engagementSinceLast: number,
  config: TimingConfig,
): MentionTimingRecommendation {
  if (saturationIndex >= config.saturationPauseThreshold) return 'pause';
  if (recentPromotions >= config.maxConsecutivePromotions) return 'pause';
  if (engagementSinceLast < config.minEngagementBeforeMention) return 'wait';
  if (daysSinceLastMention < config.minDaysBetweenMentions) return 'wait';
  if (receptivity < 0.3) return 'pause';

  if (
    receptivity >= config.receptivityHighThreshold &&
    daysSinceLastMention >= config.idealDaysBetweenMentions
  ) {
    return 'now';
  }

  if (daysSinceLastMention >= config.idealDaysBetweenMentions) return 'now';

  return 'wait';
}

function buildReason(
  recommendation: MentionTimingRecommendation,
  daysSinceLastMention: number,
  saturationIndex: number,
  receptivity: number,
  recentPromotions: number,
  _engagementSinceLast: number,
): string {
  switch (recommendation) {
    case 'now':
      return `optimal timing: ${daysSinceLastMention >= 99 ? 'first mention' : `${daysSinceLastMention.toFixed(1)}d since last mention`}, receptivity ${receptivity.toFixed(2)}`;
    case 'wait':
      if (daysSinceLastMention >= 99) return 'not enough engagement data yet';
      return `waiting: ${daysSinceLastMention.toFixed(1)}d since last, receptivity ${receptivity.toFixed(2)}`;
    case 'pause':
      if (saturationIndex >= 0.6) return `pause: saturation index ${saturationIndex.toFixed(2)} too high`;
      if (recentPromotions >= 5) return `pause: ${recentPromotions} consecutive promotions`;
      return `pause: audience receptivity critically low (${receptivity.toFixed(2)})`;
    case 'never':
      return 'not recommended: audience engagement absent';
  }
}

/**
 * Advise on optimal mention timing for creator-audience relationship.
 */
export function adviseMentionTiming(
  recentEvents: readonly CreatorEvent[],
  mentionHistory: readonly MentionHistoryEntry[],
  config: Partial<TimingConfig> = {},
): MentionTiming {
  const cfg: TimingConfig = { ...DEFAULT_TIMING_CONFIG, ...config };
  const now = Date.now();

  const daysSinceLastMention = computeDaysSinceLastMention(mentionHistory, now);
  const recentPromotions = computeRecentPromotionCount(recentEvents);
  const engagementSinceLast = computeEngagementSinceLastMention(recentEvents, mentionHistory, now);
  const receptivity = computeAudienceReceptivity(recentEvents);
  const saturationIndex = recentEvents.length === 0
    ? 0
    : Math.min(1, recentPromotions / Math.max(1, recentEvents.length));

  const recommendation = determineRecommendation(
    daysSinceLastMention,
    saturationIndex,
    receptivity,
    recentPromotions,
    engagementSinceLast,
    cfg,
  );

  const mentionReady = recommendation === 'now';
  const optimalWindow = recommendation === 'now';

  return {
    mentionReady,
    optimalWindow,
    saturationIndex: parseFloat(saturationIndex.toFixed(3)),
    daysSinceLastMention: Math.min(999, parseFloat(daysSinceLastMention.toFixed(1))),
    engagementSinceLastMention: engagementSinceLast,
    audienceReceptivity: parseFloat(receptivity.toFixed(3)),
    recommendation,
    reason: buildReason(recommendation, daysSinceLastMention, saturationIndex, receptivity, recentPromotions, engagementSinceLast),
    generatedAt: new Date(now).toISOString(),
  };
}

function extractMessageText(ev: CreatorEvent): string | undefined {
  const p = ev.payload;
  if (!p) return undefined;
  if (typeof p['messageBody'] === 'string') return p['messageBody'] as string;
  if (typeof p['body'] === 'string') return p['body'] as string;
  if (typeof p['text'] === 'string') return p['text'] as string;
  return undefined;
}
