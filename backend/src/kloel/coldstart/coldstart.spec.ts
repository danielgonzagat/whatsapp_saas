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
describe('coldstart utility helpers', () => {
  it('isColdstartEvent returns true for commerce events', () => {
    expect(isColdstartEvent('commerce.lead.created')).toBe(true);
    expect(isColdstartEvent('commerce.payment.approved')).toBe(true);
    expect(isColdstartEvent('cognition.belief_updated')).toBe(false);
  });

  it('withinWindowDays correctly filters timestamps', () => {
    const recent = '2026-05-12T00:00:00.000Z';
    const old = '2026-01-01T00:00:00.000Z';
    expect(withinWindowDays(recent, NOW, 30)).toBe(true);
    expect(withinWindowDays(old, NOW, 30)).toBe(false);
  });

  it('countUniqueEntities counts distinct entity IDs', () => {
    const events = [
      ev({ entityRef: { entityType: 'lead', entityId: 'l1' } }),
      ev({ entityRef: { entityType: 'lead', entityId: 'l2' } }),
      ev({ entityRef: { entityType: 'lead', entityId: 'l1' } }),
      ev({ entityRef: { entityType: 'deal', entityId: 'd1' } }),
    ];
    expect(countUniqueEntities(events, 'lead')).toBe(2);
    expect(countUniqueEntities(events, 'deal')).toBe(1);
  });
});

// =========================================================================
// UTP-COLDSTART-001 — No-History Mode Detector
// =========================================================================
describe('UTP-COLDSTART-001 — detectNoHistoryMode', () => {
  it('detects no-history when zero events present', () => {
    const result = detectNoHistoryMode({
      events: [],
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(result.isNoHistory).toBe(true);
    expect(result.totalEventsInWindow).toBe(0);
    expect(result.reason).toContain('apenas 0 eventos');
  });

  it('detects no-history when below threshold', () => {
    const events = [
      ev({ eventName: 'commerce.lead.created', workspaceId: WKS_A }),
      ev({ eventName: 'commerce.lead.contacted', workspaceId: WKS_A }),
    ];
    const result = detectNoHistoryMode({
      events,
      workspaceId: WKS_A,
      nowMs: NOW,
      threshold: 5,
    });
    expect(result.isNoHistory).toBe(true);
    expect(result.totalEventsInWindow).toBe(2);
  });

  it('does NOT flag no-history when events exceed threshold', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ev({
        eventName: 'commerce.payment.approved',
        workspaceId: WKS_A,
        eventId: `e_pay_${i}`,
      }),
    );
    const result = detectNoHistoryMode({
      events,
      workspaceId: WKS_A,
      nowMs: NOW,
      threshold: 5,
    });
    expect(result.isNoHistory).toBe(false);
    expect(result.totalEventsInWindow).toBe(8);
  });

  it('ignores events outside observation window', () => {
    const events = [
      ev({
        eventName: 'commerce.payment.approved',
        workspaceId: WKS_A,
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
    ];
    const result = detectNoHistoryMode({
      events,
      workspaceId: WKS_A,
      nowMs: NOW,
      windowDays: 30,
    });
    expect(result.totalEventsInWindow).toBe(0);
    expect(result.isNoHistory).toBe(true);
  });
});

// =========================================================================
// UTP-COLDSTART-002 — First-Truth Roadmap Builder
// =========================================================================
describe('UTP-COLDSTART-002 — buildFirstTruthRoadmap', () => {
  it('builds a roadmap with 6 milestones spanning 30 days', () => {
    const noHistory: NoHistoryMode = {
      workspaceId: WKS_A,
      isNoHistory: true,
      totalEventsInWindow: 1,
      observationWindowDays: 30,
      activatedAt: new Date(NOW).toISOString(),
    };
    const roadmap = buildFirstTruthRoadmap({
      workspaceId: WKS_A,
      noHistory,
      nowMs: NOW,
    });
    expect(roadmap.workspaceId).toBe(WKS_A);
    expect(roadmap.durationDays).toBe(30);
    expect(roadmap.milestones).toHaveLength(6);
    expect(roadmap.milestones[0]?.day).toBe(1);
    expect(roadmap.milestones[0]?.completed).toBe(false);
    expect(roadmap.milestones[5]?.day).toBe(30);
    expect(roadmap.roadmapId).toMatch(/^roadmap_/);
  });

  it('all milestones start as incomplete', () => {
    const noHistory: NoHistoryMode = {
      workspaceId: WKS_B,
      isNoHistory: true,
      totalEventsInWindow: 0,
      observationWindowDays: 30,
      activatedAt: new Date(NOW).toISOString(),
    };
    const roadmap = buildFirstTruthRoadmap({
      workspaceId: WKS_B,
      noHistory,
      nowMs: NOW,
    });
    expect(roadmap.milestones.every((m) => !m.completed)).toBe(true);
  });
});

// =========================================================================
// UTP-COLDSTART-003 — Hypothesis Template Bank
// =========================================================================
describe('UTP-COLDSTART-003 — hypothesis-template-bank', () => {
  it('contains at least 6 templates across all categories', () => {
    expect(HYPOTHESIS_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    const categories = getAllCategories();
    expect(categories.length).toBeGreaterThanOrEqual(4);
  });

  it('getTemplatesByCategory returns correct subset', () => {
    const audience = getTemplatesByCategory('audience');
    expect(audience.length).toBeGreaterThan(0);
    expect(audience.every((t) => t.category === 'audience')).toBe(true);
  });

  it('getTemplateById returns correct template', () => {
    const t = getTemplateById('h_tmpl_audience_01');
    expect(t).toBeDefined();
    expect(t?.category).toBe('audience');
    expect(t?.label).toBe('perfil do comprador');
  });

  it('getTemplateById returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });

  it('every template has suggested micro-tests', () => {
    expect(HYPOTHESIS_TEMPLATES.every((t) => t.suggestedMicroTests.length >= 1)).toBe(true);
  });
});

// =========================================================================
// UTP-COLDSTART-004 — Guided Question Generator
// =========================================================================
describe('UTP-COLDSTART-004 — generateGuidedQuestion', () => {
  const template = HYPOTHESIS_TEMPLATES[0]!;

  it('generates a question with required fields', () => {
    const q = generateGuidedQuestion({
      template,
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(q.questionId).toMatch(/^q_/);
    expect(q.workspaceId).toBe(WKS_A);
    expect(q.templateId).toBe(template.templateId);
    expect(q.question.length).toBeGreaterThan(10);
    expect(q.context.length).toBeGreaterThan(10);
    expect(['single_choice', 'free_text', 'yes_no', 'scale']).toContain(q.expectedAnswerKind);
  });

  it('single_choice questions include options', () => {
    const audienceTemplate = HYPOTHESIS_TEMPLATES.find((t) => t.category === 'audience')!;
    const q = generateGuidedQuestion({
      template: audienceTemplate,
      workspaceId: WKS_A,
    });
    expect(q.expectedAnswerKind).toBe('single_choice');
    expect(q.options).toEqual(['sim', 'nao', 'talvez']);
  });
});

// =========================================================================
// UTP-COLDSTART-005 — Micro-Test Designer
// =========================================================================
describe('UTP-COLDSTART-005 — designMicroTest', () => {
  const template = HYPOTHESIS_TEMPLATES[0]!;

  it('designs a micro-test from a template', () => {
    const test = designMicroTest({
      template,
      workspaceId: WKS_A,
      nowMs: NOW,
    });
    expect(test.testId).toMatch(/^mtest_/);
    expect(test.workspaceId).toBe(WKS_A);
    expect(test.hypothesisTemplateId).toBe(template.templateId);
    expect(test.actionSteps.length).toBeGreaterThan(0);
    expect(test.successMetric.length).toBeGreaterThan(5);
    expect(test.measurementMethod.length).toBeGreaterThan(5);
    expect(test.estimatedDurationHours).toBeGreaterThan(0);
    expect(test.minimumSampleSize).toBeGreaterThan(0);
    expect(test.truthMode).toBe('inferred');
  });

  it('uses template suggested micro-tests as action steps', () => {
    const test = designMicroTest({
      template,
      workspaceId: WKS_A,
    });
    expect(test.actionSteps).toEqual(template.suggestedMicroTests);
  });
});

// =========================================================================
// UTP-COLDSTART-006 — First Truth Detector
// =========================================================================