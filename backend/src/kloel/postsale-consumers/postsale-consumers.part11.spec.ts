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

describe('POSTSALE-012 — LTV Projection', () => {
  let svc: LtvProjectionService;

  beforeEach(() => {
    svc = new LtvProjectionService();
  });

  test('projects LTV with zero events', () => {
    const result = svc.project(baseInput([], 'wks_001'), 'cohort_2026_q1');
    expect(result.cohortKey).toBe('cohort_2026_q1');
    expect(result.cohortSize).toBe(0);
    expect(result.projectedLtvCents).toBe(0);
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('projects LTV from payment events', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(Date.now() - i * 7 * 86400_000).toISOString(),
          {
            payload: { amountCents: 9900 },
          },
        ),
      );
    }
    const result = svc.project(baseInput(events, 'wks_001'), 'cohort_a', 9900);
    expect(result.averageRevenueCents).toBe(9900);
    expect(result.projectedLtvCents).toBeGreaterThan(0);
    expect(result.projectedLtvMonths).toBe(24);
  });

  test('does not use another customer revenue or refund for entity LTV projection', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: target,
        payload: { amountCents: 10000 },
      }),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: other,
        payload: { amountCents: 50000 },
      }),
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 1).toISOString(), {
        entityRef: other,
      }),
    ];

    const projection = svc.project(
      { ...baseInput(events, 'wks_001', now), entityRef: target },
      'customer_target',
    );

    expect(projection.cohortSize).toBe(1);
    expect(projection.averageRevenueCents).toBe(10000);
    expect(projection.projectedLtvCents).toBe(240000);
  });

  test('LT decreases with higher churn', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(Date.now() - i * 7 * 86400_000).toISOString(),
        ),
      );
    }
    const lowChurn = svc.project(baseInput(events, 'wks_001'), 'low', 10000, 0.01);
    const highChurn = svc.project(baseInput(events, 'wks_001'), 'high', 10000, 0.15);
    expect(highChurn.projectedLtvCents).toBeLessThan(lowChurn.projectedLtvCents);
  });

  test('projectByChurnLevels returns three scenarios', () => {
    const result = svc.projectByChurnLevels([], 'wks_001', 'cohort_x');
    expect(result).toHaveLength(3);
    const [low, mid, high] = result;
    expect(low?.projectedLtvCents).toBeGreaterThanOrEqual((mid as LtvProjection).projectedLtvCents);
    expect(mid?.projectedLtvCents).toBeGreaterThanOrEqual(
      (high as LtvProjection).projectedLtvCents,
    );
  });

  test('confidence grows with event volume', () => {
    const lowVolume = svc.project(baseInput([], 'wks_001'), 'c1', 5000, 0.05);
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(
        makeEvent(
          'commerce.payment.approved',
          'wks_001',
          new Date(Date.now() - i * 86400_000).toISOString(),
          {
            payload: { amountCents: 9900 },
          },
        ),
      );
    }
    const highVolume = svc.project(baseInput(events, 'wks_001'), 'c2', 5000, 0.05);
    expect(highVolume.confidence).toBeGreaterThan(lowVolume.confidence);
  });
});
