import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { SpineEventRef } from '../mind/mind.types';
import { AntiRemorseService } from './anti-remorse.service';
import { ActivationCompanionService } from './activation-companion.service';
import { FirstValueDetector } from './first-value.detector';
import { SatisfactionCollectorService } from './satisfaction-collector.service';
import { TestimonialTimingAdvisor } from './testimonial-timing.advisor';
import { ReferralPromptTimingAdvisor } from './referral-prompt-timing.advisor';
import { RepurchaseWindowDetector } from './repurchase-window.detector';
import { ExpansionFitDetector } from './expansion-fit.detector';
import { ChurnRiskDetector } from './churn-risk.detector';
import { RetentionHonestTactics } from './retention-honest.tactics';
import { WinBackWindowAdvisor } from './winback-window.advisor';
import { LtvProjectionService } from './ltv-projection.service';
import { NoRegretPipelineService } from './no-regret-pipeline.service';
import type { DetectionInput, LtvProjection } from './postsale-consumers.types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as { _seq: number })._seq = seq;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt,
    truthMode: 'observed',
    ...overrides,
  };
}

function makeSpine(): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService());
}

function baseInput(events: SpineEventRef[], workspaceId: string, nowMs?: number): DetectionInput {
  return { events, workspaceId, nowMs: nowMs ?? Date.now() };
}

async function flushAsyncConsumers(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('POSTSALE-002 — Activation Companion', () => {
  let svc: ActivationCompanionService;

  beforeEach(() => {
    svc = new ActivationCompanionService();
  });

  test('tracks zero steps with no events', () => {
    const result = svc.track(baseInput([], 'wks_001'));
    expect(result.completedSteps).toBe(0);
    expect(result.totalSteps).toBeGreaterThan(0);
    expect(result.percentComplete).toBe(0);
    expect(result.activationLikely).toBe(false);
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.safeNextStep).toContain('Stay silent');
    expect(result.control.uncertainty).toContain('No activation evidence');
  });

  test('detects activation_started as first milestone', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 10_000).toISOString(),
      ),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.completedSteps).toBeGreaterThanOrEqual(1);
    expect(result.evidenceEventIds).toContain(events[0].eventId);
    expect(result.control.riskClass).toBe('R1');
    expect(result.control.leadOutcomeGuardrail).toContain('one clear next step');
  });

  test('activationLikely is true when progress high and recent activity', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 10_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 10_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.message_replied',
        'wks_001',
        new Date(now - 10_000).toISOString(),
      ),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.activationLikely).toBe(true);
    expect(result.control.delegationMode).toBe('allowed_alone');
    expect(result.control.safeNextStep).toContain('Record the customer as activated');
    expect(result.control.uncertainty).toContain('inferred from recent behavior');
  });

  test('does not use another customer activity to mark activation likely', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 10_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 10_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.whatsapp.message_replied',
        'wks_001',
        new Date(now - 10_000).toISOString(),
        {
          entityRef: other,
        },
      ),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 10_000).toISOString(),
        {
          entityRef: other,
        },
      ),
    ];

    const result = svc.track({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.activationLikely).toBe(false);
    expect(result.completedSteps).toBe(1);
    expect(result.evidenceEventIds).toEqual([events[0].eventId]);
    expect(result.control.delegationMode).toBe('allowed_alone');
    expect(result.control.safeNextStep).toContain('Keep watching');
  });

  test('stalledDays reflects gap since last activity', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
      ),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.stalledDays).toBeGreaterThanOrEqual(9);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.safeNextStep).toContain('help check-in');
    expect(result.control.leadOutcomeGuardrail).toContain('not pressured');
  });
});

describe('POSTSALE-003 — First Value Detector', () => {
  let spine: SpineEmitterService;
  let svc: FirstValueDetector;

  beforeEach(() => {
    spine = makeSpine();
    svc = new FirstValueDetector(spine);
  });

  test('detects no value with empty events', async () => {
    const result = await svc.detect(baseInput([], 'wks_001'));
    expect(result.valueObtained).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.evidenceEventIds).toHaveLength(0);
    expect(result.uncertaintyFlags).toHaveLength(0);
    expect(result.evidenceQuality).toBe('none');
    expect(result.control.delegationMode).toBe('silent_monitoring');
  });

  test('does not overclaim first value from conversion + payment without usage evidence', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.valueObtained).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.uncertaintyFlags).toHaveLength(0);
    expect(result.evidenceQuality).toBe('context_only');
    expect(result.control.safeNextStep).toContain('Do not emit first value yet');
    expect(result.control.uncertainty).toContain('value delivery is not evidenced');
  });

  test('detects value from conversion + payment + member progress', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 1).toISOString()),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.valueObtained).toBe(true);
    expect(result.evidenceQuality).toBe('value_signal');
    expect(result.control.delegationMode).toBe('allowed_alone');
    expect(result.control.safeNextStep).toContain('Mark first value as obtained');
  });

  test('does not use another customer progress or satisfaction to mark first value', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: target,
      }),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: target,
      }),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: target,
      }),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: other,
      }),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 1).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'positive' } },
      ),
    ];

    const result = await svc.detect({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.valueObtained).toBe(false);
    expect(result.evidenceQuality).toBe('context_only');
    expect(result.evidenceEventIds).not.toContain(events[3].eventId);
    expect(result.evidenceEventIds).not.toContain(events[4].eventId);
    expect(spine.recentEvents()).toHaveLength(0);
  });

  test('negative post-sale signals reduce first value confidence and surface uncertainty', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 1).toISOString(),
        { payload: { sentimentLabel: 'negative' } },
      ),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.valueObtained).toBe(false);
    expect(result.uncertaintyFlags).toEqual(
      expect.arrayContaining(['refund_nearby', 'support_escalation', 'negative_satisfaction']),
    );
    expect(result.control.safeNextStep).toContain('wait for member progress');
  });

  test('emits spine event when value detected', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 1).toISOString()),
    ];
    await svc.detect(baseInput(events, 'wks_001', now));
    const spineEvents = spine.recentEvents();
    const firstValueEvent = spineEvents.find(
      (e) => e.eventName === 'commerce.post_sale.first_value_obtained',
    );
    expect(firstValueEvent).toBeDefined();
    expect(firstValueEvent?.workspaceId).toBe('wks_001');
    expect(firstValueEvent?.truthMode).toBe('inferred');
  });

  test('does not emit when confidence below threshold', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
    ];
    await svc.detect(baseInput(events, 'wks_001', now));
    const spineEvents = spine.recentEvents();
    expect(
      spineEvents.filter((e) => e.eventName === 'commerce.post_sale.first_value_obtained'),
    ).toHaveLength(0);
  });
});
