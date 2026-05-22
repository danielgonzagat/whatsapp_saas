import { expectValueOf } from '../../../test/expect-value-of';
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

async function buildSvc(
  initialEvents: readonly SpineEventRef[] = [],
): Promise<DailyDashboardService> {
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
    expect(d.silentLeads).toBe(0);
    expect(d.topThreeOpportunities.length).toBeLessThanOrEqual(3);
    for (const t of d.topThreeOpportunities) {
      expect(t.goalId).toBeTruthy();
      expect(t.summary).toBeTruthy();
    }
    expect(d.suggestedActions).toHaveLength(0);
    expect(d.nowFocus).toEqual({
      urgency: 'archive',
      headline: 'Nothing needs attention now',
      safeNextStep: 'Stay silent and keep monitoring',
      reason: 'no current lead, cart, follow-up, risk, or silence signal in the 24h window',
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      rollback: 'keep_silent',
      timeToValueMinutes: 1,
    });
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

  it('surfaces no-regret post-sale evidence as calm information, not as a new action', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.post_sale.first_value_obtained',
        entityRef: { entityType: 'customer', entityId: 'cust_first_value' },
        occurredAt: recentIso(10),
        valence: 'positive',
      }),
    ]);

    const d = await svc.generate(WKS);

    expect(d.suggestedActions).toHaveLength(0);
    expect(d.nowFocus.urgency).toBe('archive');
    expect(d.nowFocus.headline).toBe('Nothing needs attention now');
    expect(d.nowFocus.noRegretHighlight).toEqual({
      count: 1,
      headline: '1 customer reached first value',
      reason:
        'informational post-sale health signal only; do not create outreach, referral, testimonial, or expansion work from this alone',
      evidenceEventIds: expect.arrayContaining([expectValueOf(String)]),
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
    });
  });

  it('does not count first-value evidence as no-regret health when risk exists for the same customer', async () => {
    const entityRef = { entityType: 'customer', entityId: 'cust_risky' };
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.post_sale.first_value_obtained',
        entityRef,
        occurredAt: recentIso(20),
        valence: 'positive',
      }),
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef,
        occurredAt: recentIso(5),
        valence: 'negative',
        payload: { riskProbability: 0.72, signals: ['first_value_missing'] },
      }),
    ]);

    const d = await svc.generate(WKS);

    expect(d.nowFocus.noRegretHighlight).toBeUndefined();
    expect(d.nowFocus.headline).toBe('Review risk before acting');
    expect(d.nowFocus.riskClass).toBe('R2');
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

  it('prioritizes post-sale first-value risk as owner-approved review action', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef: { entityType: 'customer', entityId: 'cust_no_value' },
        occurredAt: recentIso(5),
        valence: 'negative',
        payload: { riskProbability: 0.6, signals: ['first_value_missing'] },
      }),
    ]);
    const d = await svc.generate(WKS);
    const action = d.suggestedActions.find((a) => a.targetId === 'cust_no_value');
    expect(action).toBeDefined();
    expect(action?.kind).toBe('review_deal');
    expect(action?.reason).toContain('first value');
    expect(action?.riskClass).toBe('R2');
    expect(action?.delegationMode).toBe('requires_approval');
    expect(action?.rollback).toBe('dismiss_suggestion');
    expect(d.nowFocus.urgency).toBe('now');
    expect(d.nowFocus.headline).toBe('Review risk before acting');
    expect(d.nowFocus.safeNextStep).toBe('Review and approve before every outbound action');
    expect(d.nowFocus.targetId).toBe('cust_no_value');
    expect(d.nowFocus.riskClass).toBe('R2');
    expect(d.nowFocus.delegationMode).toBe('requires_approval');
    expect(d.nowFocus.rollback).toBe('dismiss_suggestion');
    expect(d.nowFocus.timeToValueMinutes).toBe(1);
  });

  it('includes learned owner criterion when repeated non-punitive operator feedback exists', async () => {
    const repeatedNote = 'cliente precisa de ajuda de entrega antes de retencao';
    const svc = await buildSvc([
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        occurredAt: recentIso(120),
        payload: {
          accepted: false,
          operatorNote: repeatedNote,
          learningFraming: 'not human performance scoring - operator correction feedback',
        },
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        occurredAt: recentIso(60),
        payload: {
          accepted: false,
          operatorNote: ` ${repeatedNote} `,
          learningFraming: 'not human performance scoring - operator correction feedback',
        },
      }),
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef: { entityType: 'customer', entityId: 'cust_repeat' },
        occurredAt: recentIso(5),
        valence: 'negative',
        payload: { riskProbability: 0.55 },
      }),
    ]);
    const d = await svc.generate(WKS);
    const action = d.suggestedActions.find((a) => a.targetId === 'cust_repeat');
    expect(action).toBeDefined();
    expect(action?.kind).toBe('review_deal');
    expect(action?.reason).toContain('learned owner criterion');
    expect(action?.reason).toContain(repeatedNote);
    expect(action?.riskClass).toBe('R2');
    expect(action?.delegationMode).toBe('requires_approval');
    expect(action?.rollback).toBe('dismiss_suggestion');
  });

  it('does not include learned owner criterion for two different operator notes', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        occurredAt: recentIso(120),
        payload: {
          accepted: false,
          operatorNote: 'prefere comunicacao por whatsapp as 20h',
          learningFraming: 'not human performance scoring - operator correction feedback',
        },
      }),
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_1' },
        occurredAt: recentIso(60),
        payload: {
          accepted: false,
          operatorNote: 'cliente responde melhor com audio',
          learningFraming: 'not human performance scoring - operator correction feedback',
        },
      }),
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef: { entityType: 'customer', entityId: 'cust_diff_notes' },
        occurredAt: recentIso(5),
        valence: 'negative',
        payload: { riskProbability: 0.55 },
      }),
    ]);
    const d = await svc.generate(WKS);
    const action = d.suggestedActions.find((a) => a.targetId === 'cust_diff_notes');
    expect(action).toBeDefined();
    expect(action?.reason).not.toContain('learned owner criterion');
    expect(action?.riskClass).toBe('R2');
    expect(action?.delegationMode).toBe('requires_approval');
  });
