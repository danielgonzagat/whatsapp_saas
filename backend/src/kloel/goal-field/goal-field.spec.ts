import { GoalFieldService } from './goal-field.service';
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
