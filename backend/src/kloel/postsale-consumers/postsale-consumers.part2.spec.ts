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

describe('POSTSALE-000 — No-Regret Pipeline', () => {
  let svc: NoRegretPipelineService;
  let spine: SpineEmitterService;

  beforeEach(() => {
    spine = makeSpine();
    svc = new NoRegretPipelineService(
      new AntiRemorseService(),
      new ActivationCompanionService(),
      new FirstValueDetector(spine),
      spine,
    );
  });

  test('confirms no-regret for a recovered-objection buyer only with positive satisfaction', async () => {
    const now = Date.now();
    const entityRef = { entityType: 'customer', entityId: 'cust_objection_satisfied' };
    const paymentAt = now - 3 * 86400_000;
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(paymentAt - 2 * 3600_000).toISOString(),
        { entityRef },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(paymentAt).toISOString(), {
        entityRef,
      }),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 2 * 86400_000).toISOString(),
        { entityRef },
      ),
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef,
      }),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef,
      }),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 1800_000).toISOString(),
        { entityRef },
      ),
      makeEvent(
        'commerce.crm.next_step_defined',
        'wks_001',
        new Date(now - 1500_000).toISOString(),
        { entityRef },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 1200_000).toISOString(),
        { entityRef, payload: { sentimentLabel: 'positive' } },
      ),
    ];

    const result = await svc.assess({ ...baseInput(events, 'wks_001', now), entityRef });

    expect(result.phase).toBe('no_regret_confirmed');
    expect(result.isNoRegret).toBe(true);
    expect(result.firstValue.valueObtained).toBe(true);
    const noRegretEvents = spine
      .recentEvents()
      .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed');
    expect(noRegretEvents).toHaveLength(1);
    expect(noRegretEvents[0]?.payload).toMatchObject({
      guardrail: 'not_a_testimonial_or_satisfaction_claim',
    });
  });

  test('routes stalled activation to owner-reviewed help', async () => {
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
    expect(result.phase).toBe('stalled_risk');
    expect(result.isNoRegret).toBe(false);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.control.leadOutcomeGuardrail).toContain('not pressure');
  });

  test('prioritizes recovery when anti-remorse risk is high', async () => {
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
    const result = await svc.assess(baseInput(events, 'wks_001', now), 0.5);
    expect(result.phase).toBe('recovery_needed');
    expect(result.isNoRegret).toBe(false);
    expect(result.control.safeNextStep).toContain('Prioritize anti-remorse recovery');
    expect(result.control.rollback).toContain('do not send');
  });

  test('keeps purchase after a real objection in owner-reviewed recovery until first value lands', async () => {
    const now = Date.now();
    const entityRef = { entityType: 'lead', entityId: 'lead_001' };
    const events = [
      makeEvent(
        'commerce.lead.objection_raised',
        'wks_001',
        new Date(now - 3 * 3600_000).toISOString(),
        { entityRef },
      ),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef,
      }),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 1800_000).toISOString(),
        { entityRef },
      ),
    ];

    const result = await svc.assess(baseInput(events, 'wks_001', now));

    expect(result.phase).toBe('recovery_needed');
    expect(result.isNoRegret).toBe(false);
    expect(result.antiRemorse.objectionRecoveryDetected).toBe(true);
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
    expect(result.antiRemorse.control.safeNextStep).toContain('previously resolved objection');
  });
});
