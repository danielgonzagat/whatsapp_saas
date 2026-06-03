import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AbiReadinessTruth } from './abi-schema';

export interface ReadinessTruthSnapshot {
  readonly snapshot: () => AbiReadinessTruth;
}

const DEFAULT_STATE: AbiReadinessTruth = {
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
export class ReadinessTruthSnapshotService implements ReadinessTruthSnapshot {
  private readonly state: AbiReadinessTruth;

  constructor(@Optional() @Inject('ABI_READINESS_TRUTH_STATE') state?: AbiReadinessTruth) {
    this.state = state ?? DEFAULT_STATE;
  }

  snapshot(): AbiReadinessTruth {
    return { ...this.state };
  }
}
