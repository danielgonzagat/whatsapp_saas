import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineCoverageAuditorService } from './spine-coverage-auditor.service';
import { SpineEmitterService } from './spine-emitter.service';
import type { SpineEventInput } from './spine-event.types';

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

describe('SpineCoverageAuditorService', () => {
  function build() {
    const emitter = buildEmitter();
    const auditor = new SpineCoverageAuditorService(emitter);
    return { emitter, auditor };
  }

  it('produces a report with all seven B17 surfaces when spine is empty', () => {
    const { auditor } = build();
    const report = auditor.audit();
    expect(report.scannedEventCount).toBe(0);
    expect(report.surfaces).toHaveLength(7);
    for (const s of report.surfaces) {
      expect(s.observedCanonicalEventNames).toEqual([]);
      expect(s.coverageRatio).toBe(0);
    }
  });

  it('increments coverage for the correct surface when a canonical event is emitted', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    const report = auditor.audit();
    const checkout = report.surfaces.find((s) => s.surfaceId === 'checkout_wallet_billing');
    expect(checkout).toBeDefined();
    expect(checkout!.coverageRatio).toBeGreaterThan(0);
    expect(checkout!.observedCanonicalEventNames).toContain('commerce.cart.created');
  });

  it('leaves other surface ratios at zero when only one surface has events', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    const report = auditor.audit();
    const crm = report.surfaces.find((s) => s.surfaceId === 'crm');
    expect(crm!.coverageRatio).toBe(0);
  });

  it('reaches coverageRatio 1.0 when every canonical transition for a surface is observed', () => {
    const { emitter, auditor } = build();
    const allKycEvents = [
      'commerce.kyc.document_submitted',
      'commerce.kyc.approved',
      'commerce.kyc.rejected',
    ];
    for (const name of allKycEvents) {
      emitter.emit(input({ eventName: name }));
    }
    const report = auditor.audit();
    const kyc = report.surfaces.find((s) => s.surfaceId === 'kyc_auth');
    expect(kyc!.coverageRatio).toBe(1);
    expect(kyc!.observedCanonicalEventNames).toHaveLength(3);
  });

  it('computes partial coverage ratio correctly', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.crm.stage_changed' }));
    const report = auditor.audit();
    const crm = report.surfaces.find((s) => s.surfaceId === 'crm');
    const expectedRatio = 1 / 6;
    expect(crm!.coverageRatio).toBeCloseTo(expectedRatio, 4);
  });

  it('does not count non-PCI.6 events toward any surface coverage', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'cognition.belief_updated' }));
    emitter.emit(input({ eventName: 'pulse.gate_passed' }));
    const report = auditor.audit();
    for (const s of report.surfaces) {
      expect(s.coverageRatio).toBe(0);
    }
  });

  it('reports observedTransitions in the surface coverage', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.payment.approved' }));
    const report = auditor.audit();
    const checkout = report.surfaces.find((s) => s.surfaceId === 'checkout_wallet_billing');
    expect(checkout!.transitionsObserved).toContain('payment_approved');
  });

  it('respects windowN parameter', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    emitter.emit(input({ eventName: 'commerce.campaign.clicked' }));
    const report = auditor.audit(0);
    expect(report.scannedEventCount).toBe(0);
    for (const s of report.surfaces) {
      expect(s.coverageRatio).toBe(0);
    }
  });

  it('handles duplicate events correctly', () => {
    const { emitter, auditor } = build();
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    emitter.emit(input({ eventName: 'commerce.cart.created' }));
    const report = auditor.audit();
    const checkout = report.surfaces.find((s) => s.surfaceId === 'checkout_wallet_billing');
    expect(checkout!.observedCanonicalEventNames).toEqual(['commerce.cart.created']);
    expect(checkout!.observedTransitionCount).toBe(1);
  });

  it('surfaces report correct totalCanonicalTransitions from PCI.6', () => {
    const { auditor } = build();
    const report = auditor.audit();
    expect(report.surfaces).toHaveLength(7);
    const kyc = report.surfaces.find((s) => s.surfaceId === 'kyc_auth');
    expect(kyc!.totalCanonicalTransitions).toBe(3);
  });
});
