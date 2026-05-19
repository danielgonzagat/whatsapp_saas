import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { TimeMachineService } from './time-machine.service';
import { ValueQuantifier } from './value-quantifier';
import { NarrativeBuilder } from './narrative.builder';
import { AttributionGuard } from './attribution.guard';
import type { SpineEventRef } from '../mind/mind.types';
import type { MemoryDimension, MemoryProjection, ProjectionInput } from './commem.types';

let seq = 0;
function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAtMs: number,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  seq++;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt: new Date(occurredAtMs).toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

function nowMs(): number {
  return Date.now();
}

describe('COMMEM-001 — CommemLedgerService', () => {
  let svc: CommemLedgerService;

  beforeEach(() => {
    svc = new CommemLedgerService();
  });

  test('aggregates events into ledger entries per workspace', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 1000),
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 500),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs()),
    ];

    const result = svc.aggregate({
      events,
      workspaceId: 'wks_a',
      windowStartMs: nowMs() - 10000,
      windowEndMs: nowMs() + 1000,
    });

    expect(result.workspaceId).toBe('wks_a');
    expect(result.eventCount).toBe(3);
    expect(result.events).toHaveLength(3);
    expect(result.domainBreakdown['commerce.payment']).toBe(2);
    expect(result.domainBreakdown['commerce.lead']).toBe(1);
    expect(result.truthModeBreakdown['observed']).toBe(3);
  });

  test('filters out events from other workspaces', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_b', nowMs()),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs()),
    ];

    const result = svc.aggregate({
      events,
      workspaceId: 'wks_a',
      windowStartMs: nowMs() - 10000,
      windowEndMs: nowMs() + 1000,
    });

    expect(result.eventCount).toBe(1);
    for (const e of result.events) {
      expect(e.workspaceId).toBe('wks_a');
    }
  });

  test('returns empty ledger for no events in window', () => {
    const result = svc.aggregate({
      events: [],
      workspaceId: 'wks_a',
      windowStartMs: 0,
      windowEndMs: 1000,
    });

    expect(result.eventCount).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.domainBreakdown).toEqual({});
    expect(result.truthModeBreakdown).toEqual({});
  });

  test('aggregateMultiWindow produces sequential windows', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 2000),
    ];

    const results = svc.aggregateMultiWindow(events, 'wks_a', 1000, 3000);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].sequence).toBe(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].sequence).toBe(i);
    }
  });
});

describe('COMMEM-002 — MemoryProjector', () => {
  let svc: MemoryProjector;

  beforeEach(() => {
    svc = new MemoryProjector();
  });

  test('projects events into specified dimensions', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 1000),
    ];

    const results = svc.project({
      events,
      workspaceId: 'wks_a',
      dimensions: ['working', 'episodic'],
    });

    expect(results).toHaveLength(2);
    expect(results[0].workspaceId).toBe('wks_a');
    expect(results[1].workspaceId).toBe('wks_a');
  });

  test('projectAll covers all five dimensions', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs()),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs()),
    ];

    const results = svc.projectAll({
      events,
      workspaceId: 'wks_a',
      dimensions: [],
    });

    const dims = results.map((p) => p.dimension).sort();
    expect(dims).toEqual([
      'consolidated',
      'episodic',
      'procedural',
      'semantic',
      'working',
    ]);
  });

  test('projects confidence between 0 and 1', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', nowMs() - 1000),
      makeEvent('commerce.lead.qualified', 'wks_a', nowMs() - 2000),
    ];

    const results = svc.project({
      events,
      workspaceId: 'wks_a',
      dimensions: ['working'],
    });

    for (const p of results) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('promoteToWorking moves high-weight episodic items to working', () => {
    const oldEvent: SpineEventRef = {
      eventId: 'evt_00001',
      eventName: 'commerce.payment.approved',
      workspaceId: 'wks_a',
      occurredAt: new Date(nowMs() - 3600_000 * 5).toISOString(),
      truthMode: 'observed',
    };

    const projections = svc.project({
      events: [oldEvent],
      workspaceId: 'wks_a',
      dimensions: ['episodic'],
    });

    const promoted = svc.promoteToWorking(projections, 'wks_a', 0.01);
    expect(promoted[0].dimension).toBe('working');
    expect(promoted[0].summary).toContain('promoted');
  });
});

describe('COMMEM-003 — ExporterService', () => {
  let svc: ExporterService;

  beforeEach(() => {
    svc = new ExporterService();
  });

  test('exports capsule with unique id and checksum', () => {
    const projections: MemoryProjection[] = [
      {
        workspaceId: 'wks_a',
        dimension: 'working',
        snapshotAtMs: nowMs(),
        itemCount: 3,
        items: [],
        summary: 'test',
        confidence: 0.8,
      },
    ];

    const capsule = svc.export(projections, 'wks_a');

    expect(capsule.capsuleId).toContain('caps_');
    expect(capsule.workspaceId).toBe('wks_a');
    expect(capsule.checksum.length).toBeGreaterThanOrEqual(10);
    expect(capsule.isAuditable).toBe(true);
    expect(capsule.version).toBeGreaterThan(0);
  });

  test('verifyCapsule validates checksum integrity', () => {
    const projections: MemoryProjection[] = [
      {
        workspaceId: 'wks_a',
        dimension: 'episodic',
        snapshotAtMs: nowMs(),
        itemCount: 5,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
    ];

    const capsule = svc.export(projections, 'wks_a');
    expect(svc.verifyCapsule(capsule)).toBe(true);
  });

  test('verifyCapsule detects tampering', () => {
    const projections: MemoryProjection[] = [
      {
        workspaceId: 'wks_a',
        dimension: 'episodic',
        snapshotAtMs: nowMs(),
        itemCount: 5,
        items: [],
        summary: 'test',
        confidence: 0.5,
      },
    ];

    const capsule = svc.export(projections, 'wks_a');
    const tampered = { ...capsule, checksum: '0xdeadbeef' };
    expect(svc.verifyCapsule(tampered)).toBe(false);
  });
});

describe('COMMEM-004 — TimeMachineService', () => {
  let svc: TimeMachineService;

  beforeEach(() => {
    svc = new TimeMachineService();
  });

  test('reconstructs memory state at past timestamp', () => {
    const pastMs = nowMs() - 3600_000;
    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', pastMs - 1000),
      makeEvent('commerce.lead.qualified', 'wks_a', pastMs - 500),
      makeEvent('commerce.crm.deal_won', 'wks_a', nowMs()),
    ];

    const result = svc.query(events, {
      workspaceId: 'wks_a',
      targetTimestampMs: pastMs,
      dimensions: ['working', 'episodic'],
    });

    expect(result.reconstructedFrom).toBe(2);
    expect(result.targetTimestampMs).toBe(pastMs);
    expect(result.projections).toHaveLength(2);
  });

  test('diff computes delta between two time points', () => {
    const now = nowMs();
    const beforeMs = now - 3600_000;

    const events = [
      makeEvent('commerce.payment.approved', 'wks_a', beforeMs - 1000),
      makeEvent('commerce.lead.qualified', 'wks_a', beforeMs - 500),
      makeEvent('commerce.crm.deal_won', 'wks_a', now - 1000),
      makeEvent('commerce.crm.deal_won', 'wks_a', now - 500),
    ];

    const before = svc.query(events, {
      workspaceId: 'wks_a',
      targetTimestampMs: beforeMs,
      dimensions: ['working', 'episodic', 'consolidated', 'procedural', 'semantic'],
    });

    const after = svc.query(events, {
      workspaceId: 'wks_a',
      targetTimestampMs: now,
      dimensions: ['working', 'episodic', 'consolidated', 'procedural', 'semantic'],
    });

    const diffs = svc.diff(before, after);
    expect(diffs).toHaveLength(5);

    const totalDelta = diffs.reduce((s, d) => s + d.delta, 0);
    expect(totalDelta).toBeGreaterThan(0);
  });
});
