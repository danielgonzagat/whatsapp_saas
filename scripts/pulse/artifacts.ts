/**
 * Pulse artifact generation — thin orchestrator.
 * Heavy logic lives in artifacts.io, artifacts.queue, artifacts.report,
 * artifacts.autonomy, and artifacts.directive sub-modules.
 */
import {
  buildPulseAutonomyMemoryState,
  buildPulseAgentOrchestrationStateSeed,
  buildPulseAutonomyStateSeed,
} from './autonomy-loop';
import { buildArtifactRegistry, type PulseArtifactRegistry } from './artifact-registry';
import { cleanupPulseArtifacts } from './artifact-gc';
import { buildConvergencePlan } from './convergence-plan';
import { readOptionalJson, writeArtifact } from './artifacts.io';
import { buildReport, buildCertificate } from './artifacts.report';
import { buildDirective, buildArtifactIndex } from './artifacts.directive';
import { deriveAuthorityState } from './artifacts.autonomy';
import { createRunIdentity, type PulseRunIdentity } from './run-identity';
import { safeResolveSegment } from './lib/safe-path';
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyState,
  PulseCapabilityState,
  PulseCertification,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseConvergencePlan,
  PulseExecutionChainSet,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseHealth,
  PulseManifest,
  PulseParityGapsArtifact,
  PulseProductGraph,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
} from './types';

/** Pulse artifact snapshot shape. */
export interface PulseArtifactSnapshot {
  /** Health property. */
  health: PulseHealth;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
  /** Scope state property. */
  scopeState: PulseScopeState;
  /** Codacy evidence property. */
  codacyEvidence: PulseCodacyEvidence;
  /** Structural graph property. */
  structuralGraph: PulseStructuralGraph;
  /** Execution chains property. */
  executionChains: PulseExecutionChainSet;
  /** Product graph property. */
  productGraph: PulseProductGraph;
  /** Capability state property. */
  capabilityState: PulseCapabilityState;
  /** Flow projection property. */
  flowProjection: PulseFlowProjection;
  /** Parity gaps property. */
  parityGaps: PulseParityGapsArtifact;
  /** External signal state property. */
  externalSignalState: PulseExternalSignalState;
  /** Product vision property. */
  productVision: PulseProductVision;
  /** Certification property. */
  certification: PulseCertification;
}

/** Pulse artifact paths shape. */
export interface PulseArtifactPaths {
  /** Canonical report path property. */
  reportPath: string;
  /** Canonical certificate path property. */
  certificatePath: string;
  /** Canonical directive path property. */
  cliDirectivePath: string;
  /** Canonical artifact index path property. */
  artifactIndexPath: string;
}

// Re-export PulseArtifactRegistry for consumers that import it from here.
export type { PulseArtifactRegistry };

/**
 * Resolve `fileName` against `registry.canonicalDir` and assert the resulting
 * path stays inside the canonical artifact directory. Throws on traversal
 * attempts so the path that reaches readOptionalJson is provably bounded.
 */
function resolveInsideCanonicalDir(registry: PulseArtifactRegistry, fileName: string): string {
  return safeResolveSegment(registry.canonicalDir, fileName);
}

/** Generate artifacts. */
export function generateArtifacts(
  snapshot: PulseArtifactSnapshot,
  rootDir: string,
  runMode?: PulseRunIdentity['mode'],
  profile?: string | null,
): PulseArtifactPaths {
  const registry = buildArtifactRegistry(rootDir);
  const identity = createRunIdentity(runMode ?? 'scan', profile);
  registry.runId = identity.runId;

  const previousAutonomyState = readOptionalJson<PulseAutonomyState>(
    resolveInsideCanonicalDir(registry, 'PULSE_AUTONOMY_STATE.json'),
  );
  const previousAgentOrchestrationState = readOptionalJson<PulseAgentOrchestrationState>(
    resolveInsideCanonicalDir(registry, 'PULSE_AGENT_ORCHESTRATION_STATE.json'),
  );
  const cleanupReport = cleanupPulseArtifacts(registry);
  const convergencePlan = buildConvergencePlan({
    health: snapshot.health,
    resolvedManifest: snapshot.resolvedManifest,
    scopeState: snapshot.scopeState,
    certification: snapshot.certification,
    capabilityState: snapshot.capabilityState,
    flowProjection: snapshot.flowProjection,
    parityGaps: snapshot.parityGaps,
    externalSignalState: snapshot.externalSignalState,
  });
  const authority = deriveAuthorityState(snapshot, convergencePlan);

  const reportPath = writeArtifact(
    'PULSE_REPORT.md',
    buildReport(snapshot, convergencePlan, cleanupReport),
    registry,
  );
  const certificatePath = writeArtifact(
    'PULSE_CERTIFICATE.json',
    buildCertificate(snapshot, convergencePlan),
    registry,
    identity,
  );
  const directiveContent = buildDirective(snapshot, convergencePlan, previousAutonomyState);
  const cliDirectivePath = writeArtifact(
    'PULSE_CLI_DIRECTIVE.json',
    directiveContent,
    registry,
    identity,
  );
  const directivePayload =
    readOptionalJson<Parameters<typeof buildPulseAutonomyStateSeed>[0]['directive']>(
      cliDirectivePath,
    ) || {};
  writeArtifact(
    'PULSE_AUTONOMY_PROOF.json',
    JSON.stringify((directivePayload as { autonomyProof?: unknown }).autonomyProof || {}, null, 2),
    registry,
    identity,
  );
  const artifactIndexPath = writeArtifact(
    'PULSE_ARTIFACT_INDEX.json',
    buildArtifactIndex(registry, cleanupReport, authority),
    registry,
    identity,
  );

  writeArtifact('PULSE_HEALTH.json', buildHealth(snapshot), registry, identity);
  writeArtifact(
    'PULSE_SCOPE_STATE.json',
    JSON.stringify(snapshot.scopeState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CODACY_EVIDENCE.json',
    JSON.stringify(snapshot.codacyEvidence, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_STRUCTURAL_GRAPH.json',
    JSON.stringify(snapshot.structuralGraph, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_EXECUTION_CHAINS.json',
    JSON.stringify(snapshot.executionChains, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_PRODUCT_GRAPH.json',
    JSON.stringify(snapshot.productGraph, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CAPABILITY_STATE.json',
    JSON.stringify(snapshot.capabilityState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_FLOW_PROJECTION.json',
    JSON.stringify(snapshot.flowProjection, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_PARITY_GAPS.json',
    JSON.stringify(snapshot.parityGaps, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_EXTERNAL_SIGNAL_STATE.json',
    JSON.stringify(snapshot.externalSignalState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_PRODUCT_VISION.json',
    JSON.stringify(snapshot.productVision, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CONVERGENCE_PLAN.json',
    JSON.stringify(convergencePlan, null, 2),
    registry,
    identity,
  );
  const autonomyState = buildPulseAutonomyStateSeed({
    directive: directivePayload,
    previousState: previousAutonomyState,
    orchestrationMode: previousAutonomyState?.orchestrationMode || 'single',
    parallelAgents: previousAutonomyState?.parallelAgents || 1,
    maxWorkerRetries: previousAutonomyState?.maxWorkerRetries || 1,
  });
  writeArtifact(
    'PULSE_AUTONOMY_STATE.json',
    JSON.stringify(autonomyState, null, 2),
    registry,
    identity,
  );
  const orchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: directivePayload,
    previousState: previousAgentOrchestrationState,
    parallelAgents: previousAgentOrchestrationState?.parallelAgents || 1,
    maxWorkerRetries: previousAgentOrchestrationState?.maxWorkerRetries || 1,
    plannerMode: previousAgentOrchestrationState?.plannerMode || 'deterministic',
  });
  writeArtifact(
    'PULSE_AUTONOMY_MEMORY.json',
    JSON.stringify(
      buildPulseAutonomyMemoryState({
        autonomyState,
        orchestrationState,
      }),
      null,
      2,
    ),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_AGENT_ORCHESTRATION_STATE.json',
    JSON.stringify(orchestrationState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_RUNTIME_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_RUNTIME_PROBES.json',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime.probes, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_BROWSER_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.browser, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_FLOW_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.flows, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_INVARIANT_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.invariants, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_OBSERVABILITY_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.observability, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_RECOVERY_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.recovery, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CUSTOMER_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.customer, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_OPERATOR_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.operator, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_ADMIN_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.admin, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_SOAK_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.soak, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_SCENARIO_COVERAGE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.syntheticCoverage, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_WORLD_STATE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.worldState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_EXECUTION_TRACE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.executionTrace, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CODEBASE_TRUTH.json',
    JSON.stringify(snapshot.codebaseTruth, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_RESOLVED_MANIFEST.json',
    JSON.stringify(snapshot.resolvedManifest, null, 2),
    registry,
    identity,
  );

  return {
    reportPath,
    certificatePath,
    cliDirectivePath,
    artifactIndexPath,
  };
}

function buildHealth(snapshot: PulseArtifactSnapshot): string {
  return JSON.stringify(snapshot.health, null, 2);
}
