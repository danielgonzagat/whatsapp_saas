import { safeJoin } from './safe-path';

/** Pulse artifact definition shape. */
export interface PulseArtifactDefinition {
  /** Id property. */
  id: string;
  /** Relative path property. */
  relativePath: string;
  /** Mirror to root property. */
  mirrorToRoot?: boolean;
  /** Maximum persisted bytes before the artifact writer applies storage policy. */
  maxBytes?: number;
  /** Storage strategy for oversized optional artifacts. */
  oversizedStrategy?: 'summarize-json';
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
  /** Run identity — set by generateArtifacts at run start. */
  runId?: string;
}

const OPTIONAL_EVIDENCE_MAX_BYTES = 1024 * 1024;
const OPTIONAL_TRACE_MAX_BYTES = 512 * 1024;

function optionalEvidence(
  id: string,
  relativePath: string,
  maxBytes: number = OPTIONAL_EVIDENCE_MAX_BYTES,
): PulseArtifactDefinition {
  return { id, relativePath, maxBytes, oversizedStrategy: 'summarize-json' };
}

const CANONICAL_ARTIFACTS: PulseArtifactDefinition[] = [
  { id: 'health', relativePath: 'PULSE_HEALTH.json', mirrorToRoot: true },
  { id: 'certificate', relativePath: 'PULSE_CERTIFICATE.json', mirrorToRoot: true },
  { id: 'directive', relativePath: 'PULSE_CLI_DIRECTIVE.json', mirrorToRoot: true },
  { id: 'machine-readiness', relativePath: 'PULSE_MACHINE_READINESS.json', mirrorToRoot: true },
  { id: 'artifact-index', relativePath: 'PULSE_ARTIFACT_INDEX.json', mirrorToRoot: true },
  { id: 'gitnexus-state', relativePath: 'PULSE_GITNEXUS_STATE.json', mirrorToRoot: true },
  { id: 'beads-state', relativePath: 'PULSE_BEADS_STATE.json', mirrorToRoot: true },
  { id: 'context-broadcast', relativePath: 'PULSE_CONTEXT_BROADCAST.json', mirrorToRoot: true },
  { id: 'worker-leases', relativePath: 'PULSE_WORKER_LEASES.json', mirrorToRoot: true },
  { id: 'context-delta', relativePath: 'PULSE_CONTEXT_DELTA.json', mirrorToRoot: true },
  { id: 'report', relativePath: 'PULSE_REPORT.md', mirrorToRoot: true },
  { id: 'scope-state', relativePath: 'PULSE_SCOPE_STATE.json' },
  { id: 'codacy-evidence', relativePath: 'PULSE_CODACY_EVIDENCE.json' },
  { id: 'structural-graph', relativePath: 'PULSE_STRUCTURAL_GRAPH.json' },
  { id: 'execution-chains', relativePath: 'PULSE_EXECUTION_CHAINS.json' },
  { id: 'execution-matrix', relativePath: 'PULSE_EXECUTION_MATRIX.json' },
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
  optionalEvidence('runtime-evidence', 'PULSE_RUNTIME_EVIDENCE.json'),
  { id: 'runtime-probes', relativePath: 'PULSE_RUNTIME_PROBES.json' },
  optionalEvidence('runtime-traces', 'PULSE_RUNTIME_TRACES.json', OPTIONAL_TRACE_MAX_BYTES),
  { id: 'trace-diff', relativePath: 'PULSE_TRACE_DIFF.json' },
  { id: 'runtime-fusion', relativePath: 'PULSE_RUNTIME_FUSION.json' },
  optionalEvidence('browser-evidence', 'PULSE_BROWSER_EVIDENCE.json'),
  optionalEvidence('flow-evidence', 'PULSE_FLOW_EVIDENCE.json'),
  optionalEvidence('invariant-evidence', 'PULSE_INVARIANT_EVIDENCE.json'),
  optionalEvidence('observability-evidence', 'PULSE_OBSERVABILITY_EVIDENCE.json'),
  { id: 'observability-coverage', relativePath: 'PULSE_OBSERVABILITY_COVERAGE.json' },
  optionalEvidence('recovery-evidence', 'PULSE_RECOVERY_EVIDENCE.json'),
  optionalEvidence('customer-evidence', 'PULSE_CUSTOMER_EVIDENCE.json'),
  optionalEvidence('operator-evidence', 'PULSE_OPERATOR_EVIDENCE.json'),
  optionalEvidence('admin-evidence', 'PULSE_ADMIN_EVIDENCE.json'),
  optionalEvidence('soak-evidence', 'PULSE_SOAK_EVIDENCE.json'),
  { id: 'scenario-coverage', relativePath: 'PULSE_SCENARIO_COVERAGE.json' },
  optionalEvidence('scenario-evidence', 'PULSE_SCENARIO_EVIDENCE.json'),
  optionalEvidence('harness-evidence', 'PULSE_HARNESS_EVIDENCE.json'),
  { id: 'path-coverage', relativePath: 'PULSE_PATH_COVERAGE.json' },
  { id: 'production-proof', relativePath: 'PULSE_PRODUCTION_PROOF.json' },
  { id: 'perfectness-layer-state', relativePath: 'PULSE_PERFECTNESS_LAYER_STATE.json' },
  { id: 'perfectness-result', relativePath: 'PULSE_PERFECTNESS_RESULT.json' },
  { id: 'audit-chain', relativePath: 'PULSE_AUDIT_CHAIN.jsonl' },
  { id: 'world-state', relativePath: 'PULSE_WORLD_STATE.json', mirrorToRoot: true },
  { id: 'execution-trace', relativePath: 'PULSE_EXECUTION_TRACE.json' },
  { id: 'codebase-truth', relativePath: 'PULSE_CODEBASE_TRUTH.json' },
  { id: 'resolved-manifest', relativePath: 'PULSE_RESOLVED_MANIFEST.json' },
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
