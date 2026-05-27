import { SpineEmitterService } from '../spine/spine-emitter.service';
import { makeSpine } from '../../../test/helpers/spine-factory';
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
import { makeEventFactory } from '../../../test/helpers/spine-event-factory';
import { baseInput } from '../../../test/helpers/detection-input-factory';

const makeEvent = makeEventFactory();

async function flushAsyncConsumers(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('POSTSALE-004 — Satisfaction Collector', () => {
  let spine: SpineEmitterService;
  let svc: SatisfactionCollectorService;

  beforeEach(() => {
    spine = makeSpine();
    svc = new SatisfactionCollectorService(spine);
  });

  test('collects NPS score and derives positive sentiment', () => {
    const result = svc.collect(baseInput([], 'wks_001'), 'nps', 10);
    expect(result.sentimentLabel).toBe('positive');
    expect(result.method).toBe('nps');
    expect(result.score).toBe(10);
    expect(result.workspaceId).toBe('wks_001');
  });

  test('collects NPS score and derives negative sentiment', () => {
    const result = svc.collect(baseInput([], 'wks_001'), 'nps', 3);
    expect(result.sentimentLabel).toBe('negative');
  });

  test('does not use another customer behavior to infer satisfaction', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef: other,
      }),
    ];

    const result = svc.collect(
      { ...baseInput(events, 'wks_001', now), entityRef: target },
      'behavioral',
    );

    expect(result.entityRef).toEqual(target);
    expect(result.sentimentLabel).toBe('neutral');
  });

  test('aggregate returns correct NPS from multiple signals', () => {
    const events: SpineEventRef[] = [
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        '2026-05-01T00:00:00Z',
        { payload: { score: 10 } },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        '2026-05-02T00:00:00Z',
        { payload: { score: 9 } },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        '2026-05-03T00:00:00Z',
        { payload: { score: 5 } },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        '2026-05-04T00:00:00Z',
        { payload: { score: 3 } },
      ),
    ];
    const agg = svc.aggregate(events, 'wks_001');
    expect(agg.signalCount).toBe(4);
    expect(agg.npsScore).toBe(0);
    expect(agg.averageScore).toBeGreaterThan(0);
  });

  test('emit satisfaction signal on collection', () => {
    svc.collect(baseInput([], 'wks_001'), 'csat', 8);
    const spineEvents = spine.recentEvents();
    const satEvent = spineEvents.find(
      (e) => e.eventName === 'commerce.post_sale.satisfaction_signal_observed',
    );
    expect(satEvent).toBeDefined();
    expect(satEvent?.workspaceId).toBe('wks_001');
  });
});

describe('POSTSALE-005 — Testimonial Timing Advisor', () => {
  let svc: TestimonialTimingAdvisor;

  beforeEach(() => {
    svc = new TestimonialTimingAdvisor();
  });

  test('not ready without purchase', () => {
    const result = svc.assess(baseInput([], 'wks_001'));
    expect(result.ready).toBe(false);
    expect(result.readinessScore).toBe(0);
  });

  test('not ready when purchase is too recent', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
  });

  test('ready when purchase mature + positive satisfaction', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(true);
    expect(result.readinessScore).toBeGreaterThanOrEqual(0.5);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('optional');
  });

  test('stays silent for testimonial when first value is missing', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'positive' } },
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('no_first_value_evidence');
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.safeNextStep).toContain('Do not ask for a testimonial');
  });

  test('does not use another customer satisfaction to ask for a testimonial', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
    ];
    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('no_first_value_evidence');
  });

  test('stays silent when recent post-sale risk exists even if purchase is mature', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'negative' } },
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('recent_post_sale_risk');
  });

  test('stays silent for testimonial when the buyer had a recent objection', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 8 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: target, payload: { sentimentLabel: 'positive' } },
      ),
    ];
    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('recent_post_sale_risk');
  });

  test('suggested channel matches readiness score', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 14 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(['whatsapp', 'email', 'dashboard', 'silent']).toContain(result.suggestedChannel);
  });
});
