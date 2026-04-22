import * as path from 'path';

export interface PulseArtifactDefinition {
  id: string;
  relativePath: string;
  mirrorToRoot?: boolean;
}

export interface PulseArtifactRegistry {
  rootDir: string;
  canonicalDir: string;
  tempDir: string;
  artifacts: PulseArtifactDefinition[];
  mirrors: string[];
}

const CANONICAL_ARTIFACTS: PulseArtifactDefinition[] = [
  { id: 'health', relativePath: 'PULSE_HEALTH.json', mirrorToRoot: true },
  { id: 'certificate', relativePath: 'PULSE_CERTIFICATE.json', mirrorToRoot: true },
  { id: 'directive', relativePath: 'PULSE_CLI_DIRECTIVE.json', mirrorToRoot: true },
  { id: 'artifact-index', relativePath: 'PULSE_ARTIFACT_INDEX.json', mirrorToRoot: true },
  { id: 'report', relativePath: 'PULSE_REPORT.md', mirrorToRoot: true },
  { id: 'scope-state', relativePath: 'PULSE_SCOPE_STATE.json' },
  { id: 'codacy-evidence', relativePath: 'PULSE_CODACY_EVIDENCE.json' },
  { id: 'structural-graph', relativePath: 'PULSE_STRUCTURAL_GRAPH.json' },
  { id: 'capability-state', relativePath: 'PULSE_CAPABILITY_STATE.json' },
  { id: 'flow-projection', relativePath: 'PULSE_FLOW_PROJECTION.json' },
  { id: 'parity-gaps', relativePath: 'PULSE_PARITY_GAPS.json' },
  { id: 'product-vision', relativePath: 'PULSE_PRODUCT_VISION.json' },
  { id: 'convergence-plan', relativePath: 'PULSE_CONVERGENCE_PLAN.json' },
  { id: 'runtime-evidence', relativePath: 'PULSE_RUNTIME_EVIDENCE.json' },
  { id: 'runtime-probes', relativePath: 'PULSE_RUNTIME_PROBES.json' },
  { id: 'browser-evidence', relativePath: 'PULSE_BROWSER_EVIDENCE.json' },
  { id: 'flow-evidence', relativePath: 'PULSE_FLOW_EVIDENCE.json' },
  { id: 'invariant-evidence', relativePath: 'PULSE_INVARIANT_EVIDENCE.json' },
  { id: 'observability-evidence', relativePath: 'PULSE_OBSERVABILITY_EVIDENCE.json' },
  { id: 'recovery-evidence', relativePath: 'PULSE_RECOVERY_EVIDENCE.json' },
  { id: 'customer-evidence', relativePath: 'PULSE_CUSTOMER_EVIDENCE.json' },
  { id: 'operator-evidence', relativePath: 'PULSE_OPERATOR_EVIDENCE.json' },
  { id: 'admin-evidence', relativePath: 'PULSE_ADMIN_EVIDENCE.json' },
  { id: 'soak-evidence', relativePath: 'PULSE_SOAK_EVIDENCE.json' },
  { id: 'scenario-coverage', relativePath: 'PULSE_SCENARIO_COVERAGE.json' },
  { id: 'world-state', relativePath: 'PULSE_WORLD_STATE.json' },
  { id: 'execution-trace', relativePath: 'PULSE_EXECUTION_TRACE.json' },
  { id: 'codebase-truth', relativePath: 'PULSE_CODEBASE_TRUTH.json' },
  { id: 'resolved-manifest', relativePath: 'PULSE_RESOLVED_MANIFEST.json' },
];

/** Build the canonical artifact registry for a PULSE run. */
export function buildArtifactRegistry(rootDir: string): PulseArtifactRegistry {
  const canonicalDir = path.join(rootDir, '.pulse', 'current');
  const tempDir = path.join(rootDir, '.pulse', 'tmp');
  const mirrors = CANONICAL_ARTIFACTS.filter((artifact) => artifact.mirrorToRoot).map(
    (artifact) => artifact.relativePath,
  );

  return {
    rootDir,
    canonicalDir,
    tempDir,
    artifacts: CANONICAL_ARTIFACTS,
    mirrors,
  };
}
