import { Inject, Injectable, Optional } from '@nestjs/common';
import type { GateName, GateMode, GateStatus, GateVerdict } from './pulse-gates.types';

export type CertificationVerdict = 'CERTIFIED' | 'AT_RISK' | 'INSUFFICIENT_EVIDENCE';

export interface GateSnapshotEntry {
  readonly name: GateName;
  readonly mode: GateMode;
  readonly lastResult: GateStatus;
}

export interface PulseTruthSnapshot {
  readonly noOverclaimStatus: 'PASS' | 'FAIL';
  readonly capabilityHealthScore: number;
  readonly gates: readonly GateSnapshotEntry[];
  readonly certificationVerdict: CertificationVerdict;
  readonly overclaimRisk: number;
}

export interface GateDescriptor {
  readonly name: GateName;
  readonly lastVerdict: GateVerdict;
}

function clampScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

@Injectable()
export class PulseTruthSnapshotService {
  private readonly descriptors: readonly GateDescriptor[];

  constructor(
    @Optional()
    @Inject('PULSE_TRUTH_SNAPSHOT_DESCRIPTORS')
    descriptors?: readonly GateDescriptor[],
  ) {
    this.descriptors = descriptors ?? [];
  }

  snapshot(): PulseTruthSnapshot {
    const verdicts = this.descriptors.map((d) => d.lastVerdict);

    if (verdicts.length === 0) {
      return {
        noOverclaimStatus: 'FAIL',
        capabilityHealthScore: 0,
        gates: [],
        certificationVerdict: 'INSUFFICIENT_EVIDENCE',
        overclaimRisk: 1,
      };
    }

    const gates: GateSnapshotEntry[] = verdicts.map((v) => ({
      name: v.gateName,
      mode: v.mode,
      lastResult: v.status,
    }));

    const passedCount = verdicts.filter((v) => v.status === 'PASS').length;
    const capabilityHealthScore = clampScore(passedCount / verdicts.length);

    const hardFailVerdicts = verdicts.filter((v) => v.mode === 'hard_fail');
    const hardFailFailed = hardFailVerdicts.filter((v) => v.status === 'FAIL').length;
    const hardFailTotal = hardFailVerdicts.length;

    const noOverclaimVerdict = verdicts.find((v) => v.gateName === 'no-overclaim');
    const noOverclaimStatus: 'PASS' | 'FAIL' =
      noOverclaimVerdict?.status === 'PASS' ? 'PASS' : 'FAIL';

    const hasRuntimeData = verdicts.length > 0;
    const hasHardFailData = hardFailTotal > 0;

    let certificationVerdict: CertificationVerdict;
    if (!hasRuntimeData) {
      certificationVerdict = 'INSUFFICIENT_EVIDENCE';
    } else if (!hasHardFailData) {
      certificationVerdict = 'INSUFFICIENT_EVIDENCE';
    } else if (hardFailFailed === 0) {
      certificationVerdict = 'CERTIFIED';
    } else {
      certificationVerdict = 'AT_RISK';
    }

    const overclaimRisk = hasHardFailData
      ? clampScore(hardFailFailed / hardFailTotal)
      : 1;

    return {
      noOverclaimStatus,
      capabilityHealthScore,
      gates,
      certificationVerdict,
      overclaimRisk,
    };
  }
}
