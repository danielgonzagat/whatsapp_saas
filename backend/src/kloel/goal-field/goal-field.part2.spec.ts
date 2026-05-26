import { GoalFieldService } from './goal-field.service';
import {
  GoalFieldShadowAccumulatorService,
  WorkspaceShadowState,
} from './goal-field.shadow-accumulator.service';
import type { SpineEventRef } from '../mind/mind.types';
import {
  hotLeadWithoutResponseDetector,
  abandonedCartDetector,
  repeatedObjectionDetector,
} from './detectors/commercial.detectors';
import { runtimeCriticalWithoutObservabilityDetector } from './detectors/cognitive.detectors';
import { backendWithoutSurfaceDetector } from './detectors/structural.detectors';
import { discountWithoutJustificationDetector } from './detectors/financial.detectors';
import { humanHandoffOverdueDetector, slowResponseDetector } from './detectors/operational-ux.detectors';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');

function ev(over: Partial<SpineEventRef>): SpineEventRef {
  const e: Record<string, unknown> = {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_demo',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  if ('entityRef' in over) {
    if (over.entityRef !== undefined) {e['entityRef'] = over.entityRef;}
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_1' };
  }
  if (over.valence !== undefined) {e['valence'] = over.valence;}
  if (over.payload !== undefined) {e['payload'] = over.payload;}
  if (over.correlationId !== undefined) {e['correlationId'] = over.correlationId;}
  return e as SpineEventRef;
}

describe('GoalFieldShadowAccumulatorService — reject blocking', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');

  it('single reject resets consecutive streak to 0', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 15; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    const afterReject = acc.recordDecision('wks_a', 'reject', T0 + 15 * 60_000);
    expect(afterReject.consecutiveAccepts).toBe(0);
    expect(afterReject.totalRejects).toBe(1);
    expect(afterReject.promotionEligible).toBe(false);
  });

  it('5 rejects in total blocks promotion (hard cap)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    // build 20 accepts first
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    // inject 5 rejects, each followed by an accept so ratio stays low
    for (let r = 0; r < 5; r++) {
      const t = T0 + (20 + r * 2) * 60_000;
      acc.recordDecision('wks_a', 'reject', t);
      acc.recordDecision('wks_a', 'accept', t + 30_000);
    }
    const final = acc.getState('wks_a');
    expect(final?.totalRejects).toBe(5);
    // 5 rejects hits the hard cap — blocked regardless of ratio
    expect(final?.promotionEligible).toBe(false);
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
  });

  it('4 rejects with many accepts and low ratio can still be eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    // 4 rejects each followed by 5 accepts → streak rebuilds to 20
    for (let r = 0; r < 4; r++) {
      const base = T0 + (20 + r * 6) * 60_000;
      acc.recordDecision('wks_a', 'reject', base);
      for (let a = 0; a < 5; a++) {
        acc.recordDecision('wks_a', 'accept', base + (a + 1) * 60_000);
      }
    }
    // after the last batch of 5 accepts, we'd need 20 more consecutive
    // this test shows 4 rejects doesn't auto-block if ratio is good and streak rebuilds
    // but we need to check if consecutiveAccepts has rebuilt to 20
    const needsMoreAccept = acc.getState('wks_a')!;
    if (needsMoreAccept.consecutiveAccepts < 20) {
      for (let i = 0; i < 20; i++) {
        acc.recordDecision(
          'wks_a',
          'accept',
          T0 + (20 + 4 * 6 + 5 + i) * 60_000,
        );
      }
    }
    const final = acc.getState('wks_a')!;
    expect(final.consecutiveAccepts).toBeGreaterThanOrEqual(20);
    expect(final.totalRejects).toBe(4);
    const ratio = final.totalRejects / final.totalCycles;
    expect(ratio).toBeLessThan(0.1);
    expect(final.promotionEligible).toBe(true);
  });
});

describe('GoalFieldShadowAccumulatorService — reject ratio gate', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');

  it('ratio >= 10% blocks even with 20+ consecutive accepts', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    // 9 rejects + 20 accepts = 29 total, ratio = 9/29 ≈ 31% → blocked
    for (let i = 0; i < 9; i++) {
      acc.recordDecision('wks_a', 'reject', T0 + i * 60_000);
    }
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + (9 + i) * 60_000);
    }
    const final = acc.getState('wks_a')!;
    expect(final.consecutiveAccepts).toBe(20);
    expect(final.totalRejects).toBe(9);
    expect(final.totalRejects / final.totalCycles).toBeGreaterThanOrEqual(0.1);
    expect(final.promotionEligible).toBe(false);
  });

  it('ratio just under 10% with 20+ accepts is eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    // 2 rejects + 20 accepts = 22 total, ratio = 2/22 ≈ 9% → eligible
    for (let i = 0; i < 2; i++) {
      acc.recordDecision('wks_a', 'reject', T0 + i * 60_000);
    }
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + (2 + i) * 60_000);
    }
    const final = acc.getState('wks_a')!;
    expect(final.totalRejects / final.totalCycles).toBeLessThan(0.1);
    expect(final.promotionEligible).toBe(true);
  });
});

describe('GoalFieldShadowAccumulatorService — temporal decay', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');
  const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;

  it('state resets after decay window (31 days idle)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 25; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);

    const afterDecay = acc.recordDecision('wks_a', 'accept', T0 + THIRTY_ONE_DAYS);
    expect(afterDecay.consecutiveAccepts).toBe(1);
    expect(afterDecay.totalRejects).toBe(0);
    expect(afterDecay.promotionEligible).toBe(false);
  });

  it('isPromotionEligible with nowMs detects decay on read', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a', T0 + THIRTY_ONE_DAYS)).toBe(false);
  });

  it('no decay when within window (< 30 days)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    const TWENTY_NINE_DAYS = 29 * 24 * 60 * 60 * 1000;
    acc.recordDecision('wks_a', 'accept', T0 + TWENTY_NINE_DAYS);
    // state should NOT be reset, consecutive should be 2
    expect(acc.getState('wks_a')?.consecutiveAccepts).toBe(2);
  });
});

describe('GoalFieldShadowAccumulatorService — noop', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');

  it('noop updates timestamp but does NOT affect counters', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    acc.recordDecision('wks_a', 'noop', T0 + 60_000);
    const state = acc.getState('wks_a')!;
    expect(state.consecutiveAccepts).toBe(1);
    expect(state.totalCycles).toBe(1);
    expect(state.totalRejects).toBe(0);
    expect(state.lastCycleAt).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('noop keeps eligible state if already eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    acc.recordDecision('wks_a', 'noop', T0 + 20 * 60_000);
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
  });
});

describe('GoalFieldShadowAccumulatorService — resetWorkspace', () => {
  it('resetWorkspace clears all state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', Date.now() + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    acc.resetWorkspace('wks_a');
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
    expect(acc.getState('wks_a')).toBeUndefined();
  });
});

describe('GoalFieldShadowAccumulatorService — multi-workspace isolation', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');

  it('each workspace tracks independent state', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    acc.recordDecision('wks_b', 'reject', T0);

    expect(acc.isPromotionEligible('wks_a')).toBe(true);
    expect(acc.isPromotionEligible('wks_b')).toBe(false);
    expect(acc.workspaceCount()).toBe(2);
  });
});

// ── GoalFieldService + ShadowAccumulator integration ───────────────
