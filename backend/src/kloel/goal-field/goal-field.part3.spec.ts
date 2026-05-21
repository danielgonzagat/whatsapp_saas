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
        workspaceId: undefined as string,
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
