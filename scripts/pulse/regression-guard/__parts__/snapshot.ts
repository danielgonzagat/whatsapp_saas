import * as path from 'node:path';
import * as fs from 'node:fs';
import { deriveZeroValue } from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type { PulseExecutionMatrixSummary } from '../../types.execution-matrix';
import type { PulseSnapshot, PulseProofReadinessSummary } from './types';

/**
 * Read a JSON artifact at `filePath`.  Returns `null` for missing/unreadable files.
 */
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

/**
 * Resolve the most authoritative location of a Pulse artifact, preferring the
 * canonical `.pulse/current/` mirror and falling back to the repo-root copy.
 */
function findArtifact(rootDir: string, fileName: string | undefined): string | null {
  if (fileName == null) return null;
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

/**
 * Build a full PulseSnapshot from on-disk artifacts.  Reads:
 *   - PULSE_CERTIFICATE.json (score, blockingTier, gates)
 *   - PULSE_CODACY_STATE.json (HIGH count)
 *   - PULSE_HEALTH.json (runtime HIGH signals)
 *
 * Missing artifacts are treated as zero / empty so the snapshot is always well-formed.
 */
export function captureRegressionSnapshot(rootDir: string): PulseSnapshot {
  const catalog = discoverAllObservedArtifactFilenames();
  const certPath = findArtifact(rootDir, catalog.certificate);
  const codacyPath = findArtifact(rootDir, catalog.codacyState);
  const healthPath = findArtifact(rootDir, catalog.health);
  const executionMatrixPath = findArtifact(rootDir, catalog.executionMatrix);
  const proofReadinessPath = findArtifact(rootDir, catalog.proofReadiness);

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
    score: typeof certificate?.score === 'number' ? certificate.score : deriveZeroValue(),
    blockingTier:
      typeof certificate?.blockingTier === 'number' ? certificate.blockingTier : deriveZeroValue(),
    codacyHighCount:
      typeof codacy?.bySeverity?.HIGH === 'number' ? codacy.bySeverity.HIGH : deriveZeroValue(),
    gatesPass,
    scenarioPass,
    runtimeHighSignals,
    executionMatrixSummary: executionMatrix?.summary ?? {},
    proofReadinessSummary: proofReadiness?.summary ?? {},
  };
}
