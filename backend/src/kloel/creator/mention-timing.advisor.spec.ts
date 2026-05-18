/**
 * UTP-CREATOR-002 — Mention Timing Advisor Spec
 *
 * Full scenario coverage for adviseMentionTiming: now / wait / pause
 * based on saturationIndex and receptivityScore.
 */

import { adviseMentionTiming, type MentionHistoryEntry, type TimingConfig } from './mention-timing.advisor';

import type { CreatorEvent } from './types';

const NOW = Date.parse('2026-05-14T00:00:00.000Z');

function ev(over: Partial<CreatorEvent> = {}): CreatorEvent {
  return {
    eventId: over.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    occurredAt: over.occurredAt ?? new Date(NOW).toISOString(),
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
  };
}

function hist(
  daysAgo: number,
  over: Partial<MentionHistoryEntry> = {},
): MentionHistoryEntry {
  return {
    mentionedAt: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    partnerId: over.partnerId ?? 'prt_001',
    engagementCount: over.engagementCount ?? 5,
  };
}

describe('MentionTimingAdvisor (UTP-CREATOR-002) — full spec', () => {
  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
  // ─── 1: 'now' with high receptivity ────────────────────────────────
  it('returns "now" when receptivity >= 0.7 and days since last mention >= ideal', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ valence: 'positive', payload: { messageBody: 'Adorei!' } }),
    );
    const timing = adviseMentionTiming(events, [hist(4)]);
    expect(timing.recommendation).toBe('now');
    expect(timing.mentionReady).toBe(true);
    expect(timing.optimalWindow).toBe(true);
  });

  // ─── 2: 'now' for first-time mention with good engagement ──────────
  it('returns "now" for first mention with plenty of engagement', () => {
    const events: CreatorEvent[] = Array.from({ length: 15 }, () =>
      ev({ valence: 'positive', payload: { messageBody: 'Muito bom!' } }),
    );
    const timing = adviseMentionTiming(events, []);
    expect(timing.recommendation).toBe('now');
    expect(timing.daysSinceLastMention).toBe(999);
  });

  // ─── 3: 'wait' when too soon since last mention ────────────────────
  it('returns "wait" when days since last mention < minDaysBetweenMentions', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ valence: 'positive', payload: { messageBody: 'Excelente!' } }),
    );
    const timing = adviseMentionTiming(events, [hist(0.5)]);
    expect(timing.recommendation).toBe('wait');
    expect(timing.mentionReady).toBe(false);
  });

  // ─── 4: 'wait' when engagement since last mention is too low ───────
  it('returns "wait" when engagement since last mention < minEngagementBeforeMention', () => {
    const events: CreatorEvent[] = [ev({ eventName: 'commerce.lead.went_silent' })];
    const timing = adviseMentionTiming(events, [hist(10)]);
    expect(timing.recommendation).toBe('wait');
  });

  // ─── 5: 'wait' when receptivity is moderate and days not yet ideal ─
  it('returns "wait" when receptivity moderate and days < idealDaysBetweenMentions', () => {
    const events: CreatorEvent[] = [
      ev({ valence: 'positive' }),
      ev({ valence: 'negative' }),
      ev({ valence: 'positive' }),
      ev({ valence: 'negative' }),
    ];
    const timing = adviseMentionTiming(events, [hist(2)]);
    expect(timing.recommendation).toBe('wait');
  });

  // ─── 6: 'pause' when saturationIndex >= pause threshold ────────────
  it('returns "pause" when saturationIndex >= saturationPauseThreshold (0.6)', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio com desconto' } }),
      ev({ payload: { messageBody: 'cupom exclusivo' } }),
      ev({ payload: { messageBody: 'oferta imperdível' } }),
      ev({ payload: { messageBody: 'patrocinado' } }),
      ev({ payload: { messageBody: 'parceria com cupom' } }),
      ev({ payload: { messageBody: 'use meu código' } }),
      ev({ payload: { messageBody: 'link de afiliado' } }),
      ev({ payload: { messageBody: 'garantia total' } }),
    ];
    const timing = adviseMentionTiming(events, [hist(5)]);
    expect(timing.recommendation).toBe('pause');
  });

  // ─── 7: 'pause' when maximum consecutive promotions reached ────────
  it('returns "pause" when recent promotions >= maxConsecutivePromotions (5)', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio' } }),
      ev({ payload: { messageBody: 'cupom hoje' } }),
      ev({ payload: { messageBody: 'desconto especial' } }),
      ev({ payload: { messageBody: 'oferta válida' } }),
      ev({ payload: { messageBody: 'patrocinado por X' } }),
    ];
    const timing = adviseMentionTiming(events, [hist(10)]);
    expect(timing.recommendation).toBe('pause');
  });

  // ─── 8: 'pause' when receptivity < 0.3 ─────────────────────────────
  it('returns "pause" when audience receptivity < 0.3', () => {
    const events: CreatorEvent[] = Array.from({ length: 20 }, () =>
      ev({ valence: 'negative', eventName: 'commerce.lead.went_silent' }),
    );
    const timing = adviseMentionTiming(events, [hist(10)]);
    expect(timing.recommendation).toBe('pause');
  });

  // ─── 9: 'pause' when both saturation high and receptivity low ───────
  it('returns "pause" when saturation is high and receptivity is low simultaneously', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio' }, valence: 'negative' }),
      ev({ payload: { messageBody: 'cupom imperdível' }, valence: 'negative' }),
      ev({ payload: { messageBody: 'desconto de afiliado' } }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
    ];
    const timing = adviseMentionTiming(events, [hist(5)]);
    expect(timing.recommendation).toBe('pause');
  });

  // ─── 10: empty events produce valid result ──────────────────────────
  it('returns valid result with "wait" for empty events', () => {
    const timing = adviseMentionTiming([], [hist(2)]);
    expect(timing.recommendation).toBe('wait');
    expect(timing.saturationIndex).toBe(0);
    expect(timing.reason).toContain('waiting');
  });

  // ─── 11: daysSinceLastMention is Infinity when no history ───────────
  it('sets daysSinceLastMention to 999 when no mention history', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      ev({ valence: 'positive' }),
    );
    const timing = adviseMentionTiming(events, []);
    expect(timing.daysSinceLastMention).toBe(999);
  });

  // ─── 12: saturationIndex computed from promotion ratio ──────────────
  it('computes saturationIndex from promotion-to-event ratio', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio' } }),
      ev({ payload: { messageBody: 'cupom hoje' } }),
      ev({ payload: { messageBody: 'conteúdo orgânico' } }),
      ev({ payload: { messageBody: 'reflexão pessoal' } }),
    ];
    const timing = adviseMentionTiming(events, [hist(10)]);
    expect(timing.saturationIndex).toBeCloseTo(0.5, 1);
  });

  // ─── 13: all required fields are populated ──────────────────────────
  it('returns all MentionTiming fields populated', () => {
    const events: CreatorEvent[] = Array.from({ length: 8 }, () =>
      ev({ valence: 'positive', payload: { messageBody: 'Gostei!' } }),
    );
    const timing = adviseMentionTiming(events, [hist(4)]);
    expect(timing.mentionReady).toBeDefined();
    expect(timing.optimalWindow).toBeDefined();
    expect(timing.saturationIndex).toBeDefined();
    expect(timing.daysSinceLastMention).toBeDefined();
    expect(timing.engagementSinceLastMention).toBeDefined();
    expect(timing.audienceReceptivity).toBeDefined();
    expect(timing.recommendation).toBeDefined();
    expect(timing.reason).toBeTruthy();
    expect(timing.generatedAt).toBeTruthy();
  });

  // ─── 14: custom config overrides defaults ───────────────────────────
  it('respects custom TimingConfig overrides', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ valence: 'positive', payload: { messageBody: 'Bom!' } }),
    );
    const custom: Partial<TimingConfig> = {
      minDaysBetweenMentions: 10,
      idealDaysBetweenMentions: 14,
    };
    const timing = adviseMentionTiming(events, [hist(5)], custom);
    expect(timing.recommendation).toBe('wait');
  });

  // ─── 15: 'pause' when saturationIndex >= custom threshold ───────────
  it('returns "pause" with lowered custom saturationPauseThreshold', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio' } }),
      ev({ payload: { messageBody: 'cupom' } }),
      ev({ payload: { messageBody: 'orgânico' } }),
    ];
    const custom: Partial<TimingConfig> = { saturationPauseThreshold: 0.3 };
    const timing = adviseMentionTiming(events, [hist(10)], custom);
    expect(timing.recommendation).toBe('pause');
  });

  // ─── 16: reason reflects recommendation correctly ───────────────────
  it('includes saturation and receptivity in reason string', () => {
    const events: CreatorEvent[] = Array.from({ length: 6 }, () =>
      ev({ payload: { messageBody: 'link na bio com cupom' } }),
    );
    const timing = adviseMentionTiming(events, []);
    expect(timing.reason).toBeTruthy();
    expect(typeof timing.reason).toBe('string');
  });
});
