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
      evidenceEventIds: expect.arrayContaining([expect.any(String)]),
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
    expect(d.nowFocus.safeNextStep).toBe('Review and approve before any outbound action');
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

  it('does not include learned owner criterion for single operator feedback', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'cognition.valence_assigned',
        entityRef: { entityType: 'operator', entityId: 'op_single' },
        occurredAt: recentIso(60),
        payload: {
          accepted: false,
          operatorNote: 'cliente prefere email ao inves de whatsapp',
          learningFraming: 'not human performance scoring - operator correction feedback',
        },
      }),
      ev({
        eventName: 'commerce.post_sale.churn_risk_detected',
        entityRef: { entityType: 'customer', entityId: 'cust_single' },
        occurredAt: recentIso(5),
        valence: 'negative',
        payload: { riskProbability: 0.55 },
      }),
    ]);
    const d = await svc.generate(WKS);
    const action = d.suggestedActions.find((a) => a.targetId === 'cust_single');
    expect(action).toBeDefined();
    expect(action?.kind).toBe('review_deal');
    expect(action?.reason).not.toContain('learned owner criterion');
    expect(action?.riskClass).toBe('R2');
    expect(action?.delegationMode).toBe('requires_approval');
    expect(action?.rollback).toBe('dismiss_suggestion');
  });

  it('counts silent leads', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 's1' },
        occurredAt: recentIso(5),
      }),
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 's2' },
        occurredAt: recentIso(2),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(2);
  });

  it('deduplicates silent leads by entity', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 's_dup' },
        occurredAt: recentIso(10),
      }),
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 's_dup' },
        occurredAt: recentIso(5),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(1);
  });

  it('generates follow_up action for silent lead with prior objection', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.objection_raised',
        entityRef: { entityType: 'lead', entityId: 'l_obj_silent' },
        occurredAt: recentIso(30),
        valence: 'negative',
      }),
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 'l_obj_silent' },
        occurredAt: recentIso(5),
        valence: 'negative',
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(1);
    expect(d.dealsAtRisk).toBe(1);
    const silentActions = d.suggestedActions.filter((a) => a.targetId === 'l_obj_silent');
    expect(silentActions.length).toBeGreaterThanOrEqual(1);
    expect(silentActions.some((a) => a.kind === 'follow_up')).toBe(true);
    for (const a of silentActions) {
      expect(a.reason.toLowerCase()).toContain('objection');
      expect(a.reason.toLowerCase()).toContain('diagnose silence');
      expect(a.reason.toLowerCase()).toContain('before any outbound action');
      expect(a.riskClass).toBe('R1');
      expect(a.delegationMode).toBe('allowed_alone');
      expect(a.rollback).toBe('dismiss_suggestion');
    }
    expect(d.nowFocus.urgency).toBe('now');
    expect(d.nowFocus.headline).toBe('Resume the right conversation');
    expect(d.nowFocus.safeNextStep).toBe(
      'Decide the silence reason before drafting any outbound message',
    );
    expect(d.nowFocus.targetId).toBe('l_obj_silent');
    expect(d.nowFocus.riskClass).toBe('R1');
    expect(d.nowFocus.delegationMode).toBe('allowed_alone');
    expect(d.nowFocus.rollback).toBe('dismiss_suggestion');
  });

  it('generates recover_cart action for silent lead with prior cart abandonment', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.cart.abandoned',
        entityRef: { entityType: 'lead', entityId: 'l_cart_silent' },
        occurredAt: recentIso(45),
      }),
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 'l_cart_silent' },
        occurredAt: recentIso(10),
        valence: 'negative',
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(1);
    const silentActions = d.suggestedActions.filter((a) => a.targetId === 'l_cart_silent');
    expect(silentActions.length).toBeGreaterThanOrEqual(1);
    expect(silentActions.some((a) => a.kind === 'recover_cart')).toBe(true);
    for (const a of silentActions) {
      expect(a.reason.toLowerCase()).toContain('diagnose checkout friction');
      expect(a.reason.toLowerCase()).toContain('before any outbound action');
      expect(a.riskClass).toBe('R1');
      expect(a.delegationMode).toBe('allowed_alone');
    }
  });

  it('does not generate action for silent lead without objection or cart', async () => {
    const svc = await buildSvc([
      ev({
        eventName: 'commerce.lead.went_silent',
        entityRef: { entityType: 'lead', entityId: 'l_silent_only' },
        occurredAt: recentIso(5),
      }),
    ]);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(1);
    const silentActions = d.suggestedActions.filter((a) => a.targetId === 'l_silent_only');
    expect(silentActions).toHaveLength(0);
    expect(d.nowFocus.urgency).toBe('for_awareness');
    expect(d.nowFocus.headline).toBe('No safe action yet');
    expect(d.nowFocus.safeNextStep).toBe('Keep silent until a stronger commercial signal appears');
    expect(d.nowFocus.reason).toContain('none qualify for an action');
    expect(d.nowFocus.riskClass).toBe('R1');
    expect(d.nowFocus.delegationMode).toBe('allowed_alone');
    expect(d.nowFocus.rollback).toBe('keep_silent');
  });

  it('still caps suggested actions at 5 with silent lead contributions', async () => {
    const many: SpineEventRef[] = [];
    for (let i = 0; i < 4; i++) {
      many.push(
        ev({
          eventName: 'commerce.lead.objection_raised',
          entityRef: { entityType: 'lead', entityId: `obj_${i}` },
          occurredAt: recentIso(i * 3),
          valence: 'negative',
        }),
      );
      many.push(
        ev({
          eventName: 'commerce.lead.went_silent',
          entityRef: { entityType: 'lead', entityId: `obj_${i}` },
          occurredAt: recentIso(i),
          valence: 'negative',
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      many.push(
        ev({
          eventName: 'commerce.cart.abandoned',
          entityRef: { entityType: 'lead', entityId: `cart_${i}` },
          occurredAt: recentIso(i * 2),
        }),
      );
      many.push(
        ev({
          eventName: 'commerce.lead.went_silent',
          entityRef: { entityType: 'lead', entityId: `cart_${i}` },
          occurredAt: recentIso(i),
          valence: 'negative',
        }),
      );
    }
    const svc = await buildSvc(many);
    const d = await svc.generate(WKS);
    expect(d.silentLeads).toBe(7);
    expect(d.suggestedActions.length).toBeLessThanOrEqual(5);
    for (const a of d.suggestedActions) {
      expect(['contact_lead', 'recover_cart', 'follow_up', 'review_deal', 'investigate']).toContain(
        a.kind,
      );
    }
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
      expect(['contact_lead', 'recover_cart', 'follow_up', 'review_deal', 'investigate']).toContain(
        a.kind,
      );
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
