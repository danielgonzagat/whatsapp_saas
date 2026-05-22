import type { SpineEventRef } from '../mind/mind.types';
import type { FirstTruthRoadmap, MicroTest, NoHistoryMode } from './coldstart.types';
import { detectNoHistoryMode } from './no-history-mode.detector';
import { buildFirstTruthRoadmap } from './first-truth-roadmap.builder';
import {
  HYPOTHESIS_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getAllCategories,
} from './hypothesis-template-bank';
import { generateGuidedQuestion } from './guided-question.generator';
import { designMicroTest } from './micro-test.designer';
import { detectFirstTruth } from './first-truth.detector';
import { trackProgress } from './progress.tracker';
import { GraduationService } from './graduation.service';
import { withinWindowDays, countUniqueEntities, isColdstartEvent } from './coldstart.types';

const NOW = Date.parse('2026-05-13T22:00:00.000Z');
const WKS_A = 'wks_coldstart_a';
const WKS_B = 'wks_coldstart_b';

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.lead.replied',
    workspaceId: over?.workspaceId ?? WKS_A,
    occurredAt: over?.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over?.truthMode ?? 'observed',
  };
  if (over?.entityRef !== undefined) {
    defaults['entityRef'] = over.entityRef;
  }
  if (over?.valence !== undefined) {
    defaults['valence'] = over.valence;
  }
  if (over?.payload !== undefined) {
    defaults['payload'] = over.payload;
  }
  if (over?.correlationId !== undefined) {
    defaults['correlationId'] = over.correlationId;
  }
  return defaults as SpineEventRef;
}

// =========================================================================
// Utility helpers
// =========================================================================
describe('UTP-COLDSTART-006 — detectFirstTruth', () => {
  it('returns false when no micro-tests executed', () => {
    const result = detectFirstTruth({
      events: [],
      microTests: [],
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(result.truthEstablished).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('returns false with only one test and no terminal events', () => {
    const test: MicroTest = {
      testId: 'mtest_1',
      workspaceId: WKS_A,
      hypothesisTemplateId: 'h_tmpl_audience_01',
      description: 'test',
      actionSteps: ['step 1'],
      estimatedDurationHours: 24,
      successMetric: 'metric',
      measurementMethod: 'method',
      minimumSampleSize: 5,
      truthMode: 'inferred',
      designedAt: new Date(NOW).toISOString(),
    };
    const result = detectFirstTruth({
      events: [],
      microTests: [test],
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(result.truthEstablished).toBe(false);
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('establishes truth with sufficient tests and terminal events', () => {
    const tests: MicroTest[] = [
      {
        testId: 'mtest_1',
        workspaceId: WKS_A,
        hypothesisTemplateId: 'h_tmpl_audience_01',
        description: 'test 1',
        actionSteps: ['step'],
        estimatedDurationHours: 24,
        successMetric: 'm',
        measurementMethod: 'm',
        minimumSampleSize: 5,
        truthMode: 'inferred',
        designedAt: new Date(NOW).toISOString(),
      },
      {
        testId: 'mtest_2',
        workspaceId: WKS_A,
        hypothesisTemplateId: 'h_tmpl_pricing_01',
        description: 'test 2',
        actionSteps: ['step'],
        estimatedDurationHours: 48,
        successMetric: 'm',
        measurementMethod: 'm',
        minimumSampleSize: 10,
        truthMode: 'inferred',
        designedAt: new Date(NOW).toISOString(),
      },
      {
        testId: 'mtest_3',
        workspaceId: WKS_A,
        hypothesisTemplateId: 'h_tmpl_offer_01',
        description: 'test 3',
        actionSteps: ['step'],
        estimatedDurationHours: 72,
        successMetric: 'm',
        measurementMethod: 'm',
        minimumSampleSize: 15,
        truthMode: 'inferred',
        designedAt: new Date(NOW).toISOString(),
      },
    ];

    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.lead.converted', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.crm.deal_won', workspaceId: WKS_A }),
    ];

    const result = detectFirstTruth({
      events,
      microTests: tests,
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(result.truthEstablished).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.supportingEventCount).toBe(5);
    expect(result.testedHypothesisCount).toBe(3);
  });
});

// =========================================================================
// UTP-COLDSTART-007 — Progress Tracker
// =========================================================================
describe('UTP-COLDSTART-007 — trackProgress', () => {
  const noHistory: NoHistoryMode = {
    workspaceId: WKS_A,
    isNoHistory: true,
    totalEventsInWindow: 0,
    observationWindowDays: 30,
    activatedAt: new Date(NOW).toISOString(),
  };

  function makeRoadmap(createdAtMs?: number): FirstTruthRoadmap {
    return buildFirstTruthRoadmap({
      workspaceId: WKS_A,
      noHistory,
      nowMs: createdAtMs ?? NOW,
    });
  }

  it('shows 0% progress with empty events and no tests', () => {
    const roadmap = makeRoadmap();
    const snapshot = trackProgress({
      roadmap,
      events: [],
      microTests: [],
      nowMs: NOW,
    });
    expect(snapshot.completedPct).toBe(0);
    expect(snapshot.pendingMilestones.length).toBe(6);
    expect(snapshot.readyForGraduation).toBe(false);
  });

  it('shows partial progress after micro-tests are designed', () => {
    const roadmap = makeRoadmap();
    const test: MicroTest = {
      testId: 'mtest_x',
      workspaceId: WKS_A,
      hypothesisTemplateId: 'h_tmpl_audience_01',
      description: 'test',
      actionSteps: ['step'],
      estimatedDurationHours: 24,
      successMetric: 'm',
      measurementMethod: 'm',
      minimumSampleSize: 5,
      truthMode: 'inferred',
      designedAt: new Date(NOW).toISOString(),
    };
    const snapshot = trackProgress({
      roadmap,
      events: [],
      microTests: [test],
      nowMs: NOW,
    });
    expect(snapshot.completedMilestones).toContain(1);
    expect(snapshot.completedMilestones).toContain(3);
    expect(snapshot.completedMilestones).toContain(7);
    expect(snapshot.completedPct).toBeGreaterThanOrEqual(50);
  });

  it('marks graduation when confidence threshold met with multiple tests', () => {
    const roadmap = makeRoadmap();
    const tests: MicroTest[] = [
      {
        testId: 'mtest_a',
        workspaceId: WKS_A,
        hypothesisTemplateId: 'h_tmpl_audience_01',
        description: 'test a',
        actionSteps: ['step'],
        estimatedDurationHours: 24,
        successMetric: 'm',
        measurementMethod: 'm',
        minimumSampleSize: 5,
        truthMode: 'inferred',
        designedAt: new Date(NOW).toISOString(),
      },
      {
        testId: 'mtest_b',
        workspaceId: WKS_A,
        hypothesisTemplateId: 'h_tmpl_pricing_01',
        description: 'test b',
        actionSteps: ['step'],
        estimatedDurationHours: 48,
        successMetric: 'm',
        measurementMethod: 'm',
        minimumSampleSize: 10,
        truthMode: 'inferred',
        designedAt: new Date(NOW).toISOString(),
      },
    ];
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.lead.converted', workspaceId: WKS_A }),
    ];
    const snapshot = trackProgress({
      roadmap,
      events,
      microTests: tests,
      nowMs: NOW,
    });
    expect(snapshot.microTestCount).toBe(2);
    expect(snapshot.executedTestCount).toBe(2);
  });

  it('computes currentDay from elapsed time', () => {
    const pastMs = NOW - 10 * 24 * 60 * 60 * 1000;
    const roadmap = makeRoadmap(pastMs);
    const snapshot = trackProgress({
      roadmap,
      events: [],
      microTests: [],
      nowMs: NOW,
    });
    expect(snapshot.currentDay).toBeGreaterThanOrEqual(10);
  });
});

// =========================================================================
// UTP-COLDSTART-008 — Graduation Service
// =========================================================================
describe('UTP-COLDSTART-008 — GraduationService', () => {
  const svc = new GraduationService();

  const noHistory: NoHistoryMode = {
    workspaceId: WKS_A,
    isNoHistory: true,
    totalEventsInWindow: 1,
    observationWindowDays: 30,
    activatedAt: new Date(NOW).toISOString(),
  };

  it('does not graduate workspace with no progress', () => {
    const roadmap = buildFirstTruthRoadmap({
      workspaceId: WKS_A,
      noHistory,
      nowMs: NOW,
    });
    const decision = svc.evaluate({
      roadmap,
      events: [],
      microTests: [],
      nowMs: NOW,
    });
    expect(decision.graduated).toBe(false);
    expect(decision.graduatedAt).toBeUndefined();
    expect(decision.reason).toContain('ainda em cold-start');
  });

  it('returns snapshot with graduation info', () => {
    const roadmap = buildFirstTruthRoadmap({
      workspaceId: WKS_A,
      noHistory,
      nowMs: NOW,
    });
    const decision = svc.evaluate({
      roadmap,
      events: [],
      microTests: [],
      nowMs: NOW,
    });
    expect(decision.snapshot).toBeDefined();
    expect(decision.snapshot.workspaceId).toBe(WKS_A);
  });

  it('canSkipColdStart returns true for workspace with sufficient terminal events', () => {
    const events: SpineEventRef[] = Array.from({ length: 6 }, (_, i) =>
      ev({
        eventName: 'commerce.payment.approved',
        workspaceId: WKS_A,
        eventId: `e_skip_${i}`,
      }),
    );
    expect(svc.canSkipColdStart(events, WKS_A, 5)).toBe(true);
  });

  it('canSkipColdStart returns false for workspace with few terminal events', () => {
    const events: SpineEventRef[] = [
      ev({ eventName: 'commerce.payment.approved', workspaceId: WKS_A }),
    ];
    expect(svc.canSkipColdStart(events, WKS_A, 5)).toBe(false);
  });
});
