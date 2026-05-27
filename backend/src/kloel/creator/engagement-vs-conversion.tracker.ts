/**
 * UTP-CREATOR-005 — Engagement vs Conversion Tracker
 *
 * Tracks the balance between audience engagement (organic relationship
 * building) and conversion pressure (monetization attempts). A healthy
 * creator maintains engagement without burning conversion.
 *
 * Pure function — stateless. Input: recent events.
 * Output: EngagementVsConversion.
 */

import type {
  CreatorEvent,
  EngagementConversionBalance,
  EngagementVsConversion,
} from './types';

export interface EngagementConfig {
  readonly recentWindowMinutes: number;
  readonly maxRecentEvents: number;
  readonly healthyEngagementMinRate: number;
  readonly crisisConversionPressureThreshold: number;
  readonly leaningConversionThreshold: number;
}

const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  recentWindowMinutes: 7200,
  maxRecentEvents: 40,
  healthyEngagementMinRate: 0.4,
  crisisConversionPressureThreshold: 0.7,
  leaningConversionThreshold: 0.5,
};

const ENGAGEMENT_EVENTS = new Set([
  'commerce.lead.replied',
  'commerce.lead.qualified',
  'commerce.whatsapp.message_received',
  'commerce.whatsapp.message_replied',
]);

const CONVERSION_SIGNAL_KEYWORDS = [
  'comprar',
  'compre',
  'link na bio',
  'cupom',
  'desconto',
  'oferta',
  'patrocinado',
  'use meu código',
  'link de afiliado',
  'garantia',
  'clique aqui',
  'inscreva-se',
  'últimas vagas',
  'matricule-se',
];

const ORGANIC_SIGNAL_KEYWORDS = [
  'conteúdo',
  'compartilhar',
  'experiência',
  'aprender',
  'reflexão',
  'história',
  'processo',
  'jornada',
  'bastidores',
  'aprendizado',
  'dica',
  'erro',
];

function computeEngagementRate(events: readonly CreatorEvent[]): number {
  if (events.length === 0) {return 0;}

  const engagementReplies = events.filter((e) =>
    ENGAGEMENT_EVENTS.has(e.eventName) && e.valence === 'positive',
  ).length;

  return engagementReplies / events.length;
}

function computeConversionPressure(events: readonly CreatorEvent[]): number {
  if (events.length === 0) {return 0;}

  let conversionSignals = 0;
  for (const ev of events) {
    const text = extractMessageText(ev);
    if (!text) {continue;}
    const lower = text.toLowerCase();
    if (CONVERSION_SIGNAL_KEYWORDS.some((kw) => lower.includes(kw))) {
      conversionSignals += 1;
    }
  }

  return Math.min(1, conversionSignals / Math.max(1, events.length));
}

function computeOrganicRatio(events: readonly CreatorEvent[]): number {
  if (events.length === 0) {return 0.5;}

  let organicSignals = 0;
  for (const ev of events) {
    const text = extractMessageText(ev);
    if (!text) {continue;}
    const lower = text.toLowerCase();
    if (ORGANIC_SIGNAL_KEYWORDS.some((kw) => lower.includes(kw))) {
      organicSignals += 1;
    }
  }

  return Math.min(1, organicSignals / Math.max(1, events.length));
}

function computeResponseQuality(events: readonly CreatorEvent[]): number {
  if (events.length === 0) {return 0.5;}

  const positiveCount = events.filter((e) => e.valence === 'positive').length;
  const negativeCount = events.filter((e) => e.valence === 'negative').length;

  return Math.max(0, Math.min(1, 0.5 + (positiveCount - negativeCount) * 0.05));
}

function computeInteractionFrequency(events: readonly CreatorEvent[]): number {
  if (events.length < 2) {return 0;}

  let totalGapMs = 0;
  let gapCount = 0;

  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1]!.occurredAt).getTime();
    const curr = new Date(events[i]!.occurredAt).getTime();
    const gap = curr - prev;
    if (gap > 0) {
      totalGapMs += gap;
      gapCount += 1;
    }
  }

  if (gapCount === 0) {return 0;}
  const avgGapMinutes = totalGapMs / gapCount / (1000 * 60);
  const interactionsPerDay = 1440 / Math.max(1, avgGapMinutes);

  return Math.min(1, interactionsPerDay / 10);
}

function determineBalance(
  conversionPressure: number,
  engagementRate: number,
  config: EngagementConfig,
): EngagementConversionBalance {
  if (conversionPressure >= config.crisisConversionPressureThreshold) {return 'crisis';}
  if (conversionPressure >= config.leaningConversionThreshold) {return 'leaning_conversion';}
  if (engagementRate < config.healthyEngagementMinRate) {return 'leaning_engagement';}
  return 'healthy';
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
 * Track engagement versus conversion balance for a creator.
 */
export function trackEngagementVsConversion(
  recentEvents: readonly CreatorEvent[],
  config: Partial<EngagementConfig> = {},
): EngagementVsConversion {
  const cfg: EngagementConfig = { ...DEFAULT_ENGAGEMENT_CONFIG, ...config };
  const now = new Date().toISOString();

  const sampledEvents = recentEvents.slice(-cfg.maxRecentEvents);

  if (sampledEvents.length === 0) {
    return {
      engagementRate: 0,
      conversionPressure: 0,
      balance: 'healthy',
      organicRatio: 0.5,
      promotionRatio: 0,
      responseQuality: 0.5,
      interactionFrequency: 0,
      reason: 'no recent events to analyze',
      generatedAt: now,
    };
  }

  const engagementRate = computeEngagementRate(sampledEvents);
  const conversionPressure = computeConversionPressure(sampledEvents);
  const organicRatio = computeOrganicRatio(sampledEvents);
  const promotionRatio = 1 - organicRatio;
  const responseQuality = computeResponseQuality(sampledEvents);
  const interactionFrequency = computeInteractionFrequency(sampledEvents);
  const balance = determineBalance(conversionPressure, engagementRate, cfg);

  let reason: string;
  switch (balance) {
    case 'healthy':
      reason = `balanced: engagement ${engagementRate.toFixed(2)}, conversion pressure ${conversionPressure.toFixed(2)}`;
      break;
    case 'leaning_conversion':
      reason = `leaning toward conversion: pressure ${conversionPressure.toFixed(2)} exceeds ${cfg.leaningConversionThreshold}`;
      break;
    case 'leaning_engagement':
      reason = `engagement rate ${engagementRate.toFixed(2)} below healthy threshold ${cfg.healthyEngagementMinRate}`;
      break;
    case 'crisis':
      reason = `crisis: conversion pressure ${conversionPressure.toFixed(2)} exceeds crisis threshold ${cfg.crisisConversionPressureThreshold}`;
      break;
  }

  return {
    engagementRate: parseFloat(engagementRate.toFixed(3)),
    conversionPressure: parseFloat(conversionPressure.toFixed(3)),
    balance,
    organicRatio: parseFloat(organicRatio.toFixed(3)),
    promotionRatio: parseFloat(promotionRatio.toFixed(3)),
    responseQuality: parseFloat(responseQuality.toFixed(3)),
    interactionFrequency: parseFloat(interactionFrequency.toFixed(3)),
    reason,
    generatedAt: now,
  };
}
