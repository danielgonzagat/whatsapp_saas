import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AbiPulseTruth } from './abi-schema';

export interface PulseTruthSnapshot {
  readonly snapshot: () => AbiPulseTruth;
}

const DEFAULT_STATE: AbiPulseTruth = {
  noOverclaimStatus: 'PASS',
  capabilityHealthScore: 0,
  gates: [],
  certificationVerdict: {
    verdict: 'INSUFFICIENT_EVIDENCE',
    score: 0,
    measuredAt: new Date(0).toISOString(),
  },
  overclaimRisk: 0,
};

@Injectable()
export class PulseTruthSnapshotService implements PulseTruthSnapshot {
  private readonly state: AbiPulseTruth;

  constructor(
    @Optional() @Inject('ABI_PULSE_TRUTH_STATE') state?: AbiPulseTruth,
  ) {
    this.state = state ?? DEFAULT_STATE;
  }

  snapshot(): AbiPulseTruth {
    return { ...this.state };
  }
}
