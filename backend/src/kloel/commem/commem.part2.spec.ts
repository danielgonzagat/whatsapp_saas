import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { TimeMachineService } from './time-machine.service';
import { ValueQuantifier } from './value-quantifier';
import { NarrativeBuilder } from './narrative.builder';
import { AttributionGuard } from './attribution.guard';
import type { SpineEventRef } from '../mind/mind.types';
import type { MemoryDimension, MemoryProjection, ProjectionInput } from './commem.types';
import { makeEventFactoryMs } from '../../../test/helpers/spine-event-factory';

const makeEvent = makeEventFactoryMs();

function nowMs(): number {
  return Date.now();
}

describe('COMMEM-005 — ValueQuantifier', () => {
  let svc: ValueQuantifier;

  beforeEach(() => {
    svc = new ValueQuantifier();
  });

  test('quantifies value from events', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs()),
      makeEvent('commerce.crm.deal_won', 'wks_a', nowMs()),
      makeEvent('commerce.lead.converted', 'wks_a', nowMs()),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs()),
    ];

    const result = svc.quantify(events, 'wks_a');

    expect(result.workspaceId).toBe('wks_a');
    expect(result.totalEventCount).toBe(4);
    expect(result.distinctDomains).toBeGreaterThanOrEqual(2);
    expect(result.commercialDensity).toBeGreaterThan(0);
    expect(result.estimatedCapitalValue).toBeGreaterThan(0n);
    expect(result.knowledgeMaturityScore).toBeGreaterThanOrEqual(0);
    expect(result.knowledgeMaturityScore).toBeLessThanOrEqual(1);
  });

  test('returns zero quantification for empty events', () => {
    const result = svc.quantify([], 'wks_a');

    expect(result.totalEventCount).toBe(0);
    expect(result.distinctDomains).toBe(0);
    expect(result.commercialDensity).toBe(0);
    expect(result.knowledgeMaturityScore).toBe(0);
  });

  test('compare computes delta between two quantifications', () => {
    const eventsBefore = [makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 1000)];
    const eventsAfter = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 1000),
      makeEvent('commerce.crm.deal_won', 'wks_a', nowMs()),
    ];

    const before = svc.quantify(eventsBefore, 'wks_a');
    const after = svc.quantify(eventsAfter, 'wks_a');
    const delta = svc.compare(before, after);

    expect(delta.eventCountDelta).toBe(1);
    expect(delta.capitalDelta).toBeGreaterThan(0n);
  });
});

describe('COMMEM-006 — NarrativeBuilder', () => {
  let svc: NarrativeBuilder;

  beforeEach(() => {
    svc = new NarrativeBuilder();
  });

  test('builds narrative from events in period', () => {
    const periodStart = nowMs() - 7 * 24 * 3600_000;
    const periodEnd = nowMs();

    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 3 * 24 * 3600_000, {
        valence: 'positive',
      }),
      makeEvent('commerce.crm.deal_won', 'wks_a', nowMs() - 2 * 24 * 3600_000, {
        valence: 'positive',
      }),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs() - 1 * 24 * 3600_000),
    ];

    const result = svc.build({
      events,
      workspaceId: 'wks_a',
      periodStartMs: periodStart,
      periodEndMs: periodEnd,
    });

    expect(result.workspaceId).toBe('wks_a');
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.keyFindings.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('returns cold-start narrative for empty period', () => {
    const result = svc.build({
      events: [],
      workspaceId: 'wks_a',
      periodStartMs: 0,
      periodEndMs: 1000,
    });

    expect(result.summary).toContain('cold-start');
    expect(result.keyFindings).toEqual(['No events to analyze']);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });
});

describe('COMMEM-007 — AttributionGuard', () => {
  let svc: AttributionGuard;

  beforeEach(() => {
    svc = new AttributionGuard();
  });

  test('passes valid projections for correct workspace', () => {
    const projections: MemoryProjection[] = [
      {
        workspaceId: 'wks_a',
        dimension: 'working',
        snapshotAtMs: nowMs(),
        itemCount: 1,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
    ];

    const result = svc.validateProjections(projections, 'wks_a');
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.crossWorkspaceReferences).toBe(0);
  });

  test('detects cross-workspace projection leak', () => {
    const projections: MemoryProjection[] = [
      {
        workspaceId: 'wks_b',
        dimension: 'working',
        snapshotAtMs: nowMs(),
        itemCount: 1,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
      {
        workspaceId: 'wks_a',
        dimension: 'episodic',
        snapshotAtMs: nowMs(),
        itemCount: 1,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
    ];

    const result = svc.validateProjections(projections, 'wks_a');
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.crossWorkspaceReferences).toBe(1);
    expect(result.violations[0].leakedWorkspaceId).toBe('wks_b');
  });

  test('detects cross-workspace capsule leak', () => {
    const svcExp = new ExporterService();
    const proj: MemoryProjection[] = [
      {
        workspaceId: 'wks_b',
        dimension: 'working',
        snapshotAtMs: nowMs(),
        itemCount: 1,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
    ];

    const capsule = svcExp.export(proj, 'wks_b');
    const result = svc.validateCapsule(capsule, 'wks_a');
    expect(result.passed).toBe(false);
    expect(result.crossWorkspaceReferences).toBeGreaterThan(0);
  });

  test('detects cross-workspace ledger leak', () => {
    const ledgerSvc = new CommemLedgerService();
    const events = [makeEvent('commerce.payment.approved', 'wks_a', nowMs())];

    const entries = [
      ledgerSvc.aggregate({
        events,
        workspaceId: 'wks_a',
        windowStartMs: nowMs() - 10000,
        windowEndMs: nowMs() + 1000,
      }),
    ];

    const result = svc.validateLedger(entries, 'wks_b');
    expect(result.passed).toBe(false);
  });
});
