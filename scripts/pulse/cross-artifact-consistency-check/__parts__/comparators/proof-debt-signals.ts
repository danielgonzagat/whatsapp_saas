import type { LoadedArtifact } from '../../types';
import { deepGet } from '../../loaders';
import type { ProofDebtSignal } from './helpers';
import { isRecord } from './helpers';

function addProofDebtSignal(
  signals: ProofDebtSignal[],
  source: string,
  field: string,
  value: unknown,
): void {
  if (value === 'NAO' || value === false || value === 'missing_evidence') {
    signals.push({ source, field, value });
  }
}

function collectMissingEvidenceGateSignals(
  signals: ProofDebtSignal[],
  source: string,
  value: unknown,
  prefix: string,
): void {
  if (!isRecord(value)) {
    return;
  }

  const status = value.status;
  const failureClass = value.failureClass;
  if (status === 'fail' && failureClass === 'missing_evidence') {
    signals.push({ source, field: prefix, value: failureClass });
  }

  for (const [key, child] of Object.entries(value)) {
    if (isRecord(child)) {
      collectMissingEvidenceGateSignals(signals, source, child, `${prefix}.${key}`);
    }
  }
}

export function collectProofDebtSignals(artifacts: LoadedArtifact[]): ProofDebtSignal[] {
  const signals: ProofDebtSignal[] = [];

  for (const artifact of artifacts) {
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'productionAutonomyVerdict',
      deepGet(artifact.data, 'productionAutonomyVerdict') ??
        deepGet(artifact.data, 'productionAutonomyAnswer') ??
        deepGet(artifact.data, 'verdicts.productionAutonomy'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'zeroPromptProductionGuidanceVerdict',
      deepGet(artifact.data, 'zeroPromptProductionGuidanceVerdict') ??
        deepGet(artifact.data, 'zeroPromptProductionGuidanceAnswer') ??
        deepGet(artifact.data, 'verdicts.zeroPromptProductionGuidance'),
    );
    addProofDebtSignal(
      signals,
      artifact.filePath,
      'canDeclareComplete',
      deepGet(artifact.data, 'canDeclareComplete') ??
        deepGet(artifact.data, 'verdicts.canDeclareComplete'),
    );
    collectMissingEvidenceGateSignals(
      signals,
      artifact.filePath,
      deepGet(artifact.data, 'gates'),
      'gates',
    );
  }

  return signals;
}
