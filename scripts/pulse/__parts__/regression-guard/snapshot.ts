import * as path from 'node:path';
import * as fs from 'node:fs';
import type { PulseSnapshot } from './types';
import type { PulseExecutionMatrixSummary } from '../../types.execution-matrix';
import type { PulseProofReadinessSummary } from './types';

function readJsonArtifact<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function findArtifact(rootDir: string, fileName: string): string | null {
  const canonical = path.join(rootDir, '.pulse', 'current', fileName);
  if (fs.existsSync(canonical)) {
    return canonical;
  }
  const fallback = path.join(rootDir, fileName);
  if (fs.existsSync(fallback)) {
    return fallback;
  }
  return null;
}

export function captureRegressionSnapshot(rootDir: string): PulseSnapshot {
  const certPath = findArtifact(rootDir, 'PULSE_CERTIFICATE.json');
  const codacyPath = findArtifact(rootDir, 'PULSE_CODACY_STATE.json');
  const healthPath = findArtifact(rootDir, 'PULSE_HEALTH.json');
  const executionMatrixPath = findArtifact(rootDir, 'PULSE_EXECUTION_MATRIX.json');
  const proofReadinessPath = findArtifact(rootDir, 'PULSE_PROOF_READINESS.json');

  const certificate = certPath
    ? readJsonArtifact<{
        score?: number;
        blockingTier?: number;
        gates?: Record<string, { status?: string }>;
        scenarios?: Record<string, { status?: string }>;
      }>(certPath)
    : null;
  const codacy = codacyPath
    ? readJsonArtifact<{ bySeverity?: { HIGH?: number } }>(codacyPath)
    : null;
  const health = healthPath
    ? readJsonArtifact<{ breaks?: Array<{ severity?: string }> }>(healthPath)
    : null;
  const executionMatrix = executionMatrixPath
    ? readJsonArtifact<{ summary?: PulseExecutionMatrixSummary }>(executionMatrixPath)
    : null;
  const proofReadiness = proofReadinessPath
    ? readJsonArtifact<{ summary?: Partial<PulseProofReadinessSummary> }>(proofReadinessPath)
    : null;

  const gatesPass: Record<string, boolean> = {};
  if (certificate?.gates) {
    for (const [name, value] of Object.entries(certificate.gates)) {
      gatesPass[name] = value?.status === 'pass';
    }
  }

  const scenarioPass: Record<string, boolean> = {};
  if (certificate?.scenarios) {
    for (const [id, value] of Object.entries(certificate.scenarios)) {
      scenarioPass[id] = value?.status === 'pass';
    }
  }

  const runtimeHighSignals = (health?.breaks || []).filter(
    (entry) => entry?.severity === 'critical' || entry?.severity === 'high',
  ).length;

  return {
    score: typeof certificate?.score === 'number' ? certificate.score : 0,
    blockingTier: typeof certificate?.blockingTier === 'number' ? certificate.blockingTier : 0,
    codacyHighCount: typeof codacy?.bySeverity?.HIGH === 'number' ? codacy.bySeverity.HIGH : 0,
    gatesPass,
    scenarioPass,
    runtimeHighSignals,
    executionMatrixSummary: executionMatrix?.summary ?? {},
    proofReadinessSummary: proofReadiness?.summary ?? {},
  };
}
