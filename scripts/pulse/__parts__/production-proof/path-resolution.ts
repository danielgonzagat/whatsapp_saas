import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { isRuntimeProbeProofEligible, normalizeRuntimeProbesArtifact } from '../../runtime-probes';
import type { ProofStatus } from '../../types.production-proof';
import type {
  PulseRuntimeProbeArtifactProbe,
  PulseRuntimeProbesArtifact,
} from '../../types.runtime-probes';

export const PRODUCTION_PROOF_FILENAME = 'PULSE_PRODUCTION_PROOF.json';
export const CAPABILITY_STATE_FILENAME = 'PULSE_CAPABILITY_STATE.json';
export const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
export const RUNTIME_PROBES_FILENAME = 'PULSE_RUNTIME_PROBES.json';
export const SENTRY_ADAPTER_FILENAME = 'PULSE_EXTERNAL_SIGNAL_STATE.json';
export const OBSERVABILITY_FILENAME = 'PULSE_OBSERVABILITY_EVIDENCE.json';
export const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

export function resolveArtifactPath(rootDir: string, fileName: string): string {
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

export function resolveStatePath(rootDir: string): string {
  return safeJoin(rootDir, '.pulse', 'current', PRODUCTION_PROOF_FILENAME);
}

export function safeReadJson<T>(rootDir: string, fileName: string): T | null {
  try {
    const filePath = resolveArtifactPath(rootDir, fileName);
    return readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export function loadRuntimeProbesArtifact(rootDir: string): PulseRuntimeProbesArtifact | null {
  const raw = safeReadJson<unknown>(rootDir, RUNTIME_PROBES_FILENAME);
  return normalizeRuntimeProbesArtifact(raw);
}

export function proofStatusForProbeSet(probes: PulseRuntimeProbeArtifactProbe[]): ProofStatus {
  if (probes.length === 0) {
    return 'unproven';
  }
  if (probes.some((probe) => probe.status === 'failed')) {
    return 'failed';
  }
  if (probes.some((probe) => probe.status === 'stale')) {
    return 'stale';
  }
  if (probes.some((probe) => probe.status === 'passed' && probe.freshness.stale)) {
    return 'stale';
  }
  if (probes.every(isRuntimeProbeProofEligible)) {
    return 'proven';
  }
  return 'unproven';
}
