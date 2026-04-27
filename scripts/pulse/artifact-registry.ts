import { safeJoin } from './safe-path';

/** Pulse artifact definition shape. */
export interface PulseArtifactDefinition {
  /** Id property. */
  id: string;
  /** Relative path property. */
  relativePath: string;
  /** Mirror to root property. */
  mirrorToRoot?: boolean;
}

/** Pulse artifact registry shape. */
export interface PulseArtifactRegistry {
  /** Root dir property. */
  rootDir: string;
  /** Canonical dir property. */
  canonicalDir: string;
  /** Temp dir property. */
  tempDir: string;
  /** Artifacts property. */
  artifacts: PulseArtifactDefinition[];
  /** Mirrors property. */
  mirrors: string[];
  /**
   * Optional run identity. Set once per PULSE execution by `generateArtifacts`
   * before any `writeArtifact` call so every artifact emitted in the same run
   * can be tagged with the same UUID.
   */
  runId?: string;
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
  { id: 'execution-chains', relativePath: 'PULSE_EXECUTION_CHAINS.json' },
  { id: 'product-graph', relativePath: 'PULSE_PRODUCT_GRAPH.json' },
  { id: 'capability-state', relativePath: 'PULSE_CAPABILITY_STATE.json' },
  { id: 'flow-projection', relativePath: 'PULSE_FLOW_PROJECTION.json' },
  { id: 'parity-gaps', relativePath: 'PULSE_PARITY_GAPS.json' },
  { id: 'external-signal-state', relativePath: 'PULSE_EXTERNAL_SIGNAL_STATE.json' },
  { id: 'product-vision', relativePath: 'PULSE_PRODUCT_VISION.json' },
  { id: 'convergence-plan', relativePath: 'PULSE_CONVERGENCE_PLAN.json' },
  { id: 'autonomy-proof', relativePath: 'PULSE_AUTONOMY_PROOF.json' },
  { id: 'autonomy-state', relativePath: 'PULSE_AUTONOMY_STATE.json' },
  { id: 'autonomy-memory', relativePath: 'PULSE_AUTONOMY_MEMORY.json' },
  { id: 'agent-orchestration-state', relativePath: 'PULSE_AGENT_ORCHESTRATION_STATE.json' },
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
  { id: 'gitnexus-evidence', relativePath: 'PULSE_GITNEXUS_EVIDENCE.json' },
];

/** Build the canonical artifact registry for a PULSE run. */
export function buildArtifactRegistry(rootDir: string): PulseArtifactRegistry {
  const canonicalDir = safeJoin(rootDir, '.pulse', 'current');
  const tempDir = safeJoin(rootDir, '.pulse', 'tmp');
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
