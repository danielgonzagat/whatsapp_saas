import { Test, TestingModule } from '@nestjs/testing';
import { PulseTruthSnapshotService } from './pulse-truth-snapshot.service';
import type { AbiPulseTruth } from './abi-schema';

const makeCustomState = (): AbiPulseTruth => ({
  noOverclaimStatus: 'WARN',
  capabilityHealthScore: 85,
  gates: [
    {
      gateName: 'ci-green',
      status: 'PASS',
      mode: 'hard_fail',
      lastChecked: new Date('2026-05-14').toISOString(),
    },
    {
      gateName: 'coverage-min',
      status: 'FAIL',
      mode: 'log_only',
      lastChecked: new Date('2026-05-13').toISOString(),
    },
  ],
  certificationVerdict: {
    verdict: 'SIM',
    score: 95,
    measuredAt: new Date('2026-05-14').toISOString(),
  },
  overclaimRisk: 0.3,
});

describe('PulseTruthSnapshotService', () => {
  describe('default state (no injection)', () => {
    it('uses DEFAULT_STATE when instantiated without arguments', () => {
      const service = new PulseTruthSnapshotService();
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe('PASS');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.gates).toEqual([]);
      expect(result.overclaimRisk).toBe(0);
    });

    it('default certification verdict is INSUFFICIENT_EVIDENCE', () => {
      const service = new PulseTruthSnapshotService();
      const result = service.snapshot();

      expect(result.certificationVerdict).toEqual({
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt: new Date(0).toISOString(),
      });
    });

    it('uses DEFAULT_STATE when undefined is explicitly passed', () => {
      const service = new PulseTruthSnapshotService(undefined);
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe('PASS');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.gates).toEqual([]);
    });

    it('NestJS DI creates service with default state when token is absent', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [PulseTruthSnapshotService],
      }).compile();

      const service = module.get(PulseTruthSnapshotService);
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe('PASS');
      expect(result.capabilityHealthScore).toBe(0);
    });
  });

  describe('injected state', () => {
    it('uses custom state injected via constructor argument', () => {
      const custom = makeCustomState();
      const service = new PulseTruthSnapshotService(custom);
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe('WARN');
      expect(result.capabilityHealthScore).toBe(85);
      expect(result.gates).toHaveLength(2);
      expect(result.gates[0].gateName).toBe('ci-green');
      expect(result.certificationVerdict.verdict).toBe('SIM');
      expect(result.overclaimRisk).toBe(0.3);
    });

    it('NestJS DI injects custom state via ABI_PULSE_TRUTH_STATE token', async () => {
      const custom = makeCustomState();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PulseTruthSnapshotService,
          { provide: 'ABI_PULSE_TRUTH_STATE', useValue: custom },
        ],
      }).compile();

      const service = module.get(PulseTruthSnapshotService);
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe('WARN');
      expect(result.capabilityHealthScore).toBe(85);
      expect(result.overclaimRisk).toBe(0.3);
    });
  });

  describe('snapshot copy semantics', () => {
    it('returns a distinct object reference from internal state', () => {
      const service = new PulseTruthSnapshotService();
      const snap = service.snapshot();
      const snap2 = service.snapshot();

      expect(snap).not.toBe(snap2);
    });

    it('each snapshot() call produces a new top-level object', () => {
      const service = new PulseTruthSnapshotService();
      const results = [service.snapshot(), service.snapshot(), service.snapshot()];

      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          expect(results[i]).not.toBe(results[j]);
        }
      }
    });

    it('shares nested object references across snapshots (shallow copy)', () => {
      const custom = makeCustomState();
      const service = new PulseTruthSnapshotService(custom);
      const snap1 = service.snapshot();
      const snap2 = service.snapshot();

      expect(snap1.certificationVerdict).toBe(snap2.certificationVerdict);
      expect(snap1.gates).toBe(snap2.gates);
      expect(snap1.gates[0]).toBe(snap2.gates[0]);
    });
  });

  describe('idempotency', () => {
    it('multiple calls return the same shallow content with default state', () => {
      const service = new PulseTruthSnapshotService();
      const first = service.snapshot();
      const second = service.snapshot();
      const third = service.snapshot();

      expect(first).toEqual(second);
      expect(second).toEqual(third);
    });

    it('multiple calls return the same shallow content with custom state', () => {
      const custom = makeCustomState();
      const service = new PulseTruthSnapshotService(custom);
      const first = service.snapshot();
      const second = service.snapshot();

      expect(first).toEqual(second);
      expect(first.noOverclaimStatus).toBe('WARN');
      expect(second.overclaimRisk).toBe(0.3);
    });
  });

  describe('immutability guard', () => {
    it('snapshot content matches the originally provided state', () => {
      const custom = makeCustomState();
      const service = new PulseTruthSnapshotService(custom);
      const result = service.snapshot();

      expect(result.noOverclaimStatus).toBe(custom.noOverclaimStatus);
      expect(result.capabilityHealthScore).toBe(custom.capabilityHealthScore);
      expect(result.gates).toEqual(custom.gates);
      expect(result.certificationVerdict).toEqual(custom.certificationVerdict);
      expect(result.overclaimRisk).toBe(custom.overclaimRisk);
    });
  });
});
