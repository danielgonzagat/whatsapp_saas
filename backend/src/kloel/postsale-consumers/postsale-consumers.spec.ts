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

  test('stays silent when no payment exists', async () => {
    const result = await svc.assess(baseInput([], 'wks_001'));
    expect(result.phase).toBe('no_payment_observed');
    expect(result.isNoRegret).toBe(false);
    expect(result.control.delegationMode).toBe('silent_monitoring');
  });

  test('classifies immediate post-sale without claiming first value', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1800_000).toISOString()),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.phase).toBe('immediate_post_sale');
    expect(result.isNoRegret).toBe(false);
    expect(result.firstValue.valueObtained).toBe(false);
    expect(result.control.safeNextStep).toContain('wait for activation');
  });

  test('autoruns from checkout/post-sale spine events and confirms no-regret when value proof exists', async () => {
    const now = Date.now();
    const entityRef = { entityType: 'order', entityId: 'order_checkout_1' };
    const baseEvent = {
      workspaceId: 'wks_001',
      entityRef,
      truthMode: 'observed' as const,
      provenance: {
        source: 'production' as const,
        processor: 'checkout-post-payment-effects',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
    };

    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.payment.approved',
      occurredAt: new Date(now - 3 * 86400_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.lead.converted',
      occurredAt: new Date(now - 2 * 3600_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.crm.deal_won',
      occurredAt: new Date(now - 2 * 3600_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.member_area.progressed',
      occurredAt: new Date(now - 1800_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.crm.next_step_defined',
      occurredAt: new Date(now - 1500_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.post_sale.activation_started',
      occurredAt: new Date(now - 1200_000).toISOString(),
    });

    await flushAsyncConsumers();

    const noRegretEvents = spine
      .recentEvents()
      .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed');
    expect(noRegretEvents).toHaveLength(1);
    expect(noRegretEvents[0]?.workspaceId).toBe('wks_001');
    expect(noRegretEvents[0]?.entityRef).toEqual(entityRef);
    expect(noRegretEvents[0]?.provenance.processor).toBe('no-regret-pipeline');
  });

  test('autoruns when first-value proof arrives after activation', async () => {
    const now = Date.now();
    const entityRef = { entityType: 'order', entityId: 'order_first_value_after_activation' };
    const baseEvent = {
      workspaceId: 'wks_001',
      entityRef,
      truthMode: 'observed' as const,
      provenance: {
        source: 'production' as const,
        processor: 'post-sale-runtime',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
    };

    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.payment.approved',
      occurredAt: new Date(now - 3 * 86400_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.post_sale.activation_started',
      occurredAt: new Date(now - 2 * 86400_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.crm.next_step_defined',
      occurredAt: new Date(now - 1800_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.member_area.progressed',
      occurredAt: new Date(now - 1500_000).toISOString(),
    });
    await spine.emit({
      ...baseEvent,
      eventName: 'commerce.post_sale.first_value_obtained',
      occurredAt: new Date(now - 1200_000).toISOString(),
      payload: { firstValueKind: 'course_progress' },
    });

    await flushAsyncConsumers();

    const noRegretEvents = spine
      .recentEvents()
      .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed');
    expect(noRegretEvents).toHaveLength(1);
    expect(noRegretEvents[0]?.workspaceId).toBe('wks_001');
    expect(noRegretEvents[0]?.entityRef).toEqual(entityRef);
    expect(noRegretEvents[0]?.payload).toMatchObject({
      firstValueKind: 'explicit_first_value',
      guardrail: 'not_a_testimonial_or_satisfaction_claim',
    });
  });

  test('confirms no-regret only when activation and first value are both evidenced', async () => {
    const now = Date.now();
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 2 * 86400_000).toISOString(),
      ),
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 2 * 3600_000).toISOString(),
      ),
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 1800_000).toISOString(),
      ),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.phase).toBe('no_regret_confirmed');
    expect(result.isNoRegret).toBe(true);
    expect(result.control.riskClass).toBe('R1');
    expect(result.control.uncertainty).toContain('not a testimonial');
    const noRegretEvents = spine
      .recentEvents()
      .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed');
    expect(noRegretEvents).toHaveLength(1);
    expect(noRegretEvents[0]?.truthMode).toBe('inferred');
    expect(noRegretEvents[0]?.provenance.processor).toBe('no-regret-pipeline');
    expect(noRegretEvents[0]?.payload).toMatchObject({
      firstValueKind: 'course_progress',
      guardrail: 'not_a_testimonial_or_satisfaction_claim',
    });
  });

  test('does not confirm no-regret from another customer value when entity is inferred from payment', async () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent(
        'commerce.payment.approved',
        'wks_001',
        new Date(now - 3 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent(
        'commerce.post_sale.activation_started',
        'wks_001',
        new Date(now - 2 * 86400_000).toISOString(),
        { entityRef: target },
      ),
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef: other,
      }),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 3600_000).toISOString(), {
        entityRef: other,
      }),
      makeEvent(
        'commerce.member_area.progressed',
        'wks_001',
        new Date(now - 1800_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.crm.next_step_defined',
        'wks_001',
        new Date(now - 1500_000).toISOString(),
        { entityRef: other },
      ),
      makeEvent(
        'commerce.post_sale.satisfaction_signal_observed',
        'wks_001',
        new Date(now - 1200_000).toISOString(),
        { entityRef: other, payload: { sentimentLabel: 'positive' } },
      ),
    ];

    const result = await svc.assess(baseInput(events, 'wks_001', now));

    expect(result.entityRef).toEqual(target);
    expect(result.phase).toBe('value_forming');
    expect(result.isNoRegret).toBe(false);
    expect(result.firstValue.valueObtained).toBe(false);
    expect(
      spine
        .recentEvents()
        .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed'),
    ).toHaveLength(0);
  });

  test('does not confirm no-regret for a recovered-objection buyer without positive satisfaction', async () => {
    const now = Date.now();
    const entityRef = { entityType: 'customer', entityId: 'cust_objection_value' };
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
    ];

    const result = await svc.assess({ ...baseInput(events, 'wks_001', now), entityRef });

    expect(result.phase).toBe('value_forming');
    expect(result.isNoRegret).toBe(false);
    expect(result.firstValue.valueObtained).toBe(true);
    expect(result.control.uncertainty).toContain('no-regret is not confirmed yet');
    expect(
      spine
        .recentEvents()
        .filter((event) => event.eventName === 'commerce.post_sale.no_regret_confirmed'),
    ).toHaveLength(0);
  });
});
