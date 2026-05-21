/**
 * UTP-CREATOR-006 — Creator Trust Capital Tracker Spec
 *
 * Full scenario coverage for CreatorTrustCapitalTrackerService:
 * increments on positive conversions, decrements on disengagement.
 */

import { CreatorTrustCapitalTrackerService, type CreatorTrustConfig } from './creator-trust-capital.tracker';

import type { CreatorEvent } from './types';
import type { TrustState } from '../trust/trust.types';

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

function ts(over?: Partial<TrustState>): TrustState {
  return {
    trustScore: over?.trustScore ?? 0.75,
    fatigueLevel: over?.fatigueLevel ?? 0,
    desperationLevel: over?.desperationLevel ?? 0,
    lastInteractionAt: over?.lastInteractionAt ?? new Date(NOW).toISOString(),
    silentInteractionsCount: over?.silentInteractionsCount ?? 0,
    brandRiskFlags: over?.brandRiskFlags ?? [],
  };
}

describe('CreatorTrustCapitalTrackerService (UTP-CREATOR-006) — full spec', () => {
  let tracker: CreatorTrustCapitalTrackerService;

  beforeEach(() => {
    tracker = new CreatorTrustCapitalTrackerService();
  });

  // ─── 1: default capital for new workspace ───────────────────────────
  it('returns default capital (0.6) with verdict "stable" for new workspace', () => {
    const state = tracker.getDefaultCapital('wks_default');
    expect(state.trustCapital).toBe(0.6);
    expect(state.verdict).toBe('stable');
    expect(state.workspaceId).toBe('wks_default');
  });

  // ─── 2: positive conversion events increase trust capital ───────────
  it('increments trust capital with positive interactions and high trust states', () => {
    const events: CreatorEvent[] = Array.from({ length: 12 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive', payload: { messageBody: 'Adorei!' } }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.9 })];
    const result = tracker.trackCapital('wks_positive', events, states);
    expect(result.trustCapital).toBeGreaterThan(0.6);
    expect(result.audienceTrust).toBeGreaterThan(0.7);
    expect(result.consistencyScore).toBeGreaterThan(0.5);
  });

  // ─── 3: conversion event explicitly boosts capital ──────────────────
  it('increments trust capital when commerce.lead.converted events present', () => {
    const events: CreatorEvent[] = [
      ...Array.from({ length: 6 }, () =>
        ev({ eventName: 'commerce.lead.replied', valence: 'positive', payload: { messageBody: 'Bom!' } }),
      ),
      ev({ eventName: 'commerce.lead.converted', valence: 'positive', payload: { messageBody: 'Vou comprar!' } }),
    ];
    const states: TrustState[] = [ts({ trustScore: 0.8 })];
    const result = tracker.trackCapital('wks_converted', events, states);
    expect(result.trustCapital).toBeGreaterThan(0.6);
    expect(result.verdict).not.toBe('depleted');
  });

  // ─── 4: capital decrements with negative valence events ─────────────
  it('decrements trust capital with multiple negative valence events', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.5 })];
    const result = tracker.trackCapital('wks_negative', events, states);
    expect(result.authenticityIndex).toBeLessThan(0.5);
    expect(result.consistencyScore).toBeLessThan(0.5);
  });

  // ─── 5: capital decrements with objection_raised events ─────────────
  it('decrements authenticity index from objections', () => {
    const events: CreatorEvent[] = Array.from({ length: 8 }, () =>
      ev({ eventName: 'commerce.lead.objection_raised' }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.6 })];
    const result = tracker.trackCapital('wks_objections', events, states);
    expect(result.authenticityIndex).toBeLessThan(0.4);
    expect(result.trustCapital).toBeLessThan(0.6);
  });

  // ─── 6: capital decrements with went_silent events ──────────────────
  it('decrements recovery capacity for silence events', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.lead.went_silent' }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.7 })];
    const result = tracker.trackCapital('wks_silent', events, states);
    expect(result.recoveryCapacity).toBeLessThan(0.8);
  });

  // ─── 7: verdict is "strong" when all indicators are high ────────────
  it('returns verdict "strong" with high trust and positive signals', () => {
    const events: CreatorEvent[] = Array.from({ length: 15 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive', payload: { messageBody: 'Conteúdo incrível!' } }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.95 })];
    const result = tracker.trackCapital('wks_strong', events, states);
    expect(result.verdict).toBe('strong');
    expect(result.trustCapital).toBeGreaterThan(0.7);
  });

  // ─── 8: verdict is "depleted" with heavy disengagement ──────────────
  it('returns verdict "depleted" with heavy negative signals and low trust', () => {
    const events: CreatorEvent[] = [
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    ];
    const states: TrustState[] = [ts({ trustScore: 0.1 })];
    const result = tracker.trackCapital('wks_depleted', events, states);
    expect(result.verdict).toBe('depleted');
    expect(result.trustCapital).toBeLessThan(0.3);
  });

  // ─── 9: verdict is "eroding" with mixed signals ─────────────────────
  it('returns verdict "eroding" with moderate negative signal buildup', () => {
    const events: CreatorEvent[] = [
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
    ];
    const states: TrustState[] = [ts({ trustScore: 0.4 })];
    const result = tracker.trackCapital('wks_eroding', events, states);
    expect(result.verdict).toBe('eroding');
    expect(result.trustCapital).toBeLessThan(0.5);
  });

  // ─── 10: isolated capital across workspaces ──────────────────────────
  it('isolates trust capital per workspace', () => {
    const negativeEvents: CreatorEvent[] = Array.from({ length: 8 }, () =>
      ev({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
    );
    const positiveEvents: CreatorEvent[] = Array.from({ length: 8 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
    );

    tracker.trackCapital('wks_a', negativeEvents, [ts({ trustScore: 0.2 })]);
    tracker.trackCapital('wks_b', positiveEvents, [ts({ trustScore: 0.9 })]);

    const stateA = tracker.getState('wks_a');
    const stateB = tracker.getState('wks_b');
    expect(stateA).toBeDefined();
    expect(stateB).toBeDefined();
    expect(stateA!.trustCapital).toBeLessThan(stateB!.trustCapital);
  });

  // ─── 11: getState returns previously tracked state ──────────────────
  it('getState returns exact result from prior trackCapital call', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      ev({ valence: 'positive' }),
    );
    const states: TrustState[] = [ts()];
    const tracked = tracker.trackCapital('wks_persist', events, states);
    const stored = tracker.getState('wks_persist');
    expect(stored).toBeDefined();
    expect(stored!.trustCapital).toBe(tracked.trustCapital);
    expect(stored!.verdict).toBe(tracked.verdict);
    expect(stored!.workspaceId).toBe('wks_persist');
  });

  // ─── 12: recommendation fidelity computed from endorsement signals ──
  it('computes recommendation fidelity from endorsement keywords', () => {
    const events: CreatorEvent[] = [
      ev({ payload: { messageBody: 'Eu recomendo esse produto!' } }),
      ev({ payload: { messageBody: 'Conteúdo orgânico sobre aprendizado' } }),
      ev({ payload: { messageBody: 'Reflexão pessoal sobre carreira' } }),
      ev({ payload: { messageBody: 'Excelente parceria!' } }),
    ];
    const states: TrustState[] = [ts({ trustScore: 0.8 })];
    const result = tracker.trackCapital('wks_fidelity', events, states);
    expect(result.recommendationFidelity).toBeGreaterThan(0);
    expect(result.recommendationFidelity).toBeLessThan(1);
  });

  // ─── 13: audience retention rate computed from window ───────────────
  it('computes audience retention rate from recent positive interactions', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
    );
    const states: TrustState[] = [ts({ trustScore: 0.8 })];
    const result = tracker.trackCapital('wks_retention', events, states);
    expect(result.audienceRetentionRate).toBeGreaterThan(0);
    expect(result.audienceRetentionRate).toBeLessThanOrEqual(1);
  });

  // ─── 14: recovery capacity improves with replies after silence ──────
  it('improves recovery capacity when replies follow silence events', () => {
    const events: CreatorEvent[] = [
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ev({ eventName: 'commerce.lead.went_silent' }),
      ev({ eventName: 'commerce.lead.replied', valence: 'positive' }),
    ];
    const states: TrustState[] = [ts({ trustScore: 0.7 })];
    const result = tracker.trackCapital('wks_recovery', events, states);
    expect(result.recoveryCapacity).toBeGreaterThan(0);
    expect(result.recoveryCapacity).toBeLessThanOrEqual(1);
  });

  // ─── 15: all CreatorTrustCapital fields populated ───────────────────
  it('returns all CreatorTrustCapital fields populated', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      ev({ valence: 'positive' }),
    );
    const states: TrustState[] = [ts()];
    const result = tracker.trackCapital('wks_full', events, states);
    expect(result.workspaceId).toBe('wks_full');
    expect(result.trustCapital).toBeDefined();
    expect(result.audienceTrust).toBeDefined();
    expect(result.authenticityIndex).toBeDefined();
    expect(result.consistencyScore).toBeDefined();
    expect(result.recommendationFidelity).toBeDefined();
    expect(result.recoveryCapacity).toBeDefined();
    expect(result.audienceRetentionRate).toBeDefined();
    expect(result.verdict).toBeDefined();
    expect(result.reason).toBeTruthy();
    expect(result.generatedAt).toBeTruthy();
  });

  // ─── 16: empty events produce valid capital with trust states ───────
  it('produces valid capital from trust states alone when events are empty', () => {
    const events: CreatorEvent[] = [];
    const states: TrustState[] = [ts({ trustScore: 0.7 })];
    const result = tracker.trackCapital('wks_no_events', events, states);
    expect(result.trustCapital).toBeDefined();
    expect(result.audienceTrust).toBeGreaterThan(0);
  });
});
