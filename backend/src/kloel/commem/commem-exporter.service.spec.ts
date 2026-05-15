import { CommemLedgerService } from './ledger.service';
import { MemoryProjector } from './memory.projector';
import { ExporterService } from './exporter.service';
import { AttributionGuard } from './attribution.guard';
import { CommemExporterService } from './commem-exporter.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { MemoryProjection } from './commem.types';

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

describe('CommemExporterService', () => {
  let ledgerService: CommemLedgerService;
  let projector: MemoryProjector;
  let exporter: ExporterService;
  let guard: AttributionGuard;
  let svc: CommemExporterService;

  beforeEach(() => {
    ledgerService = new CommemLedgerService();
    projector = new MemoryProjector();
    exporter = new ExporterService();
    guard = new AttributionGuard();
    svc = new CommemExporterService(ledgerService, projector, exporter, guard);
    seq = 0;
  });

  test('exports aggregated data for a workspace with events', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs() - 1000),
      makeEvent('commerce.lead.qualified', 'ws_alpha', nowMs() - 500),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);

    expect(result.workspaceId).toBe('ws_alpha');
    expect(result.formatVersion).toBe(1);
    expect(result.ledger.length).toBeGreaterThan(0);
    expect(result.projections.length).toBe(5);
    expect(result.attestation.workspaceIsolationVerified).toBe(true);
    expect(result.attestation.isAuditable).toBe(true);
  });

  test('returns empty export for empty events', () => {
    const result = svc.exportAggregated('ws_alpha', []);

    expect(result.workspaceId).toBe('ws_alpha');
    expect(result.ledger.length).toBeGreaterThanOrEqual(0);
    expect(result.projections.length).toBe(5);
    expect(result.capsule).toBeNull();
    expect(result.attestation.checksum.length).toBeGreaterThanOrEqual(10);
  });

  test('filters out events from other workspaces', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_beta', nowMs()),
      makeEvent('commerce.lead.qualified', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);

    const totalEvents = result.ledger.reduce((s, e) => s + e.eventCount, 0);
    expect(totalEvents).toBe(1);

    for (const entry of result.ledger) {
      for (const ev of entry.events) {
        expect(ev.workspaceId).toBe('ws_alpha');
      }
    }
  });

  test('toJson produces valid parseable JSON', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);
    const json = svc.toJson(result);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  test('toJson includes workspaceId in output', () => {
    const events = [
      makeEvent('commerce.lead.qualified', 'ws_delta', nowMs()),
    ];

    const result = svc.exportAggregated('ws_delta', events);
    const json = svc.toJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.workspaceId).toBe('ws_delta');
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.attestation).toBeDefined();
    expect(parsed.ledger).toBeDefined();
    expect(parsed.projections).toBeDefined();
    expect(parsed.capsule).toBeDefined();
  });

  test('toCsv produces CSV with header row', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);
    const csv = svc.toCsv(result);

    const lines = csv.split('\n');
    expect(lines[0]).toContain('eventId');
    expect(lines[0]).toContain('eventName');
    expect(lines[0]).toContain('occurredAt');
    expect(lines[0]).toContain('truthMode');
    expect(lines[0]).toContain('entityType');
    expect(lines[0]).toContain('entityId');
    expect(lines[0]).toContain('workspaceId');
  });

  test('toCsv includes all event rows', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs() - 2000),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs() - 1000),
      makeEvent('commerce.lead.converted', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);
    const csv = svc.toCsv(result);

    const lines = csv.split('\n');
    expect(lines.length).toBe(4);
    expect(lines[1]).toContain('commerce.payment.approved');
    expect(lines[2]).toContain('commerce.crm.deal_won');
    expect(lines[3]).toContain('commerce.lead.converted');
  });

  test('attestation verifies workspace isolation when clean', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_gamma', nowMs()),
      makeEvent('commerce.lead.qualified', 'ws_gamma', nowMs()),
    ];

    const result = svc.exportAggregated('ws_gamma', events);

    expect(result.attestation.workspaceIsolationVerified).toBe(true);
    expect(result.attestation.crossWorkspaceReferences).toBe(0);
  });

  test('attestation detects cross-workspace contamination', () => {
    const mixedEvents = [
      makeEvent('commerce.payment.approved', 'ws_one', nowMs() - 2000),
      makeEvent('commerce.lead.qualified', 'ws_two', nowMs() - 1000),
      makeEvent('commerce.crm.deal_won', 'ws_one', nowMs()),
    ];

    const result = svc.exportAggregated('ws_one', mixedEvents);

    const totalEvents = result.ledger.reduce((s, e) => s + e.eventCount, 0);
    expect(totalEvents).toBe(2);
    expect(result.attestation.workspaceIsolationVerified).toBe(true);
  });

  test('batchExportAggregated handles multiple workspaces', () => {
    const eventsByWs: Record<string, SpineEventRef[]> = {
      ws_x: [makeEvent('commerce.payment.approved', 'ws_x', nowMs())],
      ws_y: [makeEvent('commerce.lead.qualified', 'ws_y', nowMs())],
    };

    const results = svc.batchExportAggregated(eventsByWs);

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.workspaceId).sort();
    expect(ids).toEqual(['ws_x', 'ws_y']);

    for (const r of results) {
      expect(r.attestation.workspaceIsolationVerified).toBe(true);
    }
  });

  test('verifyIntegrity returns true for untouched export', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);
    expect(svc.verifyIntegrity(result)).toBe(true);
  });

  test('verifyIntegrity detects tampering', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);
    const tampered = {
      ...result,
      attestation: { ...result.attestation, checksum: '0x00000000' },
    };
    expect(svc.verifyIntegrity(tampered)).toBe(false);
  });

  test('export with no ledger entries still produces valid output', () => {
    const result = svc.exportAggregated('ws_zeta', []);

    expect(result.workspaceId).toBe('ws_zeta');
    expect(result.ledger.length).toBeGreaterThanOrEqual(0);
    expect(result.projections.length).toBe(5);
    expect(result.attestation.isAuditable).toBeDefined();
  });

  test('toCsv on multi-event export has correct row count', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent(
        'commerce.payment.approved',
        'ws_alpha',
        nowMs() - (10 - i) * 1000,
      ),
    );

    const result = svc.exportAggregated('ws_alpha', events);
    const csv = svc.toCsv(result);

    const lines = csv.split('\n');
    const totalEvents = result.ledger.reduce((s, e) => s + e.eventCount, 0);
    expect(lines.length).toBe(totalEvents + 1);
  });

  test('toJson does not expose cross-workspace data in ledger events', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_solo', nowMs()),
      makeEvent('commerce.lead.qualified', 'ws_other', nowMs()),
    ];

    const result = svc.exportAggregated('ws_solo', events);
    const json = svc.toJson(result);
    const parsed = JSON.parse(json);

    expect(parsed.workspaceId).toBe('ws_solo');

    let totalInJson = 0;
    for (const entry of parsed.ledger) {
      totalInJson += entry.eventCount;
      for (const ev of entry.events) {
        expect(ev.eventName).toBeDefined();
      }
    }
    expect(totalInJson).toBe(1);
  });

  test('capsule is not null when projections exist with items', () => {
    const events = [
      makeEvent('commerce.payment.approved', 'ws_alpha', nowMs() - 1000),
      makeEvent('commerce.crm.deal_won', 'ws_alpha', nowMs()),
    ];

    const result = svc.exportAggregated('ws_alpha', events);

    const totalItems = result.projections.reduce((s, p) => s + p.itemCount, 0);
    expect(totalItems).toBeGreaterThan(0);
    expect(result.capsule).not.toBeNull();
    expect(result.capsule!.workspaceId).toBe('ws_alpha');
    expect(result.capsule!.isAuditable).toBe(true);
  });
});
