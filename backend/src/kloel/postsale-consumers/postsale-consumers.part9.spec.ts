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

describe('POSTSALE-009 — Churn Risk Detector', () => {
  let spine: SpineEmitterService;
  let svc: ChurnRiskDetector;

  beforeEach(() => {
    spine = makeSpine();
    svc = new ChurnRiskDetector(spine);
  });

  test('low risk with active events', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.whatsapp.message_replied',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskLevel).toBe('low');
    expect(result.riskProbability).toBeLessThan(0.3);
    expect(result.control.riskClass).toBe('R1');
    expect(result.control.delegationMode).toBe('silent_monitoring');
  });

  test('does not penalize a very recent payment for missing first value', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskLevel).toBe('low');
    expect(result.riskProbability).toBe(0);
    expect(result.contributingSignals).not.toContain('first_value_missing');
  });

  test('surfaces first value missing when old payment never reaches value', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 30 * 86400_000).toISOString(),
      ),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskLevel).toBe('moderate');
    expect(result.contributingSignals).toContain('first_value_missing');
  });

  test('treats stalled activation without first value as moderate risk', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 10 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 8 * 86400_000).toISOString(),
      ),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskLevel).toBe('moderate');
    expect(result.contributingSignals).toContain('first_value_missing');
  });

  test('treats recent pre-purchase objection without first value as listening risk, not pressure', async () => {
    const now = Date.now();
    const customer = { entityType: 'customer', entityId: 'cust_objection' };
    const paymentAt = now - 8 * 86400_000;
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(paymentAt - 2 * 3600_000).toISOString(),
        { entityRef: customer },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(paymentAt).toISOString(), {
        entityRef: customer,
      }),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 7 * 86400_000).toISOString(),
        { entityRef: customer },
      ),
    ];

    const result = await svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: customer });

    expect(result.riskLevel).toBe('moderate');
    expect(result.riskProbability).toBe(0.4);
    expect(result.contributingSignals).toContain('first_value_missing');
    expect(result.contributingSignals).toContain('recent_objection_recovery');
    expect(result.control.riskClass).toBe('R1');
    expect(result.control.delegationMode).toBe('silent_monitoring');
    expect(result.control.uncertainty).toContain('listening signal');
    expect(result.control.leadOutcomeGuardrail).toContain('Do not reopen the prior objection');
    expect(spine.recentEvents()).toHaveLength(0);
  });

  test('does not let another customer objection raise churn risk', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const paymentAt = now - 8 * 86400_000;
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(paymentAt - 2 * 3600_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(paymentAt).toISOString(), {
        entityRef: target,
      }),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 7 * 86400_000).toISOString(),
        { entityRef: target },
      ),
    ];

    const result = await svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.riskLevel).toBe('low');
    expect(result.riskProbability).toBe(0.2);
    expect(result.contributingSignals).toContain('first_value_missing');
    expect(result.contributingSignals).not.toContain('recent_objection_recovery');
  });

  test('critical risk with inactivity + refund + declined', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.refunded',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.payment.declined',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 1 * 86400_000).toISOString(),
      ),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskProbability).toBeGreaterThan(0.3);
    expect(result.contributingSignals).toContain('handoff_repeat');
    expect(result.contributingSignals).toContain('refund_request');
    expect(result.contributingSignals).toContain('declined_payment');
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('do not pressure');
  });

  test('does not use another customer risk events to mark churn risk', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef: target,
      }),
      makeEvent(
        'commerce.payment.refunded',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.payment.declined',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'negative' } },
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 1 * 86400_000).toISOString(),
        { entityRef: other },
      ),
    ];

    const result = await svc.assess({ ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(result.entityRef).toEqual(target);
    expect(result.riskLevel).toBe('low');
    expect(result.riskProbability).toBe(0);
    expect(result.contributingSignals).toHaveLength(0);
    expect(spine.recentEvents()).toHaveLength(0);
  });

  test('emits churn_risk_detected on high risk', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.refunded',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.payment.declined',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.member_area.dropped_out',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
        { payload: { sentimentLabel: 'negative' } },
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 5 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.whatsapp.handoff_to_human',
        'wks_001',
        new Date(now - 1 * 86400_000).toISOString(),
      ),
    ];
    await svc.assess(baseInput(events, 'wks_001', now));
    const churnEvents = spine
      .recentEvents()
      .filter((e) => e.eventName === 'commerce.post_sale.churn_risk_detected');
    expect(churnEvents.length).toBeGreaterThan(0);
  });
});
