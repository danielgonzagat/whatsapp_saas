import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { pathExists, readJsonFile } from '../../safe-fs';
import type { PulseProductGraph } from '../../types';
import type { BehaviorGraph } from '../../types.behavior-graph';
import type { DataflowState } from '../../types.dataflow-engine';
import type { HarnessEvidence } from '../../types.execution-harness';
import {
  BEHAVIOR_GRAPH_FILENAME,
  DATAFLOW_STATE_FILENAME,
  HARNESS_EVIDENCE_FILENAME,
  PRODUCT_GRAPH_FILENAME,
} from './constants';

function resolveArtifactPath(rootDir: string, fileName: string): string {
  const candidates = [
    path.join(rootDir, fileName),
    safeJoin(rootDir, '.pulse', 'current', fileName),
  ];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return safeJoin(rootDir, '.pulse', 'current', fileName);
}

function loadJsonArtifact<T>(rootDir: string, fileName: string): T | null {
  const filePath = resolveArtifactPath(rootDir, fileName);
  try {
    const raw = readJsonFile<T>(filePath);
    if (raw !== null && raw !== undefined) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

interface LoadedArtifacts {
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
}

function loadAllArtifacts(rootDir: string): LoadedArtifacts {
  return {
    productGraph: loadJsonArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME),
    behaviorGraph: loadJsonArtifact<BehaviorGraph>(rootDir, BEHAVIOR_GRAPH_FILENAME),
    harnessEvidence: loadJsonArtifact<HarnessEvidence>(rootDir, HARNESS_EVIDENCE_FILENAME),
    dataflowState: loadJsonArtifact<DataflowState>(rootDir, DATAFLOW_STATE_FILENAME),
  };
}

export type { LoadedArtifacts };
export { resolveArtifactPath, loadJsonArtifact, loadAllArtifacts };
