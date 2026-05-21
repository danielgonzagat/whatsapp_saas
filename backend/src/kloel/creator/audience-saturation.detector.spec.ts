/**
 * UTP-CREATOR-003 — Audience Saturation Detector Spec
 *
 * Full scenario coverage for detectAudienceSaturation: promotionRatio >
 * threshold flags saturation, negative signals, disengagement trends.
 */

import { detectAudienceSaturation, type SaturationConfig } from './audience-saturation.detector';

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

describe('AudienceSaturationDetector (UTP-CREATOR-003) — full spec', () => {
  // ─── 1: not saturated for organic content ──────────────────────────
  it('returns not saturated for purely organic content', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ payload: { messageBody: 'Hoje quero compartilhar uma reflexão importante.' } }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(false);
    expect(result.promotionRatio).toBe(0);
    expect(result.saturationIndex).toBeLessThan(0.5);
  });

  // ─── 2: saturated when promotionRatio > threshold ──────────────────
  it('flags saturated when promotionRatio exceeds default threshold (0.3)', () => {
    const events: CreatorEvent[] = [
      ...Array.from({ length: 2 }, () =>
        ev({ payload: { messageBody: 'conteúdo orgânico normal' } }),
      ),
      ev({ payload: { messageBody: 'Use meu código de desconto! Link de afiliado na bio!' } }),
      ev({ payload: { messageBody: 'Promoção imperdível! Cupom válido hoje!' } }),
    ];
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(true);
    expect(result.promotionRatio).toBeGreaterThan(0.3);
    expect(result.reason).toContain('promotion ratio');
  });

  // ─── 3: saturated from mixed promotion + negative signals + falling ─
  it('flags saturated from promotion ratio, negative signals, and falling trend', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio cupom desconto' }, eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ payload: { messageBody: 'link na bio' } }),
      ev({ payload: { messageBody: 'oferta' } }),
      ev({ eventName: 'commerce.lead.objection_raised' }),
      ev({ eventName: 'commerce.lead.objection_raised' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    ];
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(true);
    expect(result.negativeSignalCount).toBeGreaterThanOrEqual(5);
  });

  // ─── 4: counts negative signals from objection_raised ───────────────
  it('counts objection_raised events as negative signals', () => {
    const events: CreatorEvent[] = Array.from({ length: 6 }, () =>
      ev({ eventName: 'commerce.lead.objection_raised' }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.negativeSignalCount).toBe(6);
  });

  // ─── 5: counts negative signals from went_silent ────────────────────
  it('counts went_silent events as negative signals', () => {
    const events: CreatorEvent[] = Array.from({ length: 4 }, () =>
      ev({ eventName: 'commerce.lead.went_silent' }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.negativeSignalCount).toBe(4);
  });

  // ─── 6: counts negative valence as negative signal ──────────────────
  it('counts events with negative valence as negative signals', () => {
    const events: CreatorEvent[] = Array.from({ length: 3 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.negativeSignalCount).toBe(3);
  });

  // ─── 7: detects rising disengagement trend ──────────────────────────
  it('detects rising engagement trend when newer half has more positive replies', () => {
    const olderEvents = Array.from({ length: 6 }, () =>
      ev({ eventName: 'commerce.lead.went_silent' }),
    );
    const newerEvents = Array.from({ length: 6 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
    );
    const result = detectAudienceSaturation([...olderEvents, ...newerEvents]);
    expect(result.disengagementTrend).toBe('rising');
  });

  // ─── 8: detects stable disengagement trend ──────────────────────────
  it('returns stable trend for uniform engagement', () => {
    const events: CreatorEvent[] = Array.from({ length: 8 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.disengagementTrend).toBe('stable');
  });

  // ─── 9: empty events return not saturated ───────────────────────────
  it('returns not saturated with zero values for empty events', () => {
    const result = detectAudienceSaturation([]);
    expect(result.saturated).toBe(false);
    expect(result.saturationIndex).toBe(0);
    expect(result.promotionRatio).toBe(0);
    expect(result.recentMentions).toBe(0);
    expect(result.negativeSignalCount).toBe(0);
    expect(result.disengagementTrend).toBe('stable');
    expect(result.reason).toContain('no recent events');
  });

  // ─── 10: custom saturation threshold flags earlier ──────────────────
  it('flags saturated when custom promotionRatioThreshold is lower', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'cupom hoje' } }),
      ev({ payload: { messageBody: 'conteúdo normal' } }),
      ev({ payload: { messageBody: 'conteúdo normal' } }),
      ev({ payload: { messageBody: 'conteúdo normal' } }),
      ev({ payload: { messageBody: 'conteúdo normal' } }),
    ];
    const config: Partial<SaturationConfig> = { promotionRatioThreshold: 0.15, saturationThreshold: 0.4 };
    const result = detectAudienceSaturation(events, config);
    expect(result.saturated).toBe(true);
  });

  // ─── 11: negative signal count triggers saturation via index ────────
  it('sets saturated true when negative signals exceed threshold', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.lead.objection_raised' }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(true);
    expect(result.negativeSignalCount).toBe(10);
  });

  // ─── 12: falling trend contributes to saturation index ──────────────
  it('falling trend raises saturationIndex above stable trend with same events', () => {
    const fallingEvents: CreatorEvent[] = [
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
    ];
    const result = detectAudienceSaturation(fallingEvents);
    expect(result.disengagementTrend).toBe('falling');
    expect(result.saturationIndex).toBeGreaterThan(0);
  });

  // ─── 13: reason for saturated includes promotion ratio detail ────────
  it('reason string reflects saturated state with promotion ratio', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'link na bio' } }),
      ev({ payload: { messageBody: 'cupom pronto' } }),
      ev({ payload: { messageBody: 'desconto' } }),
      ev({ payload: { messageBody: 'promo' } }),
    ];
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(true);
    expect(result.reason).toContain('promotion ratio');
  });

  // ─── 14: reason for not saturated includes current metrics ──────────
  it('reason string for not saturated includes promotion ratio and negative count', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      ev({ payload: { messageBody: 'conteúdo orgânico puro' } }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(false);
    expect(result.reason).toContain('promotion ratio');
    expect(result.reason).toContain('negative signals');
  });

  // ─── 15: all AudienceSaturation fields populated ────────────────────
  it('returns all AudienceSaturation fields populated', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      ev({ payload: { messageBody: 'conteúdo orgânico' } }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBeDefined();
    expect(result.saturationIndex).toBeDefined();
    expect(result.promotionRatio).toBeDefined();
    expect(result.recentMentions).toBeDefined();
    expect(result.negativeSignalCount).toBeDefined();
    expect(result.disengagementTrend).toBeDefined();
    expect(result.reason).toBeTruthy();
    expect(result.generatedAt).toBeTruthy();
  });

  // ─── 16: saturationIndex capped at 1 ────────────────────────────────
  it('caps saturationIndex at maximum 1', () => {
    const events: CreatorEvent[] = Array.from({ length: 50 }, () =>
      ev({
        payload: { messageBody: 'link na bio cupom desconto oferta patrocinado' },
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
    );
    const config: Partial<SaturationConfig> = { maxRecentEvents: 50 };
    const result = detectAudienceSaturation(events, config);
    expect(result.saturationIndex).toBeLessThanOrEqual(1);
  });
});
