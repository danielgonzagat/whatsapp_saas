import * as path from 'path';
import type { PulseExecutionMatrixPath } from '../../types';
import type {
  PathCoverageExecutionMode,
  PathCoverageEntry,
} from '../../types.path-coverage-engine';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  buildTerminalReason,
  normalizeCoverageExecutionMode,
  buildExpectedEvidence,
  buildStructuralSafetyClassification,
  buildArtifactLinks,
} from './evidence';

function detectRouteMethod(mp: PulseExecutionMatrixPath): string {
  const chainRoles = mp.chain
    .map((s) => s.description)
    .join(' ')
    .toLowerCase();
  if (/post|create|save|send|submit/.test(chainRoles)) {
    return 'POST';
  }
  if (/put|update|edit|patch/.test(chainRoles)) {
    return 'PUT';
  }
  if (/delete|remove|destroy/.test(chainRoles)) {
    return 'DELETE';
  }
  return 'GET';
}

function isHighOrCriticalRisk(risk: PathCoverageEntry['risk']): boolean {
  return risk === 'high' || risk === 'critical';
}

export function canGenerateProbeBlueprint(
  mp: PulseExecutionMatrixPath,
  hasMapped: boolean,
): boolean {
  if (mp.routePatterns.length > 0) {
    return true;
  }

  if (!isHighOrCriticalRisk(mp.risk)) {
    return false;
  }

  return (
    hasMapped || Boolean(mp.entrypoint.filePath || mp.entrypoint.nodeId || mp.filePaths.length > 0)
  );
}

function generateProbeFileContent(
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

function buildRequiredValidation(mp: PulseExecutionMatrixPath): string[] {
  const base = [
    'runtime_harness_executes_blueprint',
    'response_contract_verified',
    'side_effects_verified_when_declared',
  ];
  if (!findSyntheticMachineProofDebt(mp)) {
    return base;
  }
  return [
    ...base,
    'scenario_blueprint_generated',
    'scenario_runtime_execution_attempted_or_classified',
    'terminal_proof_reason_recorded',
  ];
}

function findSyntheticMachineProofDebt(
  mp: PulseExecutionMatrixPath,
): PulseExecutionMatrixPath['observedEvidence'][number] | null {
  return (
    mp.observedEvidence.find(
      (entry) =>
        entry.source === 'actor' &&
        entry.status === 'missing' &&
        entry.summary.includes('PULSE machine work'),
    ) ?? null
  );
}

export function generateTestForPath(
  mp: PulseExecutionMatrixPath,
  rootDir: string,
  executionMode: PathCoverageExecutionMode = normalizeCoverageExecutionMode(
    mp.executionMode,
    mp.risk,
  ),
  terminalReason = buildTerminalReason(mp, 'probe_blueprint_generated', true),
): { testFilePath: string; fixtureNeeded: string[] } {
  const safeName = mp.pathId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
  const testDir = safeJoin(rootDir, '.pulse', 'frontier');
  const testFilePath = path.posix.join('.pulse', 'frontier', `${safeName}.probe.json`);
  ensureDir(testDir, { recursive: true });

  const fixtures: string[] = [];
  const routeMethod = detectRouteMethod(mp);

  if (mp.capabilityId) {
    fixtures.push(`capability:${mp.capabilityId}`);
  }
  if (mp.flowId) {
    fixtures.push(`flow:${mp.flowId}`);
  }

  const probeContent = generateProbeFileContent(
    mp,
    routeMethod,
    fixtures,
    executionMode,
    terminalReason,
  );
  writeTextFile(safeJoin(rootDir, testFilePath), probeContent);

  return { testFilePath, fixtureNeeded: fixtures };
}
