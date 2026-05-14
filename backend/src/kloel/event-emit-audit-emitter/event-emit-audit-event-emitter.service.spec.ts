import { EventEmitAuditEventEmitterService } from './event-emit-audit-event-emitter.service';
import { SpineCoverageAuditorService } from '../spine/spine-coverage-auditor.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import type { SpineEventInput } from '../spine/spine-event.types';

function buildEmitter(opts: { ringCapacity?: number } = {}) {
  return new SpineEmitterService(new ValenceTaggerService(), opts);
}

function input(overrides: Partial<SpineEventInput> = {}): SpineEventInput {
  return {
    eventName: 'commerce.lead.replied',
    workspaceId: 'wks_demo',
    truthMode: 'observed',
    provenance: {
      source: 'production',
      processor: 'spec',
      processorVersion: '1.0.0',
      schemaVersion: '1.0.0',
    },
    ...overrides,
  };
}

describe('EventEmitAuditEventEmitterService', () => {
  function build() {
    const emitter = buildEmitter();
    const auditor = new SpineCoverageAuditorService(emitter);
    const svc = new EventEmitAuditEventEmitterService(emitter, auditor);
    return { emitter, auditor, svc };
  }

  it('emits pulse.gate_failed when one or more surfaces have zero coverage', () => {
    const { emitter, svc } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    const report = svc.auditAndEmit();

    const events = emitter.recentEvents();
    const gateEvent = events.find(
      (e) =>
        e.eventName === 'pulse.gate_failed' &&
        e.payload &&
        typeof e.payload === 'object' &&
        'gateName' in e.payload &&
        e.payload['gateName'] === 'b17-surface-coverage',
    );
    expect(gateEvent).toBeDefined();
    expect(gateEvent!.valence).toBe('negative');
    expect(report.surfaces).toHaveLength(7);
  });

  it('emits pulse.gate_passed when all surfaces have nonzero coverage', () => {
    const { emitter, svc } = build();
    const onePerSurface: SpineEventInput[] = [
      input({ eventName: 'commerce.cart.created' }),
      input({ eventName: 'commerce.crm.stage_changed' }),
      input({ eventName: 'commerce.whatsapp.message_received' }),
      input({ eventName: 'commerce.campaign.clicked' }),
      input({ eventName: 'commerce.member_area.enrolled' }),
      input({ eventName: 'commerce.kyc.document_submitted' }),
      input({ eventName: 'commerce.post_sale.delivery_completed' }),
    ];
    for (const ev of onePerSurface) {
      emitter.emit(ev);
    }
    const report = svc.auditAndEmit();

    const events = emitter.recentEvents();
    const gateEvent = events.find(
      (e) =>
        e.eventName === 'pulse.gate_passed' &&
        e.payload &&
        typeof e.payload === 'object' &&
        'gateName' in e.payload &&
        e.payload['gateName'] === 'b17-surface-coverage',
    );
    expect(gateEvent).toBeDefined();
    expect(gateEvent!.valence).toBe('positive');
    expect(report.surfaces.every((s) => s.coverageRatio > 0)).toBe(true);
  });

  it('includes coverage report in the emitted event payload', () => {
    const { emitter, svc } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    emitter.emit(input({ eventName: 'commerce.payment.approved' }));
    svc.auditAndEmit();

    const events = emitter.recentEvents();
    const gateEvent = events.find(
      (e) =>
        e.payload &&
        typeof e.payload === 'object' &&
        'gateName' in e.payload &&
        e.payload['gateName'] === 'b17-surface-coverage',
    );
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!.payload as Record<string, unknown>;
    expect(payload['scannedEventCount']).toBeGreaterThan(0);
    expect(Array.isArray(payload['surfaces'])).toBe(true);
    expect(Array.isArray(payload['zeroCoverageSurfaces'])).toBe(true);
    expect(payload['gateName']).toBe('b17-surface-coverage');
    expect(payload['surfaceCount']).toBe(7);
  });

  it('never throws — returns report even when spine is empty', () => {
    const { svc } = build();
    const report = svc.auditAndEmit();
    expect(report.scannedEventCount).toBe(0);
    expect(report.surfaces).toHaveLength(7);
    for (const s of report.surfaces) {
      expect(s.coverageRatio).toBe(0);
    }
  });

  it('emission into full ring buffer does not throw', () => {
    const emitter = buildEmitter({ ringCapacity: 8 });
    const auditor = new SpineCoverageAuditorService(emitter);
    const svc = new EventEmitAuditEventEmitterService(emitter, auditor);
    for (let i = 0; i < 20; i += 1) {
      emitter.emit(input({ eventName: 'commerce.lead.replied', payload: { i } }));
    }
    expect(() => svc.auditAndEmit()).not.toThrow();
  });

  it('two consecutive auditAndEmit calls produce two distinct gate events', () => {
    const { emitter, svc } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    svc.auditAndEmit();
    emitter.emit(input({ eventName: 'commerce.crm.stage_changed' }));
    svc.auditAndEmit();

    const events = emitter.recentEvents();
    const gateEvents = events.filter(
      (e) =>
        e.eventName === 'pulse.gate_passed' || e.eventName === 'pulse.gate_failed',
    );
    expect(gateEvents.length).toBeGreaterThanOrEqual(2);
    const eventIds = new Set(gateEvents.map((e) => e.eventId));
    expect(eventIds.size).toBe(gateEvents.length);
  });
});
