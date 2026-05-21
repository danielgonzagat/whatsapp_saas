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

describe('POSTSALE-010 — Retention Honest Tactics', () => {
  let svc: RetentionHonestTactics;

  beforeEach(() => {
    svc = new RetentionHonestTactics();
  });

  test('suggests personal checkin for critical risk', () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'critical' as const,
      riskProbability: 0.8,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const],
      daysSinceLastActivity: 35,
      assessedAt: new Date().toISOString(),
    };
    const tactic = svc.suggest(risk, baseInput([], 'wks_001'));
    expect(tactic.tacticKind).toBe('personal_checkin');
    expect(tactic.urgency).toBe('now');
    expect(tactic.requiresHumanApproval).toBe(true);
    expect(tactic.control.riskClass).toBe('R2');
    expect(tactic.control.delegationMode).toBe('owner_review');
    expect(tactic.control.leadOutcomeGuardrail).toContain('do not pressure');
  });

  test('suggests success reminder for high inactivity risk', () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'high' as const,
      riskProbability: 0.6,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const],
      daysSinceLastActivity: 20,
      assessedAt: new Date().toISOString(),
    };
    const tactic = svc.suggest(risk, baseInput([], 'wks_001'));
    expect(tactic.tacticKind).toBe('success_reminder');
    expect(tactic.requiresHumanApproval).toBe(false);
    expect(tactic.control.riskClass).toBe('R1');
    expect(tactic.control.safeNextStep).toContain('informational support');
  });

  test('suggests feature unlock for low risk', () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'low' as const,
      riskProbability: 0.1,
      primarySignal: undefined,
      contributingSignals: [],
      daysSinceLastActivity: 2,
      assessedAt: new Date().toISOString(),
    };
    const tactic = svc.suggest(risk, baseInput([], 'wks_001'));
    expect(tactic.urgency).toBe('background');
    expect(tactic.control.rollback).toContain('pause the tactic');
  });

  test('does not use another customer first value for low-risk success reminder', () => {
    const now = Date.now();
    const target = { entityType: 'customer', entityId: 'cust_target' };
    const other = { entityType: 'customer', entityId: 'cust_other' };
    const risk = {
      workspaceId: 'wks_001',
      entityRef: target,
      riskLevel: 'low' as const,
      riskProbability: 0.1,
      primarySignal: undefined,
      contributingSignals: [],
      daysSinceLastActivity: 2,
      assessedAt: new Date(now).toISOString(),
    };
    const events = [
      makeEvent(
        'commerce.post_sale.first_value_obtained',
        'wks_001',
        new Date(now - 3600_000).toISOString(),
        { entityRef: other },
      ),
    ];

    const tactic = svc.suggest(risk, { ...baseInput(events, 'wks_001', now), entityRef: target });

    expect(tactic.entityRef).toEqual(target);
    expect(tactic.tacticKind).toBe('feature_unlock');
    expect(tactic.description).toContain('informational only');
    expect(tactic.control.riskClass).toBe('R1');
  });

  test('explain returns human-readable string', () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'moderate' as const,
      riskProbability: 0.4,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const],
      daysSinceLastActivity: 10,
      assessedAt: new Date().toISOString(),
    };
    const tactic = svc.suggest(risk, baseInput([], 'wks_001'));
    const explanation = svc.explain(tactic);
    expect(explanation).toContain(tactic.tacticKind);
  });
});

describe('POSTSALE-011 — Win-Back Window Advisor', () => {
  let spine: SpineEmitterService;
  let svc: WinBackWindowAdvisor;

  beforeEach(() => {
    spine = makeSpine();
    svc = new WinBackWindowAdvisor(spine);
  });

  test('emits win_back_window for critical risk', async () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'critical' as const,
      riskProbability: 0.8,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const],
      daysSinceLastActivity: 40,
      assessedAt: new Date().toISOString(),
    };
    const plan = await svc.assess(risk, baseInput([], 'wks_001'));
    expect(plan.windowOpen).toBe(true);
    expect(plan.tacticKind).toBe('conditional_return_offer');
    expect(plan.control.riskClass).toBe('R2');
    expect(plan.control.delegationMode).toBe('owner_review');
    expect(plan.control.safeNextStep).toContain('do not lead with discount');
    const winbackEvents = spine
      .recentEvents()
      .filter((e) => e.eventName === 'commerce.post_sale.win_back_window_opened');
    expect(winbackEvents.length).toBeGreaterThan(0);
  });

  test('suggests departure survey for high risk', async () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'high' as const,
      riskProbability: 0.6,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const],
      daysSinceLastActivity: 20,
      assessedAt: new Date().toISOString(),
    };
    const plan = await svc.assess(risk, baseInput([], 'wks_001'));
    expect(plan.tacticKind).toBe('departure_survey');
    expect(plan.windowOpen).toBe(true);
    expect(plan.control.riskClass).toBe('R2');
    expect(plan.control.leadOutcomeGuardrail).toContain('heard');
  });

  test('keeps objection-rooted moderate risk silent instead of opening a win-back window', async () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_objection' },
      riskLevel: 'moderate' as const,
      riskProbability: 0.4,
      primarySignal: 'first_value_missing' as const,
      contributingSignals: ['first_value_missing' as const, 'recent_objection_recovery' as const],
      daysSinceLastActivity: 8,
      assessedAt: new Date().toISOString(),
      control: {
        riskClass: 'R1' as const,
        delegationMode: 'silent_monitoring' as const,
        safeNextStep:
          'Keep monitoring and avoid churn outreach until risk evidence becomes stronger.',
        uncertainty:
          'Moderate risk includes a recently recovered objection without first-value proof; treat it as a listening signal, not permission to sell.',
        leadOutcomeGuardrail:
          'Do not reopen the prior objection as pressure; wait for stronger help, support, first-value, or explicit concern evidence.',
        rollback: 'Drop the churn action and keep the customer in normal post-sale support.',
      },
    };

    const plan = await svc.assess(risk, baseInput([], 'wks_001'));

    expect(plan.windowOpen).toBe(false);
    expect(plan.tacticKind).toBe('reengagement_content');
    expect(plan.suggestedChannel).toBe('silent');
    expect(plan.control.delegationMode).toBe('silent_monitoring');
    expect(plan.control.safeNextStep).toContain('private support context');
    expect(plan.control.leadOutcomeGuardrail).toContain('Do not reopen the prior objection');
    const winbackEvents = spine
      .recentEvents()
      .filter((e) => e.eventName === 'commerce.post_sale.win_back_window_opened');
    expect(winbackEvents).toHaveLength(0);
  });

  test('requires owner-reviewed product context for high objection-rooted churn risk', async () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_objection_high' },
      riskLevel: 'high' as const,
      riskProbability: 0.6,
      primarySignal: 'inactivity' as const,
      contributingSignals: ['inactivity' as const, 'recent_objection_recovery' as const],
      daysSinceLastActivity: 20,
      assessedAt: new Date().toISOString(),
      control: {
        riskClass: 'R2' as const,
        delegationMode: 'owner_review' as const,
        safeNextStep:
          'Prepare a human-reviewed retention check-in focused on help, context, and expectation repair.',
        uncertainty:
          'Churn risk is inferred from inactivity, recent_objection_recovery signals, not an observed cancellation request.',
        leadOutcomeGuardrail:
          'The customer must feel helped and heard; do not pressure, guilt, discount-first, or imply blame.',
        rollback: 'Do not send if owner cannot review context.',
      },
    };

    const plan = await svc.assess(risk, baseInput([], 'wks_001'));

    expect(plan.windowOpen).toBe(true);
    expect(plan.tacticKind).toBe('product_evolution_update');
    expect(plan.suggestedChannel).toBe('email');
    expect(plan.control.riskClass).toBe('R2');
    expect(plan.control.delegationMode).toBe('owner_review');
    expect(plan.control.safeNextStep).toContain('Owner must review');
    expect(plan.control.leadOutcomeGuardrail).toContain('Do not reopen the prior objection');
    const [winbackEvent] = spine
      .recentEvents()
      .filter((e) => e.eventName === 'commerce.post_sale.win_back_window_opened');
    expect(winbackEvent?.payload).toMatchObject({ tacticKind: 'product_evolution_update' });
  });

  test('silent for low risk', async () => {
    const risk = {
      workspaceId: 'wks_001',
      entityRef: { entityType: 'customer', entityId: 'cust_1' },
      riskLevel: 'low' as const,
      riskProbability: 0.1,
      primarySignal: undefined,
      contributingSignals: [],
      daysSinceLastActivity: 2,
      assessedAt: new Date().toISOString(),
    };
    const plan = await svc.assess(risk, baseInput([], 'wks_001'));
    expect(plan.windowOpen).toBe(false);
    expect(plan.suggestedChannel).toBe('silent');
    expect(plan.control.delegationMode).toBe('silent_monitoring');
    expect(plan.control.safeNextStep).toContain('Keep the win-back window closed');
  });
});
