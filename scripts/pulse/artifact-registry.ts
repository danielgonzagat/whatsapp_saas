import { safeJoin } from './safe-path';

/** How PULSE should interpret an artifact as operational truth. */
export type PulseArtifactTruthMode =
  | 'generated_from_module'
  | 'preserved_evidence'
  | 'external_snapshot'
  | 'compatibility_mirror';

/** Module/type pair that owns an artifact payload shape. */
export interface PulseArtifactSchemaRef {
  /** Source module that owns the artifact shape or builder. */
  module: string;
  /** Exported type, builder, or artifact contract name. */
  exportName: string;
}

/** Module/export pair that produces an artifact during a PULSE run. */
export interface PulseArtifactProducerRef {
  /** Producer module. */
  module: string;
  /** Producer export or snapshot source field. */
  exportName: string;
}

/** Artifact freshness policy. */
export interface PulseArtifactFreshnessPolicy {
  /** Freshness is bound to a run, preserved evidence, or adapter snapshot. */
  mode: 'run' | 'preserved' | 'external_snapshot';
  /** Maximum accepted age for snapshot-like evidence. */
  maxAgeMinutes?: number;
}

/** Pulse artifact definition shape. */
export interface PulseArtifactDefinition {
  /** Id property. */
  id: string;
  /** Relative path property. */
  relativePath: string;
  /** Schema module that owns this artifact's payload shape. */
  schema: PulseArtifactSchemaRef;
  /** Producer module/export that owns artifact generation. */
  producer: PulseArtifactProducerRef;
  /** Downstream modules that consume this artifact as evidence. */
  consumers: string[];
  /** Freshness policy for interpreting this artifact. */
  freshness: PulseArtifactFreshnessPolicy;
  /** Truth mode for this artifact; filenames are compatibility, not truth. */
  truthMode: PulseArtifactTruthMode;
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

type ArtifactDefinitionInput = Omit<
  PulseArtifactDefinition,
  'consumers' | 'freshness' | 'truthMode'
> & {
  consumers?: string[];
  freshness?: PulseArtifactFreshnessPolicy;
  truthMode?: PulseArtifactTruthMode;
};

function defineArtifact(definition: ArtifactDefinitionInput): PulseArtifactDefinition {
  return {
    ...definition,
    consumers: definition.consumers ?? [],
    freshness: definition.freshness ?? { mode: 'run' },
    truthMode: definition.truthMode ?? 'generated_from_module',
  };
}

function optionalEvidence(
  id: string,
  relativePath: string,
  maxBytes: number = OPTIONAL_EVIDENCE_MAX_BYTES,
  producerExportName: string = 'certification.evidenceSummary',
): PulseArtifactDefinition {
  return defineArtifact({
    id,
    relativePath,
    schema: { module: './types', exportName: 'PulseCertification.evidenceSummary' },
    producer: { module: './artifacts', exportName: producerExportName },
    consumers: ['./certification', './execution-matrix', './artifacts.directive'],
    freshness: { mode: 'preserved' },
    truthMode: 'preserved_evidence',
    maxBytes,
    oversizedStrategy: 'summarize-json',
  });
}

const CANONICAL_ARTIFACTS: PulseArtifactDefinition[] = [
  defineArtifact({
    id: 'health',
    relativePath: 'PULSE_HEALTH.json',
    schema: { module: './types', exportName: 'PulseHealth' },
    producer: { module: './artifacts', exportName: 'buildHealth' },
    consumers: ['./artifacts.report', './certification'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'certificate',
    relativePath: 'PULSE_CERTIFICATE.json',
    schema: { module: './types', exportName: 'PulseCertification' },
    producer: { module: './artifacts.report', exportName: 'buildCertificate' },
    consumers: ['./self-trust', './cross-artifact-consistency-check', './artifacts.directive'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'directive',
    relativePath: 'PULSE_CLI_DIRECTIVE.json',
    schema: { module: './artifacts.directive', exportName: 'buildDirective' },
    producer: { module: './artifacts.directive', exportName: 'buildDirective' },
    consumers: ['./autonomy-loop', './context-broadcast', './self-trust'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'machine-readiness',
    relativePath: 'PULSE_MACHINE_READINESS.json',
    schema: { module: './artifacts.types', exportName: 'PulseMachineReadiness' },
    producer: { module: './artifacts.report', exportName: 'buildPulseMachineReadiness' },
    consumers: ['./artifacts.directive', './directive-proof-surface'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'artifact-index',
    relativePath: 'PULSE_ARTIFACT_INDEX.json',
    schema: { module: './artifacts.directive', exportName: 'buildArtifactIndex' },
    producer: { module: './artifacts.directive', exportName: 'buildArtifactIndex' },
    consumers: ['./self-trust', './index'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'gitnexus-state',
    relativePath: 'PULSE_GITNEXUS_STATE.json',
    schema: { module: './context-broadcast', exportName: 'gitnexusState' },
    producer: { module: './context-broadcast', exportName: 'buildPulseContextFabricBundle' },
    consumers: ['./adapters/gitnexus-adapter', './context-broadcast'],
    freshness: { mode: 'external_snapshot', maxAgeMinutes: 24 * 60 },
    truthMode: 'external_snapshot',
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'beads-state',
    relativePath: 'PULSE_BEADS_STATE.json',
    schema: { module: './context-broadcast', exportName: 'beadsState' },
    producer: { module: './context-broadcast', exportName: 'buildPulseContextFabricBundle' },
    consumers: ['./context-broadcast'],
    freshness: { mode: 'external_snapshot', maxAgeMinutes: 24 * 60 },
    truthMode: 'external_snapshot',
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'context-broadcast',
    relativePath: 'PULSE_CONTEXT_BROADCAST.json',
    schema: { module: './context-broadcast', exportName: 'PulseContextBroadcast' },
    producer: { module: './context-broadcast', exportName: 'buildPulseContextFabricBundle' },
    consumers: ['./autonomy-loop.parallel', './worker-lease'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'worker-leases',
    relativePath: 'PULSE_WORKER_LEASES.json',
    schema: { module: './context-broadcast', exportName: 'PulseWorkerLeases' },
    producer: { module: './context-broadcast', exportName: 'buildPulseContextFabricBundle' },
    consumers: ['./worker-lease', './autonomy-loop.parallel'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'context-delta',
    relativePath: 'PULSE_CONTEXT_DELTA.json',
    schema: { module: './context-broadcast', exportName: 'PulseContextDelta' },
    producer: { module: './context-broadcast', exportName: 'buildPulseContextFabricBundle' },
    consumers: ['./context-broadcast'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'report',
    relativePath: 'PULSE_REPORT.md',
    schema: { module: './artifacts.report', exportName: 'buildReport' },
    producer: { module: './artifacts.report', exportName: 'buildReport' },
    consumers: ['./index'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'scope-state',
    relativePath: 'PULSE_SCOPE_STATE.json',
    schema: { module: './types', exportName: 'PulseScopeState' },
    producer: { module: './artifacts', exportName: 'snapshot.scopeState' },
    consumers: ['./scope-state', './external-signals'],
  }),
  defineArtifact({
    id: 'codacy-evidence',
    relativePath: 'PULSE_CODACY_EVIDENCE.json',
    schema: { module: './types', exportName: 'PulseCodacyEvidence' },
    producer: { module: './artifacts', exportName: 'snapshot.codacyEvidence' },
    consumers: ['./artifacts.directive', './product-vision'],
  }),
  defineArtifact({
    id: 'structural-graph',
    relativePath: 'PULSE_STRUCTURAL_GRAPH.json',
    schema: { module: './types', exportName: 'PulseStructuralGraph' },
    producer: { module: './artifacts', exportName: 'snapshot.structuralGraph' },
    consumers: ['./chaos-engine', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'execution-chains',
    relativePath: 'PULSE_EXECUTION_CHAINS.json',
    schema: { module: './types', exportName: 'PulseExecutionChainSet' },
    producer: { module: './artifacts', exportName: 'snapshot.executionChains' },
    consumers: ['./execution-matrix'],
  }),
  defineArtifact({
    id: 'execution-matrix',
    relativePath: 'PULSE_EXECUTION_MATRIX.json',
    schema: { module: './types', exportName: 'PulseExecutionMatrix' },
    producer: { module: './artifacts', exportName: 'snapshot.executionMatrix' },
    consumers: ['./path-coverage-engine', './artifacts.directive', './path-proof-runner'],
  }),
  defineArtifact({
    id: 'product-graph',
    relativePath: 'PULSE_PRODUCT_GRAPH.json',
    schema: { module: './types', exportName: 'PulseProductGraph' },
    producer: { module: './artifacts', exportName: 'snapshot.productGraph' },
    consumers: ['./chaos-engine', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'capability-state',
    relativePath: 'PULSE_CAPABILITY_STATE.json',
    schema: { module: './types', exportName: 'PulseCapabilityState' },
    producer: { module: './artifacts', exportName: 'snapshot.capabilityState' },
    consumers: ['./observability-coverage', './runtime-fusion', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'flow-projection',
    relativePath: 'PULSE_FLOW_PROJECTION.json',
    schema: { module: './types', exportName: 'PulseFlowProjection' },
    producer: { module: './artifacts', exportName: 'snapshot.flowProjection' },
    consumers: ['./runtime-fusion', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'parity-gaps',
    relativePath: 'PULSE_PARITY_GAPS.json',
    schema: { module: './types', exportName: 'PulseParityGapsArtifact' },
    producer: { module: './artifacts', exportName: 'snapshot.parityGaps' },
    consumers: ['./artifacts.directive'],
  }),
  defineArtifact({
    id: 'external-signal-state',
    relativePath: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
    schema: { module: './types', exportName: 'PulseExternalSignalState' },
    producer: { module: './artifacts', exportName: 'snapshot.externalSignalState' },
    consumers: ['./runtime-fusion', './adapters/gitnexus-adapter', './artifacts.directive'],
    freshness: { mode: 'external_snapshot', maxAgeMinutes: 6 * 60 },
    truthMode: 'external_snapshot',
  }),
  defineArtifact({
    id: 'product-vision',
    relativePath: 'PULSE_PRODUCT_VISION.json',
    schema: { module: './types', exportName: 'PulseProductVision' },
    producer: { module: './artifacts', exportName: 'snapshot.productVision' },
    consumers: ['./artifacts.directive'],
  }),
  defineArtifact({
    id: 'convergence-plan',
    relativePath: 'PULSE_CONVERGENCE_PLAN.json',
    schema: { module: './types', exportName: 'PulseConvergencePlan' },
    producer: { module: './convergence-plan', exportName: 'buildConvergencePlan' },
    consumers: ['./artifacts.autonomy', './context-broadcast', './path-proof-runner'],
  }),
  defineArtifact({
    id: 'autonomy-proof',
    relativePath: 'PULSE_AUTONOMY_PROOF.json',
    schema: { module: './artifacts.autonomy', exportName: 'buildAutonomyProof' },
    producer: { module: './artifacts', exportName: 'directive.autonomyProof' },
    consumers: ['./self-trust', './cross-artifact-consistency-check'],
  }),
  defineArtifact({
    id: 'autonomy-state',
    relativePath: 'PULSE_AUTONOMY_STATE.json',
    schema: { module: './types', exportName: 'PulseAutonomyState' },
    producer: { module: './autonomy-loop', exportName: 'buildPulseAutonomyStateSeed' },
    consumers: ['./autonomy-loop', './self-trust'],
  }),
  defineArtifact({
    id: 'autonomy-memory',
    relativePath: 'PULSE_AUTONOMY_MEMORY.json',
    schema: { module: './autonomy-loop', exportName: 'buildPulseAutonomyMemoryState' },
    producer: { module: './autonomy-loop', exportName: 'buildPulseAutonomyMemoryState' },
    consumers: ['./autonomy-memory'],
  }),
  defineArtifact({
    id: 'agent-orchestration-state',
    relativePath: 'PULSE_AGENT_ORCHESTRATION_STATE.json',
    schema: { module: './types', exportName: 'PulseAgentOrchestrationState' },
    producer: { module: './autonomy-loop', exportName: 'buildPulseAgentOrchestrationStateSeed' },
    consumers: ['./autonomy-loop.parallel'],
  }),
  optionalEvidence('runtime-evidence', 'PULSE_RUNTIME_EVIDENCE.json'),
  defineArtifact({
    id: 'runtime-probes',
    relativePath: 'PULSE_RUNTIME_PROBES.json',
    schema: { module: './runtime-probes', exportName: 'PulseRuntimeProbesArtifact' },
    producer: { module: './runtime-probes', exportName: 'buildRuntimeProbesArtifact' },
    consumers: ['./runtime-fusion', './timeout-evidence'],
    freshness: { mode: 'preserved' },
    truthMode: 'preserved_evidence',
  }),
  optionalEvidence('runtime-traces', 'PULSE_RUNTIME_TRACES.json', OPTIONAL_TRACE_MAX_BYTES),
  defineArtifact({
    id: 'trace-diff',
    relativePath: 'PULSE_TRACE_DIFF.json',
    schema: { module: './runtime-fusion', exportName: 'traceDiff' },
    producer: { module: './runtime-fusion', exportName: 'buildRuntimeFusionArtifact' },
    consumers: ['./runtime-fusion'],
  }),
  defineArtifact({
    id: 'runtime-fusion',
    relativePath: 'PULSE_RUNTIME_FUSION.json',
    schema: { module: './runtime-fusion', exportName: 'PulseRuntimeFusion' },
    producer: { module: './runtime-fusion', exportName: 'buildRuntimeFusionArtifact' },
    consumers: ['./certification', './execution-matrix'],
  }),
  optionalEvidence('browser-evidence', 'PULSE_BROWSER_EVIDENCE.json'),
  optionalEvidence('flow-evidence', 'PULSE_FLOW_EVIDENCE.json'),
  optionalEvidence('invariant-evidence', 'PULSE_INVARIANT_EVIDENCE.json'),
  optionalEvidence('observability-evidence', 'PULSE_OBSERVABILITY_EVIDENCE.json'),
  defineArtifact({
    id: 'observability-coverage',
    relativePath: 'PULSE_OBSERVABILITY_COVERAGE.json',
    schema: { module: './types.observability-coverage', exportName: 'ObservabilityCoverageState' },
    producer: { module: './observability-coverage', exportName: 'buildObservabilityCoverage' },
    consumers: ['./certification', './artifacts.directive'],
  }),
  optionalEvidence('recovery-evidence', 'PULSE_RECOVERY_EVIDENCE.json'),
  optionalEvidence('customer-evidence', 'PULSE_CUSTOMER_EVIDENCE.json'),
  optionalEvidence('operator-evidence', 'PULSE_OPERATOR_EVIDENCE.json'),
  optionalEvidence('admin-evidence', 'PULSE_ADMIN_EVIDENCE.json'),
  optionalEvidence('soak-evidence', 'PULSE_SOAK_EVIDENCE.json'),
  defineArtifact({
    id: 'scenario-coverage',
    relativePath: 'PULSE_SCENARIO_COVERAGE.json',
    schema: {
      module: './types',
      exportName: 'PulseCertification.evidenceSummary.syntheticCoverage',
    },
    producer: {
      module: './artifacts',
      exportName: 'snapshot.certification.evidenceSummary.syntheticCoverage',
    },
    consumers: ['./scenario-evidence-loader', './cert-evidence-actor'],
  }),
  optionalEvidence('scenario-evidence', 'PULSE_SCENARIO_EVIDENCE.json'),
  optionalEvidence('harness-evidence', 'PULSE_HARNESS_EVIDENCE.json'),
  defineArtifact({
    id: 'path-coverage',
    relativePath: 'PULSE_PATH_COVERAGE.json',
    schema: { module: './types.path-coverage-engine', exportName: 'PathCoverageState' },
    producer: { module: './path-coverage-engine', exportName: 'buildPathCoverageState' },
    consumers: ['./path-proof-runner', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'path-proof-tasks',
    relativePath: 'PULSE_PATH_PROOF_TASKS.json',
    schema: { module: './path-proof-runner', exportName: 'PathProofPlan' },
    producer: { module: './path-proof-runner', exportName: 'buildPathProofPlan' },
    consumers: ['./path-proof-execution-runner', './artifacts.directive'],
  }),
  optionalEvidence('path-proof-evidence', 'PULSE_PATH_PROOF_EVIDENCE.json'),
  defineArtifact({
    id: 'command-graph',
    relativePath: 'PULSE_COMMAND_GRAPH.json',
    schema: { module: './command-graph-artifact', exportName: 'PulseCommandGraphArtifact' },
    producer: { module: './command-graph-artifact', exportName: 'buildPulseCommandGraphArtifact' },
    consumers: ['./daemon', './autonomy-loop'],
  }),
  defineArtifact({
    id: 'finding-validation-state',
    relativePath: 'PULSE_FINDING_VALIDATION_STATE.json',
    schema: { module: './finding-validation-engine', exportName: 'FindingValidationState' },
    producer: { module: './artifacts', exportName: 'buildFindingValidationState' },
    consumers: ['./finding-validation-engine', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'no-hardcoded-reality-state',
    relativePath: 'PULSE_NO_HARDCODED_REALITY.json',
    schema: { module: './no-hardcoded-reality-audit', exportName: 'PulseNoHardcodedRealityState' },
    producer: { module: './artifacts', exportName: 'buildNoHardcodedRealityState' },
    consumers: ['./certification', './artifacts.directive'],
  }),
  defineArtifact({
    id: 'production-proof',
    relativePath: 'PULSE_PRODUCTION_PROOF.json',
    schema: { module: './proof-synthesizer', exportName: 'PulseProductionProof' },
    producer: { module: './proof-synthesizer', exportName: 'synthesizeProofPlan' },
    consumers: ['./certification'],
  }),
  defineArtifact({
    id: 'perfectness-layer-state',
    relativePath: 'PULSE_PERFECTNESS_LAYER_STATE.json',
    schema: { module: './perfectness-test', exportName: 'PerfectnessLayerState' },
    producer: { module: './daemon', exportName: 'perfectness modules' },
    consumers: ['./perfectness-test', './daemon'],
  }),
  defineArtifact({
    id: 'perfectness-result',
    relativePath: 'PULSE_PERFECTNESS_RESULT.json',
    schema: { module: './perfectness-test', exportName: 'PerfectnessResult' },
    producer: { module: './perfectness-test', exportName: 'runPerfectnessTest' },
    consumers: ['./certification'],
  }),
  defineArtifact({
    id: 'audit-chain',
    relativePath: 'PULSE_AUDIT_CHAIN.jsonl',
    schema: { module: './audit-chain', exportName: 'PulseAuditChainEntry' },
    producer: { module: './audit-chain', exportName: 'appendAuditChainEntry' },
    consumers: ['./self-trust', './certification'],
    freshness: { mode: 'preserved' },
    truthMode: 'preserved_evidence',
  }),
  defineArtifact({
    id: 'world-state',
    relativePath: 'PULSE_WORLD_STATE.json',
    schema: { module: './types', exportName: 'PulseCertification.evidenceSummary.worldState' },
    producer: {
      module: './artifacts',
      exportName: 'snapshot.certification.evidenceSummary.worldState',
    },
    consumers: ['./certification', './scope-state'],
    mirrorToRoot: true,
  }),
  defineArtifact({
    id: 'execution-trace',
    relativePath: 'PULSE_EXECUTION_TRACE.json',
    schema: { module: './execution-trace', exportName: 'PulseExecutionTrace' },
    producer: {
      module: './artifacts',
      exportName: 'snapshot.certification.evidenceSummary.executionTrace',
    },
    consumers: ['./execution-trace', './runtime-fusion'],
    freshness: { mode: 'preserved' },
    truthMode: 'preserved_evidence',
  }),
  defineArtifact({
    id: 'codebase-truth',
    relativePath: 'PULSE_CODEBASE_TRUTH.json',
    schema: { module: './types', exportName: 'PulseCodebaseTruth' },
    producer: { module: './artifacts', exportName: 'snapshot.codebaseTruth' },
    consumers: ['./codebase-truth', './resolved-manifest'],
  }),
  defineArtifact({
    id: 'resolved-manifest',
    relativePath: 'PULSE_RESOLVED_MANIFEST.json',
    schema: { module: './types', exportName: 'PulseResolvedManifest' },
    producer: { module: './artifacts', exportName: 'snapshot.resolvedManifest' },
    consumers: ['./resolved-manifest', './artifacts.directive'],
  }),
];

function buildArtifactDefinitionById(
  artifacts: PulseArtifactDefinition[],
): Map<string, PulseArtifactDefinition> {
  return new Map(artifacts.map((artifact) => [artifact.id, artifact]));
}

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
    artifacts: [...CANONICAL_ARTIFACTS],
    mirrors,
  };
}

/** Resolve an artifact definition by stable registry id. */
export function getArtifactDefinitionById(
  registry: PulseArtifactRegistry,
  id: string,
): PulseArtifactDefinition | null {
  return buildArtifactDefinitionById(registry.artifacts).get(id) ?? null;
}

/** Resolve an artifact definition by stable registry id or fail closed. */
export function requireArtifactDefinitionById(
  registry: PulseArtifactRegistry,
  id: string,
): PulseArtifactDefinition {
  const artifact = getArtifactDefinitionById(registry, id);
  if (!artifact) {
    throw new Error(`PULSE artifact id is not registered: ${id}`);
  }
  return artifact;
}

/** Resolve the compatibility filename for a registered artifact id. */
export function resolveArtifactRelativePath(registry: PulseArtifactRegistry, id: string): string {
  return requireArtifactDefinitionById(registry, id).relativePath;
}
