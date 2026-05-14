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
    if (over.entityRef !== undefined) e['entityRef'] = over.entityRef;
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_1' };
  }
  if (over.valence !== undefined) e['valence'] = over.valence;
  if (over.payload !== undefined) e['payload'] = over.payload;
  if (over.correlationId !== undefined) e['correlationId'] = over.correlationId;
  return e as SpineEventRef;
}

describe('Commercial detectors (UTP-GOAL-COMM-*)', () => {
  it('hot_lead_without_response fires after budget elapses without our reply', () => {
    const events = [
      ev({
        eventName: 'commerce.lead.replied',
        occurredAt: '2026-05-13T21:00:00.000Z',
      }),
    ];
    const tens = hotLeadWithoutResponseDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.severity).toBeGreaterThanOrEqual(0.8);
  });

  it('hot_lead_without_response is silent when we already replied', () => {
    const events = [
      ev({ eventName: 'commerce.lead.replied', occurredAt: '2026-05-13T21:00:00.000Z' }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: '2026-05-13T21:05:00.000Z',
      }),
    ];
    expect(hotLeadWithoutResponseDetector.detect(events, NOW)).toHaveLength(0);
  });

  it('abandoned_cart fires when no progression after window', () => {
    const events = [
      ev({ eventName: 'commerce.cart.created', occurredAt: '2026-05-13T20:00:00.000Z' }),
    ];
    expect(abandonedCartDetector.detect(events, NOW)).toHaveLength(1);
  });

  it('repeated_objection fires on >=2 objections', () => {
    const events = [
      ev({ eventName: 'commerce.lead.objection_raised', eventId: 'o1' }),
      ev({ eventName: 'commerce.lead.objection_raised', eventId: 'o2' }),
    ];
    const tens = repeatedObjectionDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.evidenceEventIds).toEqual(['o1', 'o2']);
  });
});

describe('Cognitive detectors (UTP-GOAL-COG-*)', () => {
  it('runtime_critical_without_observability fires on hard_fail', () => {
    const events = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
      }),
    ];
    const tens = runtimeCriticalWithoutObservabilityDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
    expect(tens[0]?.severity).toBeGreaterThan(0.9);
  });
});

describe('Structural detectors (UTP-GOAL-STRUCT-*)', () => {
  it('backend_without_surface flags missing surfaces', () => {
    const events = [ev({ eventName: 'lineage.genesis' })];
    const tens = backendWithoutSurfaceDetector.detect(events, NOW);
    expect(tens.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Financial detectors (UTP-GOAL-FIN-*)', () => {
  it('discount_without_justification fires when reason missing', () => {
    const events = [ev({ payload: { discountCents: 500 } })];
    const tens = discountWithoutJustificationDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
  });

  it('discount_without_justification silent when reason present', () => {
    const events = [ev({ payload: { discountCents: 500, discountReason: 'first-time client' } })];
    expect(discountWithoutJustificationDetector.detect(events, NOW)).toHaveLength(0);
  });
});

describe('Ops/UX detectors (UTP-GOAL-OPS-*/UX-*)', () => {
  it('human_handoff_overdue fires after 15min without followup', () => {
    const events = [
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        occurredAt: '2026-05-13T21:00:00.000Z',
      }),
    ];
    const tens = humanHandoffOverdueDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
  });

  it('slow_response fires when latency > 2min', () => {
    const events = [
      ev({
        eventId: 'in',
        correlationId: 'c1',
        eventName: 'commerce.whatsapp.message_received',
        occurredAt: '2026-05-13T21:00:00.000Z',
      }),
      ev({
        eventId: 'out',
        correlationId: 'c1',
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: '2026-05-13T21:05:00.000Z',
      }),
    ];
    const tens = slowResponseDetector.detect(events, NOW);
    expect(tens).toHaveLength(1);
  });
});

describe('GoalFieldService — orchestrator', () => {
  it('runs all detectors and returns aggregated/candidates/promoted', () => {
    const svc = new GoalFieldService();
    const events: SpineEventRef[] = [
      ev({
        eventName: 'commerce.lead.replied',
        occurredAt: '2026-05-13T21:00:00.000Z',
      }),
      ev({
        eventName: 'commerce.lead.objection_raised',
        eventId: 'o1',
      }),
      ev({
        eventName: 'commerce.lead.objection_raised',
        eventId: 'o2',
      }),
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        entityRef: { entityType: 'gate', entityId: 'origin-immutability' },
      }),
    ];
    const r = svc.runCycle({ events, nowMs: NOW });
    expect(r.tensions.length).toBeGreaterThan(0);
    expect(r.aggregated.length).toBeGreaterThan(0);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.mode).toBe('shadow');
    expect(r.promoted).toHaveLength(0);
  });

  it('shadow mode does NOT track live goals; active mode does', () => {
    const svc = new GoalFieldService();
    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'lineage-integrity' },
        entityRef: { entityType: 'gate', entityId: 'lineage-integrity' },
      }),
    ];
    svc.runCycle({ events, nowMs: NOW, mode: 'shadow' });
    expect(svc.liveGoalCount()).toBe(0);
    svc.runCycle({ events, nowMs: NOW, mode: 'active' });
    expect(svc.liveGoalCount()).toBeGreaterThan(0);
  });

  it('pruneStale demotes goals not refreshed within TTL', () => {
    const svc = new GoalFieldService();
    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'foo' },
        entityRef: { entityType: 'gate', entityId: 'foo' },
      }),
    ];
    svc.runCycle({ events, nowMs: NOW, mode: 'active' });
    expect(svc.liveGoalCount()).toBeGreaterThan(0);
    const stale = svc.pruneStale(NOW + 25 * 60 * 60 * 1000);
    expect(stale.length).toBeGreaterThan(0);
    expect(svc.liveGoalCount()).toBe(0);
  });

  it('respects emergence threshold', () => {
    const svc = new GoalFieldService();
    const r = svc.runCycle({
      events: [],
      nowMs: NOW,
      emergenceThreshold: 5, // very high — nothing emerges
    });
    expect(r.candidates).toHaveLength(0);
  });

  it('aggregation uses commercial dominance — commercial outweighs structural', () => {
    const svc = new GoalFieldService();
    const events: SpineEventRef[] = [
      ev({
        eventName: 'commerce.cart.created',
        occurredAt: '2026-05-13T20:00:00.000Z',
        entityRef: { entityType: 'lead', entityId: 'l1' },
      }),
    ];
    const r = svc.runCycle({ events, nowMs: NOW });
    const dominant = r.aggregated.find((a) => a.entityRef?.entityId === 'l1');
    expect(dominant?.dominantDimension).toBe('commercial');
  });
});

describe('Detector registry coverage', () => {
  it('registers >=29 detectors total', () => {
    const svc = new GoalFieldService();
    expect(svc.registeredDetectors().length).toBeGreaterThanOrEqual(29);
  });
});

// ── GoalFieldShadowAccumulatorService ──────────────────────────────

describe('GoalFieldShadowAccumulatorService — cold start', () => {
  it('workspace with 0 cycles is NOT promotion eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.isPromotionEligible('wks_cold')).toBe(false);
  });

  it('getState returns undefined for unknown workspace', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.getState('wks_unknown')).toBeUndefined();
  });

  it('workspaceCount is 0 at start', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    expect(acc.workspaceCount()).toBe(0);
  });
});

describe('GoalFieldShadowAccumulatorService — accept streak', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z');

  it('19 consecutive accepts does NOT promote', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 19; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(19);
    expect(state?.promotionEligible).toBe(false);
    expect(acc.isPromotionEligible('wks_a')).toBe(false);
  });

  it('20 consecutive accepts DOES promote (clean ratio)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 20; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(20);
    expect(state?.promotionEligible).toBe(true);
    expect(acc.isPromotionEligible('wks_a')).toBe(true);
  });

  it('30 consecutive accepts stays eligible', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    let state: WorkspaceShadowState | undefined;
    for (let i = 0; i < 30; i++) {
      state = acc.recordDecision('wks_a', 'accept', T0 + i * 60_000);
    }
    expect(state?.consecutiveAccepts).toBe(30);
    expect(state?.promotionEligible).toBe(true);
  });

  it('getState returns a snapshot (not live reference)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    acc.recordDecision('wks_a', 'accept', T0);
    const snap = acc.getState('wks_a');
    expect(snap?.consecutiveAccepts).toBe(1);
    snap!.consecutiveAccepts = 999;
    expect(acc.getState('wks_a')?.consecutiveAccepts).toBe(1);
  });
});

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

describe('GoalFieldService — shadow accumulator integration', () => {
  it('active mode without accumulator promotes normally', () => {
    const svc = new GoalFieldService();
    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        entityRef: { entityType: 'gate', entityId: 'origin-immutability' },
      }),
    ];
    const r = svc.runCycle({ events, nowMs: NOW, mode: 'active' });
    expect(r.promoted.length).toBeGreaterThan(0);
    expect(svc.liveGoalCount()).toBeGreaterThan(0);
  });

  it('active mode with non-eligible workspace stays in shadow (0 promoted)', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const svc = new GoalFieldService(
      [runtimeCriticalWithoutObservabilityDetector],
      acc,
    );
    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        workspaceId: 'wks_shadow',
        entityRef: { entityType: 'gate', entityId: 'origin-immutability' },
      }),
    ];
    const r = svc.runCycle({
      events,
      nowMs: NOW,
      mode: 'active',
      emergenceThreshold: 0.1,
    });
    expect(acc.isPromotionEligible('wks_shadow')).toBe(false);
    expect(r.promoted).toHaveLength(0);
    expect(svc.liveGoalCount()).toBe(0);
  });

  it('active mode with eligible workspace promotes goals', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const svc = new GoalFieldService(undefined, acc);

    const T0 = NOW - 25 * 60_000;
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_ready', 'accept', T0 + i * 60_000);
    }
    expect(acc.isPromotionEligible('wks_ready', NOW)).toBe(true);

    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        workspaceId: 'wks_ready',
        entityRef: { entityType: 'gate', entityId: 'origin-immutability' },
      }),
    ];
    const r = svc.runCycle({
      events,
      nowMs: NOW,
      mode: 'active',
      emergenceThreshold: 0.1,
    });
    expect(r.promoted.length).toBeGreaterThan(0);
    expect(svc.liveGoalCount()).toBeGreaterThan(0);
  });

  it('global goals (no workspaceId) always promote even without eligible workspace', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const svc = new GoalFieldService(undefined, acc);
    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'origin-immutability' },
        workspaceId: undefined as unknown as string,
        entityRef: { entityType: 'gate', entityId: 'origin-immutability' },
      }),
    ];
    // events without workspaceId go into global-scope tensions/goals
    const r = svc.runCycle({
      events,
      nowMs: NOW,
      mode: 'active',
      emergenceThreshold: 0.1,
    });
    // global goals bypass the shadow gate
    expect(r.promoted.length).toBeGreaterThan(0);
  });

  it('mixed workspaces: eligible promotes, non-eligible blocked, global passes', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const svc = new GoalFieldService(
      [
        runtimeCriticalWithoutObservabilityDetector,
        hotLeadWithoutResponseDetector,
        repeatedObjectionDetector,
      ],
      acc,
    );

    const T0 = NOW - 25 * 60_000;
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_eligible', 'accept', T0 + i * 60_000);
    }

    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'a' },
        workspaceId: 'wks_eligible',
        entityRef: { entityType: 'gate', entityId: 'a' },
      }),
      ev({
        eventName: 'commerce.lead.objection_raised',
        eventId: 'o1',
        workspaceId: 'wks_shadow',
        entityRef: { entityType: 'lead', entityId: 'l1' },
      }),
      ev({
        eventName: 'commerce.lead.objection_raised',
        eventId: 'o2',
        workspaceId: 'wks_shadow',
        entityRef: { entityType: 'lead', entityId: 'l1' },
      }),
    ];
    const r = svc.runCycle({
      events,
      nowMs: NOW,
      mode: 'active',
      emergenceThreshold: 0.1,
      promotionTopK: 10,
    });

    const promotedWorkspaces = new Set(
      r.promoted.map((g) => g.workspaceId),
    );
    expect(promotedWorkspaces.has('wks_eligible')).toBe(true);
    expect(promotedWorkspaces.has('wks_shadow')).toBe(false);
  });

  it('shadow mode never promotes regardless of eligibility', () => {
    const acc = new GoalFieldShadowAccumulatorService();
    const svc = new GoalFieldService(undefined, acc);

    const T0 = NOW - 25 * 60_000;
    for (let i = 0; i < 20; i++) {
      acc.recordDecision('wks_ready', 'accept', T0 + i * 60_000);
    }

    const events: SpineEventRef[] = [
      ev({
        eventName: 'pulse.gate_failed',
        payload: { mode: 'hard_fail', gateName: 'foo' },
        workspaceId: 'wks_ready',
        entityRef: { entityType: 'gate', entityId: 'foo' },
      }),
    ];
    const r = svc.runCycle({
      events,
      nowMs: NOW,
      mode: 'shadow',
      emergenceThreshold: 0.1,
    });
    expect(r.promoted).toHaveLength(0);
    expect(svc.liveGoalCount()).toBe(0);
  });
});
