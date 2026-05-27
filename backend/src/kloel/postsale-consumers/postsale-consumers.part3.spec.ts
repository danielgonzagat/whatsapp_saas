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

describe('POSTSALE-001 — Anti-Remorse Service', () => {
  let svc: AntiRemorseService;

  beforeEach(() => {
    svc = new AntiRemorseService();
  });

  test('returns none when no payment event found', () => {
    const events: SpineEventRef[] = [];
    const result = svc.assess(baseInput(events, 'wks_001'));
    expect(result.remorseRiskScore).toBe(0);
    expect(result.recommendedAction).toBe('monitor');
    expect(result.riskFactors).toHaveLength(0);
  });

  test('returns send_welcome for recent payment within 24h', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.remorseRiskScore).toBeGreaterThan(0);
    expect(result.recommendedAction).toBe('send_welcome');
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.leadOutcomeGuardrail).toContain('first value');
  });

  test('returns monitor for old payment beyond window', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 100_000_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.recommendedAction).toBe('none');
    expect(result.control.riskClass).toBe('R1');
    expect(result.control.safeNextStep).toContain('No anti-remorse action');
  });

  test('risk decreases with refund_risk parameter', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const lowRisk = svc.assess(baseInput(events, 'wks_001', now), 0.1);
    const highRisk = svc.assess(baseInput(events, 'wks_001', now), 0.5);
    expect(highRisk.remorseRiskScore).toBeGreaterThanOrEqual(lowRisk.remorseRiskScore);
  });

  test('requires owner review for high-risk reassurance so post-sale help does not become pressure', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 2 * 3600_000).toISOString()),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];

    const result = svc.assess(baseInput(events, 'wks_001', now), 0.5);

    expect(result.recommendedAction).toBe('send_reassurance');
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.requiresHumanApproval).toBe(true);
    expect(result.control.leadOutcomeGuardrail).toContain('do not pressure');
    expect(result.control.rollback).toContain('do not send');
  });

  test('detects a same-entity objection before payment and routes reassurance through owner review', () => {
    const now = Date.now();
    const entityRef = { entityType: 'lead', entityId: 'lead_001' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 2 * 3600_000).toISOString(),
        { entityRef },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 30 * 60_000).toISOString(), {
        entityRef,
      }),
    ];

    const result = svc.assess(baseInput(events, 'wks_001', now));

    expect(result.entityRef).toEqual(entityRef);
    expect(result.objectionRecoveryDetected).toBe(true);
    expect(result.riskFactors).toContain('recent_objection_before_purchase');
    expect(result.recommendedAction).toBe('send_reassurance');
    expect(result.control.requiresHumanApproval).toBe(true);
    expect(result.control.safeNextStep).toContain('previously resolved objection');
    expect(result.control.leadOutcomeGuardrail).toContain('not reopened as pressure');
    expect(result.control.objectionRecoveryGuardrail).toContain('first value');
  });

  test('ignores stale prior objections outside the recovery lookback', () => {
    const now = Date.now();
    const entityRef = { entityType: 'lead', entityId: 'lead_001' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 72 * 3600_000).toISOString(),
        { entityRef },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 30 * 60_000).toISOString(), {
        entityRef,
      }),
    ];

    const result = svc.assess(baseInput(events, 'wks_001', now));

    expect(result.objectionRecoveryDetected).toBe(false);
    expect(result.riskFactors).not.toContain('recent_objection_before_purchase');
    expect(result.recommendedAction).toBe('monitor');
  });

  test('ignores objections raised after payment', () => {
    const now = Date.now();
    const entityRef = { entityType: 'lead', entityId: 'lead_001' };
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef,
      }),
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 30 * 60_000).toISOString(),
        { entityRef },
      ),
    ];

    const result = svc.assess(baseInput(events, 'wks_001', now));

    expect(result.objectionRecoveryDetected).toBe(false);
    expect(result.riskFactors).not.toContain('recent_objection_before_purchase');
    expect(result.recommendedAction).toBe('send_welcome');
  });

  test('ignores objections from a different entity', () => {
    const now = Date.now();
    const paymentEntity = { entityType: 'lead', entityId: 'lead_001' };
    const otherEntity = { entityType: 'lead', entityId: 'lead_002' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 2 * 3600_000).toISOString(),
        { entityRef: otherEntity },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 30 * 60_000).toISOString(), {
        entityRef: paymentEntity,
      }),
    ];

    const result = svc.assess(baseInput(events, 'wks_001', now));

    expect(result.entityRef).toEqual(paymentEntity);
    expect(result.objectionRecoveryDetected).toBe(false);
    expect(result.riskFactors).not.toContain('recent_objection_before_purchase');
    expect(result.recommendedAction).toBe('monitor');
  });

  test('does not use another customer payment or remorse signals when entity is explicit', () => {
    const now = Date.now();
    const target = { entityType: 'lead', entityId: 'lead_target' };
    const other = { entityType: 'lead', entityId: 'lead_other' };
    const targetPayment = makeEvent(
      'commerce.payment.approved',
      'wks_001',
      new Date(now - 20 * 60_000).toISOString(),
      { entityRef: target },
    );
    const events = [
      targetPayment,
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 5 * 60_000).toISOString(), {
        entityRef: other,
      }),
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 5 * 60_000).toISOString(), {
        entityRef: other,
      }),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 5 * 60_000).toISOString(),
        { entityRef: other },
      ),
    ];

    const result = svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.entityRef).toEqual(target);
    expect(result.paymentEventId).toBe(targetPayment.eventId);
    expect(result.remorseRiskScore).toBe(0);
    expect(result.riskFactors).toHaveLength(0);
    expect(result.recommendedAction).toBe('monitor');
  });
});
