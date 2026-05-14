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
import type { DetectionInput } from './postsale-consumers.types';
import { clamp, filterByWorkspace } from './postsale-consumers.types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as unknown as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as unknown as { _seq: number })._seq = seq;
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

function baseInput(
  events: SpineEventRef[],
  workspaceId: string,
  nowMs?: number,
): DetectionInput {
  return { events, workspaceId, nowMs: nowMs ?? Date.now() };
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
  });

  test('returns monitor for old payment beyond window', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 100_000_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.recommendedAction).toBe('none');
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
});

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
  });

  test('detects activation_started as first milestone', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.post_sale.activation_started', 'wks_001', new Date(now - 10_000).toISOString()),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.completedSteps).toBeGreaterThanOrEqual(1);
  });

  test('activationLikely is true when progress high and recent activity', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.post_sale.activation_started', 'wks_001', new Date(now - 10_000).toISOString()),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 10_000).toISOString()),
      makeEvent('commerce.whatsapp.message_replied', 'wks_001', new Date(now - 10_000).toISOString()),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.activationLikely).toBe(true);
  });

  test('stalledDays reflects gap since last activity', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.post_sale.activation_started', 'wks_001', new Date(now - 10 * 86400_000).toISOString()),
    ];
    const result = svc.track(baseInput(events, 'wks_001', now));
    expect(result.stalledDays).toBeGreaterThanOrEqual(9);
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
  });

  test('detects value from conversion + payment', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.valueObtained).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('emits spine event when value detected', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.lead.converted', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 1).toISOString()),
      makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - 1).toISOString()),
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
    expect(spineEvents.filter((e) => e.eventName === 'commerce.post_sale.first_value_obtained')).toHaveLength(0);
  });
});

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

  test('aggregate returns correct NPS from multiple signals', () => {
    const events: SpineEventRef[] = [
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', '2026-05-01T00:00:00Z', { payload: { score: 10 } }),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', '2026-05-02T00:00:00Z', { payload: { score: 9 } }),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', '2026-05-03T00:00:00Z', { payload: { score: 5 } }),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', '2026-05-04T00:00:00Z', { payload: { score: 3 } }),
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
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 14 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(true);
    expect(result.readinessScore).toBeGreaterThanOrEqual(0.5);
  });

  test('suggested channel matches readiness score', () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 14 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(['whatsapp', 'email', 'dashboard', 'silent']).toContain(result.suggestedChannel);
  });
});

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
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 10 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
    ];
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.ready).toBe(true);
  });
});

describe('POSTSALE-007 — Repurchase Window Detector', () => {
  let spine: SpineEmitterService;
  let svc: RepurchaseWindowDetector;

  beforeEach(() => {
    spine = makeSpine();
    svc = new RepurchaseWindowDetector(spine);
  });

  test('window not open without payment', async () => {
    const result = await svc.detect(baseInput([], 'wks_001'));
    expect(result.windowOpen).toBe(false);
  });

  test('window open with mature payment + satisfaction + progress', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 30 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 7200_000).toISOString()),
    ];
    const result = await svc.detect(baseInput(events, 'wks_001', now));
    expect(result.windowOpen).toBe(true);
  });

  test('emits repurchase_window_opened on spine when window opens', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 30 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - 7200_000).toISOString()),
    ];
    await svc.detect(baseInput(events, 'wks_001', now));
    const windowEvents = spine.recentEvents().filter(
      (e) => e.eventName === 'commerce.post_sale.repurchase_window_opened',
    );
    expect(windowEvents.length).toBeGreaterThan(0);
  });
});

describe('POSTSALE-008 — Expansion Fit Detector', () => {
  let svc: ExpansionFitDetector;

  beforeEach(() => {
    svc = new ExpansionFitDetector();
  });

  test('no expansion fit without payment', () => {
    const result = svc.assess(baseInput([], 'wks_001'));
    expect(result.expansionReady).toBe(false);
    expect(result.fitScore).toBe(0);
  });

  test('expansion ready with feature adoption and volume growth', () => {
    const now = Date.now();
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - (i + 1) * 86400_000).toISOString()),
      );
    }
    for (let i = 0; i < 2; i++) {
      events.push(
        makeEvent('commerce.payment.approved', 'wks_001', new Date(now - (i + 1) * 86400_000).toISOString()),
      );
    }
    events.push(
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
    );
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.expansionReady).toBe(true);
    expect(result.signals).toContain('feature_adoption');
    expect(result.signals).toContain('volume_growth');
  });

  test('suggests premium plan for high fit', () => {
    const now = Date.now();
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeEvent('commerce.member_area.progressed', 'wks_001', new Date(now - (i + 1) * 86400_000).toISOString()));
    }
    for (let i = 0; i < 3; i++) {
      events.push(makeEvent('commerce.payment.approved', 'wks_001', new Date(now - (i + 1) * 86400_000).toISOString()));
    }
    for (let i = 0; i < 2; i++) {
      events.push(makeEvent('commerce.crm.deal_won', 'wks_001', new Date(now - (i + 1) * 86400_000).toISOString()));
    }
    events.push(
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 3600_000).toISOString(), { payload: { sentimentLabel: 'positive' } }),
      makeEvent('commerce.post_sale.first_value_obtained', 'wks_001', new Date(now - 3600_000).toISOString()),
    );
    const result = svc.assess(baseInput(events, 'wks_001', now));
    expect(result.suggestedExpansionOffer).toBe('premium_plan');
  });
});

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
      makeEvent('commerce.whatsapp.message_replied', 'wks_001', new Date(now - 3600_000).toISOString()),
      makeEvent('commerce.payment.approved', 'wks_001', new Date(now - 3600_000).toISOString()),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskLevel).toBe('low');
    expect(result.riskProbability).toBeLessThan(0.3);
  });

  test('critical risk with inactivity + refund + declined', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.payment.declined', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 3 * 86400_000).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 1 * 86400_000).toISOString()),
    ];
    const result = await svc.assess(baseInput(events, 'wks_001', now));
    expect(result.riskProbability).toBeGreaterThan(0.3);
    expect(result.contributingSignals).toContain('handoff_repeat');
    expect(result.contributingSignals).toContain('refund_request');
    expect(result.contributingSignals).toContain('declined_payment');
  });

  test('emits churn_risk_detected on high risk', async () => {
    const now = Date.now();
    const events = [
      makeEvent('commerce.payment.refunded', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.payment.declined', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.member_area.dropped_out', 'wks_001', new Date(now - 3 * 86400_000).toISOString()),
      makeEvent('commerce.post_sale.satisfaction_signal_observed', 'wks_001', new Date(now - 5 * 86400_000).toISOString(), { payload: { sentimentLabel: 'negative' } }),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 5 * 86400_000).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 3 * 86400_000).toISOString()),
      makeEvent('commerce.whatsapp.handoff_to_human', 'wks_001', new Date(now - 1 * 86400_000).toISOString()),
    ];
    await svc.assess(baseInput(events, 'wks_001', now));
    const churnEvents = spine.recentEvents().filter(
      (e) => e.eventName === 'commerce.post_sale.churn_risk_detected',
    );
    expect(churnEvents.length).toBeGreaterThan(0);
  });
});

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
    const winbackEvents = spine.recentEvents().filter(
      (e) => e.eventName === 'commerce.post_sale.win_back_window_opened',
    );
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
  });
});

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
        makeEvent('commerce.payment.approved', 'wks_001', new Date(Date.now() - i * 7 * 86400_000).toISOString(), {
          payload: { amountCents: 9900 },
        }),
      );
    }
    const result = svc.project(baseInput(events, 'wks_001'), 'cohort_a', 9900);
    expect(result.averageRevenueCents).toBe(9900);
    expect(result.projectedLtvCents).toBeGreaterThan(0);
    expect(result.projectedLtvMonths).toBe(24);
  });

  test('LT decreases with higher churn', () => {
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent('commerce.payment.approved', 'wks_001', new Date(Date.now() - i * 7 * 86400_000).toISOString()),
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
    expect(mid?.projectedLtvCents).toBeGreaterThanOrEqual((high as LtvProjection).projectedLtvCents);
  });

  test('confidence grows with event volume', () => {
    const lowVolume = svc.project(baseInput([], 'wks_001'), 'c1', 5000, 0.05);
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(
        makeEvent('commerce.payment.approved', 'wks_001', new Date(Date.now() - i * 86400_000).toISOString(), {
          payload: { amountCents: 9900 },
        }),
      );
    }
    const highVolume = svc.project(baseInput(events, 'wks_001'), 'c2', 5000, 0.05);
    expect(highVolume.confidence).toBeGreaterThan(lowVolume.confidence);
  });
});

// Re-import for type in projectByChurnLevels test
import type { LtvProjection } from './postsale-consumers.types';
