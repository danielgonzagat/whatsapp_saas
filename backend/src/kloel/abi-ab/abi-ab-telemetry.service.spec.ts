/**
 * UTP-ABI-005 — A/B Telemetry contract spec for ABI substitution decisions.
 *
 * Implements PCI.2 §8 (docs/contracts/pci/02-abi-schema.md) and E.14.
 *
 * Validates the AbiAbTelemetryService:
 *  - record(): appends to buffer, respects cap of 10000.
 *  - reportDelta(): computes success rate and latency p50/p95 per path.
 *  - shouldRollback(): returns true when ABI degrades beyond thresholds.
 *  - shouldRollback(): returns false when samples insufficient.
 *  - shouldRollback(): returns false when ABI is within acceptable range.
 */

import { AbiAbTelemetryService } from './abi-ab-telemetry.service';
import type { AbExperimentSample, AbRollbackOptions } from './abi-ab.types';

function makeSample(overrides: Partial<AbExperimentSample> = {}): AbExperimentSample {
  return {
    sampleId: `smp_${Math.random().toString(36).slice(2, 10)}`,
    flowName: 'test-flow',
    abiUsed: false,
    latencyMs: 100,
    success: true,
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AbiAbTelemetryService (UTP-ABI-005)', () => {
  let service: AbiAbTelemetryService;

  beforeEach(() => {
    service = new AbiAbTelemetryService();
  });

  describe('record()', () => {
    it('appends a valid sample to the buffer', () => {
      const sample = makeSample();
      service.record(sample);
      expect(service.bufferSize()).toBe(1);
    });

    it('appends multiple samples incrementally', () => {
      for (let i = 0; i < 50; i++) {
        service.record(makeSample({ sampleId: `smp_${i}` }));
      }
      expect(service.bufferSize()).toBe(50);
    });

    it('enforces buffer cap of 10000 by discarding oldest samples', () => {
      for (let i = 0; i < 12000; i++) {
        service.record(makeSample({ sampleId: `smp_${i}`, flowName: `flow-${i % 100}` }));
      }
      expect(service.bufferSize()).toBe(10000);
    });
  });

  describe('reportDelta()', () => {
    it('returns zero counts and zero rates for empty buffer', () => {
      const report = service.reportDelta('no-such-flow');
      expect(report.flowName).toBe('no-such-flow');
      expect(report.legacy.count).toBe(0);
      expect(report.abi.count).toBe(0);
      expect(report.legacy.successRate).toBe(0);
      expect(report.abi.successRate).toBe(0);
      expect(report.legacy.latencyP50Ms).toBe(0);
      expect(report.abi.latencyP50Ms).toBe(0);
    });

    it('computes exact success rates for legacy and ABI paths', () => {
      service.record(makeSample({ sampleId: 'L1', flowName: 'f', abiUsed: false, success: true }));
      service.record(makeSample({ sampleId: 'L2', flowName: 'f', abiUsed: false, success: false }));
      service.record(makeSample({ sampleId: 'A1', flowName: 'f', abiUsed: true, success: true }));
      service.record(makeSample({ sampleId: 'A2', flowName: 'f', abiUsed: true, success: true }));
      service.record(makeSample({ sampleId: 'A3', flowName: 'f', abiUsed: true, success: false }));

      const report = service.reportDelta('f');
      expect(report.legacy.count).toBe(2);
      expect(report.legacy.successRate).toBe(0.50);
      expect(report.abi.count).toBe(3);
      expect(report.abi.successRate).toBeCloseTo(2 / 3, 4);
    });

    it('computes latency P50 and P95 for both paths', () => {
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({
          sampleId: `L${i}`,
          flowName: 'f',
          abiUsed: false,
          latencyMs: 100 + i * 10,
        }));
        service.record(makeSample({
          sampleId: `A${i}`,
          flowName: 'f',
          abiUsed: true,
          latencyMs: 200 + i * 20,
        }));
      }

      const report = service.reportDelta('f');
      expect(report.legacy.latencyP50Ms).toBeGreaterThanOrEqual(100);
      expect(report.legacy.latencyP95Ms).toBeGreaterThanOrEqual(report.legacy.latencyP50Ms);
      expect(report.abi.latencyP50Ms).toBeGreaterThanOrEqual(200);
    });

    it('filters by flowName and ignores other flows', () => {
      service.record(makeSample({ sampleId: 'L1', flowName: 'flowA', abiUsed: false }));
      service.record(makeSample({ sampleId: 'L2', flowName: 'flowB', abiUsed: false }));

      const reportA = service.reportDelta('flowA');
      const reportB = service.reportDelta('flowB');

      expect(reportA.legacy.count).toBe(1);
      expect(reportB.legacy.count).toBe(1);
    });
  });

  describe('shouldRollback()', () => {
    it('returns shouldRollback=false when samples are insufficient (less than default minimum)', () => {
      service.record(makeSample({ sampleId: 'L1', flowName: 'f', abiUsed: false, success: true }));
      service.record(makeSample({ sampleId: 'A1', flowName: 'f', abiUsed: true, success: true }));

      const decision = service.shouldRollback('f');
      expect(decision.shouldRollback).toBe(false);
      expect(decision.reason).toContain('insufficient');
    });

    it('returns shouldRollback=false when both paths have sufficient samples and ABI is not degraded', () => {
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `L${i}`, flowName: 'f', abiUsed: false, success: true, latencyMs: 100 }));
        service.record(makeSample({ sampleId: `A${i}`, flowName: 'f', abiUsed: true, success: true, latencyMs: 100 }));
      }

      const decision = service.shouldRollback('f');
      expect(decision.shouldRollback).toBe(false);
      expect(decision.delta.legacy.count).toBe(10);
      expect(decision.delta.abi.count).toBe(10);
    });

    it('returns shouldRollback=true when ABI success rate is more than 5pp below legacy', () => {
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `L${i}`, flowName: 'f', abiUsed: false, success: true, latencyMs: 100 }));
      }
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `A${i}`, flowName: 'f', abiUsed: true, success: i < 4, latencyMs: 100 }));
      }

      const decision = service.shouldRollback('f');
      expect(decision.shouldRollback).toBe(true);
      expect(decision.reason).toContain('success rate');
    });

    it('returns shouldRollback=true when ABI latency P95 is more than 2× legacy', () => {
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `L${i}`, flowName: 'f', abiUsed: false, success: true, latencyMs: 100 }));
      }
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `A${i}`, flowName: 'f', abiUsed: true, success: true, latencyMs: 500 + i * 10 }));
      }

      const decision = service.shouldRollback('f');
      expect(decision.shouldRollback).toBe(true);
      expect(decision.reason).toContain('latency');
    });

    it('respects custom rollback thresholds via opts', () => {
      const opts: AbRollbackOptions = {
        minSamplesPerPath: 5,
        maxSuccessRateGapPct: 12,
        maxLatencyP95Multiplier: 3,
      };

      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `L${i}`, flowName: 'f', abiUsed: false, success: true, latencyMs: 100 }));
      }
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `A${i}`, flowName: 'f', abiUsed: true, success: i < 9, latencyMs: 100 }));
      }

      const decision = service.shouldRollback('f', opts);
      expect(decision.shouldRollback).toBe(false);
    });

    it('returns shouldRollback=false when legacy latency P95 is zero (no legacy baseline)', () => {
      for (let i = 0; i < 10; i++) {
        service.record(makeSample({ sampleId: `L${i}`, flowName: 'f', abiUsed: false, success: true, latencyMs: 0 }));
        service.record(makeSample({ sampleId: `A${i}`, flowName: 'f', abiUsed: true, success: true, latencyMs: 500 }));
      }

      const decision = service.shouldRollback('f');
      expect(decision.shouldRollback).toBe(false);
    });

    it('accepts undefined workspaceId in samples', () => {
      service.record(makeSample({ sampleId: 'L1', flowName: 'f', abiUsed: false, workspaceId: undefined }));
      expect(service.bufferSize()).toBe(1);
    });

    it('accepts samples with explicit workspaceId', () => {
      service.record(makeSample({ sampleId: 'L1', flowName: 'f', abiUsed: false, workspaceId: 'wks_test' }));
      expect(service.bufferSize()).toBe(1);
    });

    it('drain() empties the buffer', () => {
      for (let i = 0; i < 100; i++) {
        service.record(makeSample({ sampleId: `smp_${i}` }));
      }
      expect(service.bufferSize()).toBe(100);
      service.drain();
      expect(service.bufferSize()).toBe(0);
    });
  });
});
