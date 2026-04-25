import * as path from 'path';
import type { PulseArtifactRegistry } from './artifact-registry';
import { ensureDir, pathExists, readDir, removePath } from './safe-fs';
import { safeJoin } from './safe-path';

/** Pulse artifact cleanup report shape. */
export interface PulseArtifactCleanupReport {
  /** Generated at property. */
  generatedAt: string;
  /** Removed legacy pulse artifacts property. */
  removedLegacyPulseArtifacts: string[];
  /** Canonical dir property. */
  canonicalDir: string;
  /** Mirrors property. */
  mirrors: string[];
  /** Cleanup mode property. */
  cleanupMode: 'enforced-single-state';
}

const LEGACY_ROOT_ARTIFACTS = [
  'AUDIT_FEATURE_MATRIX.md',
  'KLOEL_PRODUCT_MAP.md',
  'PULSE_ADMIN_EVIDENCE.json',
  'PULSE_BROWSER_EVIDENCE.json',
  'PULSE_CERTIFICATE.json',
  'PULSE_CLI_DIRECTIVE.json',
  'PULSE_CODEBASE_TRUTH.json',
  'PULSE_CONVERGENCE_PLAN.json',
  'PULSE_CONVERGENCE_PLAN.md',
  'PULSE_CUSTOMER_EVIDENCE.json',
  'PULSE_EXECUTION_TRACE.json',
  'PULSE_FLOW_EVIDENCE.json',
  'PULSE_HEALTH.json',
  'PULSE_INVARIANT_EVIDENCE.json',
  'PULSE_OBSERVABILITY_EVIDENCE.json',
  'PULSE_OPERATOR_EVIDENCE.json',
  'PULSE_RECOVERY_EVIDENCE.json',
  'PULSE_REPORT.md',
  'PULSE_RESOLVED_MANIFEST.json',
  'PULSE_RUNTIME_EVIDENCE.json',
  'PULSE_RUNTIME_PROBES.json',
  'PULSE_SCENARIO_COVERAGE.json',
  'PULSE_SCOPE_STATE.json',
  'PULSE_SOAK_EVIDENCE.json',
  'PULSE_WORLD_STATE.json',
];

function removeIfExists(targetPath: string, removed: string[], rootDir: string) {
  if (!pathExists(targetPath)) {
    return;
  }
  removePath(targetPath, { recursive: true, force: true });
  removed.push(path.relative(rootDir, targetPath) || path.basename(targetPath));
}

/** Clean legacy and temporary PULSE artifacts before a new run. */
export function cleanupPulseArtifacts(registry: PulseArtifactRegistry): PulseArtifactCleanupReport {
  const removed: string[] = [];

  // Ensure canonical dirs exist without removing them
  ensureDir(path.dirname(registry.canonicalDir), { recursive: true });
  ensureDir(registry.tempDir, { recursive: true });
  ensureDir(registry.canonicalDir, { recursive: true });

  for (const artifactName of LEGACY_ROOT_ARTIFACTS) {
    const targetPath = safeJoin(registry.rootDir, artifactName);
    if (artifactName === 'PULSE_CODACY_STATE.json') {
      continue;
    }
    removeIfExists(targetPath, removed, registry.rootDir);
  }

  for (const entry of readDir(registry.rootDir)) {
    const normalizedEntry = entry.toUpperCase();
    if (normalizedEntry.startsWith('PULSE_FLOW_') && normalizedEntry.endsWith('.JSON')) {
      removeIfExists(safeJoin(registry.rootDir, entry), removed, registry.rootDir);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    removedLegacyPulseArtifacts: removed.sort(),
    canonicalDir: registry.canonicalDir,
    mirrors: registry.mirrors,
    cleanupMode: 'enforced-single-state',
  };
}
