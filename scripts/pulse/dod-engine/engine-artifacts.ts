import { pathExists, readTextFile } from '../safe-fs';
import { safeJoin, resolveRoot } from '../lib/safe-path';
import type { PulseCapabilityState } from '../types.capabilities/03-capability';
import { dodArtifactFile } from './grammar';

export interface LoadedArtifacts {
  runtimeEvidence: Record<string, unknown> | null;
  observabilityEvidence: Record<string, unknown> | null;
  recoveryEvidence: Record<string, unknown> | null;
  browserEvidence: Record<string, unknown> | null;
  flowEvidence: Record<string, unknown> | null;
  scenarioCoverage: Record<string, unknown> | null;
  harnessEvidence: Record<string, unknown> | null;
}

function artifactDir(rootDir: string): string {
  return safeJoin(resolveRoot(rootDir), '.pulse', 'current');
}

function loadJsonArtifact<T>(filePath: string): T | null {
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
