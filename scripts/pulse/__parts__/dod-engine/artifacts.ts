import { ensureDir, pathExists, readTextFile } from '../../safe-fs';
import { safeJoin, resolveRoot } from '../../lib/safe-path';
import type { PulseCapabilityState } from '../../types';

export type DoDArtifactKind =
  | 'dod-engine'
  | 'dod-state'
  | 'capability-state'
  | 'runtime-evidence'
  | 'observability-evidence'
  | 'recovery-evidence'
  | 'browser-evidence'
  | 'flow-evidence'
  | 'scenario-coverage'
  | 'execution-harness';

export function dodArtifactFile(kind: DoDArtifactKind): string {
  return {
    'dod-engine': 'PULSE_DOD_ENGINE.json',
    'dod-state': 'PULSE_DOD_STATE.json',
    'capability-state': 'PULSE_CAPABILITY_STATE.json',
    'runtime-evidence': 'PULSE_RUNTIME_EVIDENCE.json',
    'observability-evidence': 'PULSE_OBSERVABILITY_EVIDENCE.json',
    'recovery-evidence': 'PULSE_RECOVERY_EVIDENCE.json',
    'browser-evidence': 'PULSE_BROWSER_EVIDENCE.json',
    'flow-evidence': 'PULSE_FLOW_EVIDENCE.json',
    'scenario-coverage': 'PULSE_SCENARIO_COVERAGE.json',
    'execution-harness': 'PULSE_HARNESS_EVIDENCE.json',
  }[kind];
}

export interface CapabilityInput {
  id: string;
  name: string;
  filePaths: string[];
  rolesPresent: string[];
  nodeIds: string[];
}

export interface LoadedArtifacts {
  runtimeEvidence: Record<string, unknown> | null;
  observabilityEvidence: Record<string, unknown> | null;
  recoveryEvidence: Record<string, unknown> | null;
  browserEvidence: Record<string, unknown> | null;
  flowEvidence: Record<string, unknown> | null;
  scenarioCoverage: Record<string, unknown> | null;
  harnessEvidence: Record<string, unknown> | null;
}

export function artifactDir(rootDir: string): string {
  return safeJoin(resolveRoot(rootDir), '.pulse', 'current');
}

export function loadJsonArtifact<T>(filePath: string): T | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    const raw = readTextFile(filePath);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadCapabilityState(rootDir: string): PulseCapabilityState | null {
  const dir = artifactDir(rootDir);
  const filePath = safeJoin(dir, dodArtifactFile('capability-state'));
  return loadJsonArtifact<PulseCapabilityState>(filePath);
}

export function loadSupportingArtifacts(rootDir: string): LoadedArtifacts {
  const dir = artifactDir(rootDir);
  return {
    runtimeEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('runtime-evidence'))),
    observabilityEvidence: loadJsonArtifact(
      safeJoin(dir, dodArtifactFile('observability-evidence')),
    ),
    recoveryEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('recovery-evidence'))),
    browserEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('browser-evidence'))),
    flowEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('flow-evidence'))),
    scenarioCoverage: loadJsonArtifact(safeJoin(dir, dodArtifactFile('scenario-coverage'))),
    harnessEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('execution-harness'))),
  };
}
