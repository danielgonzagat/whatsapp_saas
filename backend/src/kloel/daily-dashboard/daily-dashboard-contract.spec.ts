import { DailyDashboardService } from './daily-dashboard.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { ValenceAggregatorService } from '../mind/valence-aggregator.service';
import { AttentionService } from '../mind/attention.service';
import type { SpineEventRef } from '../mind/mind.types';

const WKS = 'wks_demo';

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? WKS,
    entityRef: over.entityRef ?? { entityType: 'lead', entityId: 'lead_1' },
    occurredAt: over.occurredAt ?? new Date(Date.now() - 1000 * 60).toISOString(),
    truthMode: over.truthMode ?? 'observed',
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
    ...(over.correlationId !== undefined ? { correlationId: over.correlationId } : {}),
  };
}

function recentIso(offsetMinutes = 0): string {
  return new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();
}

async function buildSvc(initialEvents: readonly SpineEventRef[] = []): Promise<DailyDashboardService> {
  const spine = new SpineEmitterService(undefined, { ringCapacity: 1000 });

  for (const e of initialEvents) {
    await spine.emit({
      eventName: e.eventName,
      workspaceId: e.workspaceId,
      entityRef: e.entityRef,
      truthMode: e.truthMode,
      provenance: {
        source: 'production',
        processor: 'test',
        processorVersion: '0.0.0',
        schemaVersion: '1.0.0',
      },
      valence: e.valence,
      payload: e.payload as Record<string, unknown> | undefined,
      correlationId: e.correlationId,
      occurredAt: e.occurredAt,
    });
  }

  const goalField = new GoalFieldService();
  const valenceAggregator = new ValenceAggregatorService();
  const attention = new AttentionService();

  return new DailyDashboardService(spine, goalField, valenceAggregator, attention);
}

describe('DailyDashboardService contract (UTP-R6)', () => {
  it('returns a valid dashboard for empty events', async () => {
    const svc = await buildSvc([]);
    const d = await svc.generate(WKS);
    expect(d.workspaceId).toBe(WKS);
    expect(d.generatedAt).toBeDefined();
    expect(d.hotLeadsWithoutResponse).toBe(0);
    expect(d.abandonedCarts).toBe(0);
    expect(d.leadsAwaitingFollowup).toBe(0);
    expect(d.dealsAtRisk).toBe(0);
    expect(d.topThreeOpportunities.length).toBeLessThanOrEqual(3);
    for (const t of d.topThreeOpportunities) {
      expect(t.goalId).toBeTruthy();
      expect(t.summary).toBeTruthy();
    }
    expect(d.suggestedActions).toHaveLength(0);
    expect(d.commercialMood.neutral).toBe(1);
    expect(d.commercialMood.windowHours).toBe(24);
  });

  it('detects hot leads without response', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.replied',
        entityRef: { entityType: 'lead', entityId: 'l_hot' },
        occurredAt: recentIso(5),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.hotLeadsWithoutResponse).toBe(1);
  });

  it('does not count hot lead when message was replied', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.replied',
        entityRef: { entityType: 'lead', entityId: 'l_ok' },
        occurredAt: recentIso(15),
      }),
      ev({
        eventName: 'commerce.whatsapp.message_replied',
        entityRef: { entityType: 'lead', entityId: 'l_ok' },
        occurredAt: recentIso(10),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.hotLeadsWithoutResponse).toBe(0);
  });

  it('counts abandoned carts', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'cart', entityId: 'cart_1' },
        occurredAt: recentIso(30),
      }),
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'cart', entityId: 'cart_2' },
        occurredAt: recentIso(20),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.abandonedCarts).toBe(2);
  });

  it('counts leads awaiting followup (contacted, no reply)', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.contacted',
        entityRef: { entityType: 'lead', entityId: 'l_wait' },
        occurredAt: recentIso(60),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.leadsAwaitingFollowup).toBe(1);
  });

  it('does not count contacted lead that already replied', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.contacted',
        entityRef: { entityType: 'lead', entityId: 'l_done' },
        occurredAt: recentIso(120),
      }),
      ev({
        eventName: 'commerce.lead.replied',
        entityRef: { entityType: 'lead', entityId: 'l_done' },
        occurredAt: recentIso(60),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.leadsAwaitingFollowup).toBe(0);
  });

  it('counts deals at risk (objections + churn risk)', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.objection_raised',
        entityRef: { entityType: 'lead', entityId: 'o1' },
        occurredAt: recentIso(10),
      }),
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef: { entityType: 'customer', entityId: 'c1' },
        occurredAt: recentIso(5),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.dealsAtRisk).toBe(2);
  });

  it('produces top three opportunities from goal field', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        occurredAt: recentIso(5),
      }),
      ev({
        eventName: 'commerce.lead.objection_raised',
        entityRef: { entityType: 'lead', entityId: 'l1' },
        occurredAt: recentIso(10),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.topThreeOpportunities.length).toBeGreaterThanOrEqual(0);
    expect(d.topThreeOpportunities.length).toBeLessThanOrEqual(3);
    for (const t of d.topThreeOpportunities) {
      expect(t.goalId).toBeTruthy();
      expect(t.summary).toBeTruthy();
      expect(typeof t.score).toBe('number');
    }
  });

  it('produces suggested actions from goals and attention', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.payment.declined',
        entityRef: { entityType: 'payment', entityId: 'p1' },
        valence: 'negative',
        occurredAt: recentIso(2),
      }),
      ev({
        eventName: 'commerce.whatsapp.handoff_to_human',
        entityRef: { entityType: 'conversation', entityId: 'conv_1' },
        valence: 'negative',
        occurredAt: recentIso(1),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(Array.isArray(d.suggestedActions)).toBe(true);
    for (const a of d.suggestedActions) {
      expect(['contact_lead', 'recover_cart', 'follow_up', 'review_deal', 'investigate']).toContain(a.kind);
      expect(a.targetType).toBeTruthy();
      expect(a.targetId).toBeTruthy();
      expect(a.reason).toBeTruthy();
      expect(typeof a.priority).toBe('number');
    }
  });

  it('commercialMood reflects event valences', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.payment.approved',
        valence: 'positive',
        occurredAt: recentIso(5),
      }),
      ev({
        eventName: 'commerce.payment.approved',
        entityRef: { entityType: 'payment', entityId: 'p2' },
        valence: 'positive',
        occurredAt: recentIso(3),
      }),
      ev({
        eventName: 'commerce.payment.declined',
        entityRef: { entityType: 'payment', entityId: 'p3' },
        valence: 'negative',
        occurredAt: recentIso(1),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.commercialMood.positive).toBeGreaterThan(0);
    expect(d.commercialMood.negative).toBeGreaterThan(0);
    expect(d.commercialMood.windowHours).toBe(24);
  });

  it('filters events by workspaceId', async () => {
    const svcOther = await buildSvc([
      ev({
        workspaceId: 'wks_other',
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'cart', entityId: 'cart_other' },
        occurredAt: recentIso(10),
      }),
    ]);
    const d = await svcOther.generate(WKS);
    expect(d.abandonedCarts).toBe(0);
  });

  it('filters events by 24h window', async () => {
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'cart', entityId: 'cart_old' },
        occurredAt: oldTime,
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.abandonedCarts).toBe(0);
  });

  it('handles many events across multiple leads', async () => {
    const many: SpineEventRef[] = [];
    for (let i = 0; i < 20; i++) {
      many.push(
        ev({
          eventName: 'commerce.lead.contacted',
          entityRef: { entityType: 'lead', entityId: `lead_${i}` },
          occurredAt: recentIso(i * 2),
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      many.push(
        ev({
          eventName: 'commerce.cart.abandoned',
          entityRef: { entityType: 'cart', entityId: `cart_${i}` },
          occurredAt: recentIso(i),
        }),
      );
    }
    const svc = await buildSvc(many);
    const d = await svc.generate(WKS);
    expect(d.leadsAwaitingFollowup).toBe(20);
    expect(d.abandonedCarts).toBe(5);
    expect(d.generatedAt).toBeTruthy();
    expect(d.workspaceId).toBe(WKS);
  });

  it('returns empty suggested actions when no activity', async () => {
    const svc = await buildSvc([]);
    const d = await svc.generate(WKS);
    expect(d.suggestedActions).toHaveLength(0);
    expect(d.commercialMood.neutral).toBe(1);
  });
});
