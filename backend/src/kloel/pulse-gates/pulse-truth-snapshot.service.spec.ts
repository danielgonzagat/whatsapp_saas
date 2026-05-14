import { PulseTruthSnapshotService } from './pulse-truth-snapshot.service';
import type { GateName, GateMode, GateStatus, GateVerdict } from './pulse-gates.types';
import type { GateDescriptor } from './pulse-truth-snapshot.service';

function clamp(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function verdict(
  gateName: GateName,
  status: GateStatus,
  mode: GateMode,
): GateVerdict {
  return {
    gateName,
    status,
    mode,
    measuredAt: new Date().toISOString(),
    measuredBy: 'test',
  };
}

function descriptor(gateName: GateName, status: GateStatus, mode: GateMode): GateDescriptor {
  return { name: gateName, lastVerdict: verdict(gateName, status, mode) };
}

function service(descriptors: readonly GateDescriptor[]): PulseTruthSnapshotService {
  return new PulseTruthSnapshotService(descriptors);
}

describe('PulseTruthSnapshotService', () => {
  // ── Empty / no-data ──────────────────────────────────────────

  describe('snapshot() with empty or insufficient evidence', () => {
    it('[01] returns INSUFFICIENT_EVIDENCE when descriptors array is empty', () => {
      const result = service([]).snapshot();
      expect(result.certificationVerdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.overclaimRisk).toBe(1);
      expect(result.noOverclaimStatus).toBe('FAIL');
      expect(result.gates).toHaveLength(0);
    });

    it('[02] returns INSUFFICIENT_EVIDENCE when only log_only gates present (no hard_fail data)', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'log_only'),
        descriptor('no-overclaim', 'PASS', 'log_only'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.overclaimRisk).toBe(1);
      expect(result.capabilityHealthScore).toBe(1);
    });

    it('[03] returns INSUFFICIENT_EVIDENCE when only log_only FAIL gates present', () => {
      const result = service([
        descriptor('identity-projection', 'FAIL', 'log_only'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.overclaimRisk).toBe(1);
    });

    it('[04] default constructor (no injection) behaves like empty descriptors', () => {
      const svc = new PulseTruthSnapshotService();
      const result = svc.snapshot();
      expect(result.certificationVerdict).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.gates).toHaveLength(0);
      expect(result.capabilityHealthScore).toBe(0);
    });
  });

  // ── CERTIFIED scenarios ──────────────────────────────────────

  describe('snapshot() CERTIFIED verdict', () => {
    it('[05] single hard_fail PASS gate → CERTIFIED', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('CERTIFIED');
      expect(result.capabilityHealthScore).toBe(1);
      expect(result.overclaimRisk).toBe(0);
    });

    it('[06] 1 hard_fail PASS + 1 log_only FAIL → CERTIFIED with mixed score', () => {
      const result = service([
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
        descriptor('no-overclaim', 'FAIL', 'log_only'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('CERTIFIED');
      expect(result.capabilityHealthScore).toBe(0.5);
      expect(result.overclaimRisk).toBe(0);
    });

    it('[07] multiple hard_fail all PASS → CERTIFIED', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
        descriptor('identity-projection', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('CERTIFIED');
      expect(result.capabilityHealthScore).toBe(1);
      expect(result.overclaimRisk).toBe(0);
    });

    it('[08] 3 hard_fail PASS + 2 log_only mixed → CERTIFIED', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
        descriptor('identity-projection', 'PASS', 'hard_fail'),
        descriptor('no-overclaim', 'FAIL', 'log_only'),
        descriptor('truth-mode-honesty', 'PASS', 'log_only'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('CERTIFIED');
      expect(result.capabilityHealthScore).toBe(4 / 5);
      expect(result.overclaimRisk).toBe(0);
    });
  });

  // ── AT_RISK scenarios ────────────────────────────────────────

  describe('snapshot() AT_RISK verdict', () => {
    it('[09] single hard_fail FAIL gate → AT_RISK', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('AT_RISK');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.overclaimRisk).toBe(1);
    });

    it('[10] 1 hard_fail PASS + 1 hard_fail FAIL → AT_RISK with overclaim 0.5', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('AT_RISK');
      expect(result.capabilityHealthScore).toBe(0.5);
      expect(result.overclaimRisk).toBe(0.5);
    });

    it('[11] 2 hard_fail FAIL + 1 hard_fail PASS → AT_RISK with overclaim 2/3', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
        descriptor('identity-projection', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('AT_RISK');
      expect(result.capabilityHealthScore).toBe(clamp(1 / 3));
      expect(result.overclaimRisk).toBe(clamp(2 / 3));
    });

    it('[12] all hard_fail FAIL → AT_RISK with max overclaim', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
        descriptor('identity-projection', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('AT_RISK');
      expect(result.capabilityHealthScore).toBe(0);
      expect(result.overclaimRisk).toBe(1);
    });

    it('[13] mixed hard_fail FAIL with log_only PASS → AT_RISK', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
        descriptor('no-overclaim', 'PASS', 'log_only'),
        descriptor('truth-mode-honesty', 'PASS', 'log_only'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('AT_RISK');
      expect(result.capabilityHealthScore).toBe(clamp(2 / 3));
      expect(result.overclaimRisk).toBe(1);
    });
  });

  // ── noOverclaimStatus ────────────────────────────────────────

  describe('snapshot() noOverclaimStatus', () => {
    it('[14] no-overclaim gate PASS → noOverclaimStatus PASS', () => {
      const result = service([
        descriptor('no-overclaim', 'PASS', 'hard_fail'),
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.noOverclaimStatus).toBe('PASS');
      expect(result.certificationVerdict).toBe('CERTIFIED');
    });

    it('[15] no-overclaim gate FAIL → noOverclaimStatus FAIL', () => {
      const result = service([
        descriptor('no-overclaim', 'FAIL', 'hard_fail'),
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.noOverclaimStatus).toBe('FAIL');
      expect(result.certificationVerdict).toBe('AT_RISK');
    });

    it('[16] no no-overclaim gate present → noOverclaimStatus defaults to FAIL', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.noOverclaimStatus).toBe('FAIL');
    });
  });

  // ── capabilityHealthScore edge cases ─────────────────────────

  describe('snapshot() capabilityHealthScore', () => {
    it('[17] all PASS yields score 1', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
        descriptor('no-overclaim', 'PASS', 'log_only'),
      ]).snapshot();
      expect(result.capabilityHealthScore).toBe(1);
    });

    it('[18] all FAIL yields score 0', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
        descriptor('no-overclaim', 'FAIL', 'log_only'),
      ]).snapshot();
      expect(result.capabilityHealthScore).toBe(0);
    });

    it('[19] score clamps to 4 decimal places (1/3 case)', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
        descriptor('identity-projection', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.capabilityHealthScore).toBe(Math.round((1 / 3) * 10000) / 10000);
    });
  });

  // ── gates snapshot entries ───────────────────────────────────

  describe('snapshot() gates output', () => {
    it('[20] gates array maps each descriptor to a GateSnapshotEntry', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.gates).toHaveLength(2);
      expect(result.gates[0]).toEqual({
        name: 'no-roleplay',
        mode: 'hard_fail',
        lastResult: 'PASS',
      });
      expect(result.gates[1]).toEqual({
        name: 'lineage-integrity',
        mode: 'hard_fail',
        lastResult: 'FAIL',
      });
    });

    it('[21] gates preserve ordering from descriptors', () => {
      const descriptors: GateDescriptor[] = [
        descriptor('identity-projection', 'PASS', 'hard_fail'),
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
      ];
      const result = service(descriptors).snapshot();
      expect(result.gates.map((g) => g.name)).toEqual([
        'identity-projection',
        'no-roleplay',
        'lineage-integrity',
      ]);
    });
  });

  // ── overclaimRisk behavior ───────────────────────────────────

  describe('snapshot() overclaimRisk', () => {
    it('[22] overclaimRisk is 1 when no hard_fail data (only log_only)', () => {
      const result = service([
        descriptor('no-overclaim', 'PASS', 'log_only'),
        descriptor('truth-mode-honesty', 'FAIL', 'log_only'),
      ]).snapshot();
      expect(result.overclaimRisk).toBe(1);
    });

    it('[23] overclaimRisk clamps to 4 decimal places', () => {
      const result = service([
        descriptor('no-roleplay', 'FAIL', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
        descriptor('identity-projection', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.overclaimRisk).toBe(Math.round((2 / 3) * 10000) / 10000);
    });

    it('[24] overclaimRisk is inverse to capabilityHealthScore when only hard_fail gates', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'FAIL', 'hard_fail'),
        descriptor('identity-projection', 'FAIL', 'hard_fail'),
      ]).snapshot();
      expect(result.overclaimRisk).toBeCloseTo(2 / 3, 4);
      expect(result.capabilityHealthScore).toBeCloseTo(1 / 3, 4);
    });

    it('[25] overclaimRisk is 1 when hard_fail has ONLY log_only FAIL gates alongside hard_fail', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('no-overclaim', 'FAIL', 'log_only'),
      ]).snapshot();
      // hard_fail gates: 1 (no-roleplay PASS), hardFailFailed=0, hardFailTotal=1 → overclaimRisk = 0/1 = 0
      expect(result.overclaimRisk).toBe(0);
    });
  });

  // ── Full snapshot shape ──────────────────────────────────────

  describe('snapshot() full shape invariants', () => {
    it('[26] returns all PulseTruthSnapshot fields for a complex descriptor set', () => {
      const result = service([
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
        descriptor('identity-projection', 'FAIL', 'hard_fail'),
        descriptor('no-overclaim', 'FAIL', 'log_only'),
      ]).snapshot();

      expect(result).toHaveProperty('noOverclaimStatus');
      expect(result).toHaveProperty('capabilityHealthScore');
      expect(result).toHaveProperty('gates');
      expect(result).toHaveProperty('certificationVerdict');
      expect(result).toHaveProperty('overclaimRisk');

      expect(result.gates).toHaveLength(4);
      // 3 hard_fail: 2 PASS, 1 FAIL → AT_RISK
      expect(result.certificationVerdict).toBe('AT_RISK');
      // 4 total: no-roleplay PASS, lineage-integrity PASS, identity-projection FAIL, no-overclaim FAIL → 2/4
      expect(result.capabilityHealthScore).toBe(0.5);
      // hardFailTotal=3, hardFailFailed=1 → 1/3
      expect(result.overclaimRisk).toBe(clamp(1 / 3));
      // no-overclaim gate is FAIL
      expect(result.noOverclaimStatus).toBe('FAIL');
    });

    it('[27] CERTIFIED snapshot with correct noOverclaimStatus', () => {
      const result = service([
        descriptor('no-overclaim', 'PASS', 'hard_fail'),
        descriptor('no-roleplay', 'PASS', 'hard_fail'),
        descriptor('lineage-integrity', 'PASS', 'hard_fail'),
      ]).snapshot();
      expect(result.certificationVerdict).toBe('CERTIFIED');
      expect(result.noOverclaimStatus).toBe('PASS');
      expect(result.capabilityHealthScore).toBe(1);
      expect(result.overclaimRisk).toBe(0);
    });
  });
});
