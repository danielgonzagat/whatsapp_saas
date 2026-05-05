import * as path from 'path';
import type { PulseExecutionMatrixPath } from '../../types.execution-matrix';
import type { PathCoverageExecutionMode } from '../../types.path-coverage-engine';
import {
  buildStructuralSafetyClassification,
  buildExpectedEvidence,
  buildArtifactLinks,
  buildRequiredValidation,
} from './terminal-proof';

function normalizeBlueprintMatrixStatus(
  status: PulseExecutionMatrixPath['status'],
):
  | Exclude<PulseExecutionMatrixPath['status'], 'blocked_human_required'>
  | 'governed_validation_required' {
  if (status === 'blocked_human_required') {
    return 'governed_validation_required';
  }
  return status;
}

export function generateProbeFileContent(
  mp: PulseExecutionMatrixPath,
  method: string,
  fixtures: string[],
  executionMode: PathCoverageExecutionMode,
  terminalReason: string,
): string {
  const route = mp.routePatterns[0] ?? '/';
  const safeName = mp.pathId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  const probeFilePath = path.posix.join('.pulse', 'frontier', `${safeName}.probe.json`);
  return JSON.stringify(
    {
      kind: 'pulse_frontier_probe_blueprint',
      pathId: mp.pathId,
      entrypoint: mp.entrypoint.description,
      matrixStatus: normalizeBlueprintMatrixStatus(mp.status),
      generatedAt: new Date().toISOString(),
      evidenceMode: 'blueprint',
      executed: false,
      coverageCountsAsObserved: false,
      probeExecutionMode: executionMode,
      terminalReason,
      structuralSafetyClassification: buildStructuralSafetyClassification(
        mp,
        true,
        false,
        executionMode,
      ),
      route: {
        method,
        pattern: route,
      },
      fixtures,
      validationCommand: mp.validationCommand,
      expectedEvidence: buildExpectedEvidence(mp),
      artifactLinks: buildArtifactLinks(mp, probeFilePath),
      breakpoint: mp.breakpoint,
      requiredEvidence: mp.requiredEvidence,
      validationRequired: buildRequiredValidation(mp),
    },
    null,
    2,
  );
}

export { normalizeBlueprintMatrixStatus };
