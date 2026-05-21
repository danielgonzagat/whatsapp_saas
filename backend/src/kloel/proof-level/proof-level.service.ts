import { Injectable } from '@nestjs/common';
import { EvidenceDescriptor, ProofClassification, ProofLevel } from './proof-level.types';

const ORIGIN_TO_LEVEL: Record<EvidenceDescriptor['origin'], ProofLevel> = {
  mental_simulation: 'N1',
  synthetic_scenario: 'N2',
  code_run: 'N3',
  observed_user: 'N4',
  user_confirmed: 'N5',
  commercial_outcome: 'N6',
};

const LEVEL_INDEX: Record<ProofLevel, number> = {
  N1: 0,
  N2: 1,
  N3: 2,
  N4: 3,
  N5: 4,
  N6: 5,
};

function computeMissing(evidence: EvidenceDescriptor, current: ProofLevel): string[] {
  const missing: string[] = [];
  const currentIdx = LEVEL_INDEX[current];

  if (currentIdx < 1) {
    missing.push('Requires synthetic_scenario origin to reach N2');
  }
  if (currentIdx < 2) {
    missing.push('Requires code_run origin to reach N3');
  }
  if (currentIdx < 3) {
    if (evidence.sampleSize <= 1) {
      missing.push('Requires sampleSize > 1 to reach N4');
    }
    missing.push('Requires observed_user origin to reach N4');
  }
  if (currentIdx < 4) {
    if (evidence.confirmedBy === undefined || evidence.confirmedBy === '') {
      missing.push('Requires confirmedBy to reach N5');
    }
    missing.push('Requires user_confirmed origin to reach N5');
  }
  if (currentIdx < 5) {
    if (evidence.sampleSize <= 0) {
      missing.push('Requires sampleSize > 0 to reach N6');
    }
    if (evidence.commercialMetric === undefined || evidence.commercialMetric === null) {
      missing.push('Requires commercialMetric to reach N6');
    }
    missing.push('Requires commercial_outcome origin to reach N6');
  }

  return missing;
}

@Injectable()
export class ProofLevelService {
  public classify(evidence: EvidenceDescriptor): ProofClassification {
    const level = ORIGIN_TO_LEVEL[evidence.origin];
    const levelIdx = LEVEL_INDEX[level];
    const canDeclareProvado = levelIdx >= 3;

    const readyForRealValidation = levelIdx >= 3 && evidence.sampleSize >= 1;

    const missingForNextLevel = levelIdx >= 5 ? [] : computeMissing(evidence, level);

    return {
      level,
      canDeclareProvado,
      readyForRealValidation,
      missingForNextLevel,
    };
  }
}
