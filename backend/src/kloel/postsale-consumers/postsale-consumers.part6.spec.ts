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
import { makeEventFactory } from '../../../test/helpers/spine-event-factory';

const makeEvent = makeEventFactory();

function makeSpine(): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService());
}

function baseInput(events: SpineEventRef[], workspaceId: string, nowMs?: number): DetectionInput {
  return { events, workspaceId, nowMs: nowMs ?? Date.now() };
}

async function flushAsyncConsumers(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('POSTSALE-006 — Referral Prompt Timing', () => {
  let svc: ReferralPromptTimingAdvisor;

  beforeEach(() => {
    svc = new ReferralPromptTimingAdvisor();
  });

  test('not ready without purchase', () => {
    const result = svc.assess(baseInput([], 'wks_001'));
    expect(result.ready).toBe(false);
  });

  test('not ready with too-recent purchase', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
  });

  test('ready with matured purchase + value + positive satisfaction', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
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
        { payload: { sentimentLabel: 'positive' } },
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(true);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('free to decline');
  });

  test('does not ask for referral without positive satisfaction evidence', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('no_positive_satisfaction_evidence');
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.leadOutcomeGuardrail).toContain('customer trust comes first');
  });

  test('does not use another customer value to ask for a referral', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'positive' } },
      ),
    ];
    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('no_first_value_evidence');
  });

  test('does not ask for referral while refund or churn risk is recent', () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
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
        { payload: { sentimentLabel: 'positive' } },
      ),
      makeEvent(
        'commerce.post_sale.churn_risk_detected',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(false);
    expect(result.suggestedChannel).toBe('silent');
    expect(result.reasons).toContain('recent_post_sale_risk');
  });

  test('does not ask for referral when a recent objection preceded purchase', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 8 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 6 * 86400_000).toISOString(),
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
});
