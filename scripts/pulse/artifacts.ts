/**
 * Pulse artifact generation — thin orchestrator.
 * Heavy logic lives in artifacts.io, artifacts.queue, artifacts.report,
 * artifacts.autonomy, and artifacts.directive sub-modules.
 */
import * as path from 'path';
import {
  buildPulseAutonomyMemoryState,
  buildPulseAgentOrchestrationStateSeed,
  buildPulseAutonomyStateSeed,
} from './autonomy-loop';
import { buildArtifactRegistry, type PulseArtifactRegistry } from './artifact-registry';
import { cleanupPulseArtifacts } from './artifact-gc';
import { buildConvergencePlan } from './convergence-plan';
import { readOptionalJson, writeArtifact } from './artifacts.io';
import { buildReport, buildCertificate, buildPulseMachineReadiness } from './artifacts.report';
import { buildDirective, buildArtifactIndex } from './artifacts.directive';
import { normalizeCanonicalArtifactValue } from './artifacts.queue';
import { deriveAuthorityState } from './artifacts.autonomy';
import { buildRuntimeProbesArtifact } from './runtime-probes';
import { createRunIdentity, type PulseRunIdentity } from './run-identity';
import { buildFindingEventSurface } from './finding-event-surface';
import { synthesizeDiagnosticFromBreaks } from './legacy-break-adapter';
import { auditPulseNoHardcodedReality } from './no-hardcoded-reality-audit';
import { synthesizeProofPlan } from './proof-synthesizer';
import {
  buildDirectiveContextFabricPatch,
  buildPulseContextFabricBundle,
} from './context-broadcast';
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyState,
  PulseCapabilityState,
  PulseCertification,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseConvergencePlan,
  PulseExecutionChainSet,
  PulseExecutionMatrix,
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
  /** Execution matrix property. */
  executionMatrix: PulseExecutionMatrix;
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
  /** Canonical machine-readiness path property. */
  machineReadinessPath: string;
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
  const root = path.resolve(registry.canonicalDir);
  const resolved = path.resolve(root, fileName);
  const boundary = root + path.sep;
  if (resolved !== root && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${root}`);
  }
  return resolved;
}

function buildFindingValidationState(snapshot: PulseArtifactSnapshot): unknown {
  const eventSurface = buildFindingEventSurface(snapshot.health.breaks, 20);
  const generatedDiagnostic =
    snapshot.health.breaks.length > 0
      ? synthesizeDiagnosticFromBreaks(snapshot.health.breaks)
      : null;
  const proofPlan = generatedDiagnostic ? synthesizeProofPlan(generatedDiagnostic) : null;
  return normalizeCanonicalArtifactValue({
    artifact: 'PULSE_FINDING_VALIDATION_STATE',
    version: 1,
    generatedAt: snapshot.certification.timestamp,
    operationalIdentity: 'dynamic_finding_event',
    compatibility: {
      internalBreakTypeRetained: true,
      internalBreakTypeIsOperationalIdentity: false,
      parserSignalMustPassValidationBeforeBlocking: true,
      weakSignalCanBlock: false,
    },
    eventSurface,
    generatedDiagnostic,
    proofPlan,
    blockerPolicy: {
      weak_signal: 'needs_probe_only',
      inferred: 'needs_context_or_probe',
      confirmed_static: 'can_block_when_actionable',
      observed: 'can_block_when_actionable',
    },
  });
}

function buildNoHardcodedRealityState(rootDir: string, generatedAt: string): unknown {
  const audit = auditPulseNoHardcodedReality(rootDir);
  const hardcodeEvents = audit.findings.slice(0, 100).map((finding) => {
    const samples = finding.samples.join(', ');
    return {
      eventName: `Hardcoded reality candidate at ${finding.filePath}:${finding.line}`,
      evidence: `${finding.context}${samples ? ` -> ${samples}` : ''}`,
      filePath: finding.filePath,
      line: finding.line,
      column: finding.column,
      samples: finding.samples,
      truthMode: 'confirmed_static',
      actionability: 'replace_with_dynamic_discovery',
    };
  });

  return normalizeCanonicalArtifactValue({
    artifact: 'PULSE_NO_HARDCODED_REALITY',
    version: 1,
    generatedAt,
    operationalIdentity: 'dynamic_hardcode_evidence_event',
    scannedFiles: audit.scannedFiles,
    totalEvents: audit.findings.length,
    hardcodeEvents,
    policy: {
      fixedClassifierIsOperationalTruth: false,
      regexCanDetectButCannotDecide: true,
      parserCanObserveButCannotCondemn: true,
      diagnosticMustBeGeneratedFromEvidence: true,
    },
  });
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
    executionMatrix: snapshot.executionMatrix,
  });
  const authority = deriveAuthorityState(snapshot, convergencePlan);
  const machineReadiness = buildPulseMachineReadiness(
    snapshot,
    convergencePlan,
    previousAutonomyState,
  );

  const reportPath = writeArtifact(
    'PULSE_REPORT.md',
    buildReport(snapshot, convergencePlan, cleanupReport, previousAutonomyState),
    registry,
  );
  const certificateContent = buildCertificate(snapshot, convergencePlan, previousAutonomyState);
  const certificatePath = writeArtifact(
    'PULSE_CERTIFICATE.json',
    certificateContent,
    registry,
    identity,
  );
  const machineReadinessPath = writeArtifact(
    'PULSE_MACHINE_READINESS.json',
    JSON.stringify(machineReadiness, null, 2),
    registry,
    identity,
  );
  const directiveContent = buildDirective(
    snapshot,
    convergencePlan,
    previousAutonomyState,
    machineReadiness,
  );
  const cliDirectivePath = writeArtifact(
    'PULSE_CLI_DIRECTIVE.json',
    directiveContent,
    registry,
    identity,
  );
  const contextBundle = buildPulseContextFabricBundle({
    rootDir,
    registry,
    convergencePlan,
    runId: identity.runId,
    directiveContent,
    certificateContent,
  });
  writeArtifact(
    'PULSE_GITNEXUS_STATE.json',
    JSON.stringify(contextBundle.gitnexusState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_BEADS_STATE.json',
    JSON.stringify(contextBundle.beadsState, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CONTEXT_BROADCAST.json',
    JSON.stringify(contextBundle.broadcast, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_WORKER_LEASES.json',
    JSON.stringify(contextBundle.leases, null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_CONTEXT_DELTA.json',
    JSON.stringify(contextBundle.delta, null, 2),
    registry,
    identity,
  );
  const augmentedDirectiveContent = (() => {
    try {
      const directive = JSON.parse(directiveContent) as Record<string, unknown>;
      const byUnitId = new Map(
        contextBundle.broadcast.workers.map((worker) => [worker.unitId, worker]),
      );
      const augmentUnits = (value: unknown): unknown => {
        if (!Array.isArray(value)) {
          return value;
        }
        return value.map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return entry;
          }
          const unit = entry as Record<string, unknown>;
          const unitId = typeof unit.id === 'string' ? unit.id : null;
          const worker = unitId ? byUnitId.get(unitId) : null;
          if (!worker) {
            return unit;
          }
          return {
            ...unit,
            leaseId: worker.leaseId,
            leaseStatus: worker.leaseStatus,
            leaseExpiresAt: worker.leaseExpiresAt,
            contextDigest: worker.contextDigest,
            ownedFiles: worker.ownedFiles,
            readOnlyFiles: worker.readOnlyFiles,
            forbiddenFiles: worker.forbiddenFiles,
            validationContract: worker.validationContract,
            stopConditions: worker.stopConditions,
          };
        });
      };
      directive.nextAutonomousUnits = augmentUnits(directive.nextAutonomousUnits);
      directive.nextExecutableUnits = augmentUnits(directive.nextExecutableUnits);
      directive.nextWork = augmentUnits(directive.nextWork);
      directive.contextFabric = buildDirectiveContextFabricPatch(contextBundle);
      return JSON.stringify(directive, null, 2);
    } catch {
      return directiveContent;
    }
  })();
  writeArtifact('PULSE_CLI_DIRECTIVE.json', augmentedDirectiveContent, registry, identity);
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
    buildArtifactIndex(registry, cleanupReport, authority, identity, machineReadiness),
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
    'PULSE_EXECUTION_MATRIX.json',
    JSON.stringify(normalizeCanonicalArtifactValue(snapshot.executionMatrix), null, 2),
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
    JSON.stringify(normalizeCanonicalArtifactValue(convergencePlan), null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_FINDING_VALIDATION_STATE.json',
    JSON.stringify(buildFindingValidationState(snapshot), null, 2),
    registry,
    identity,
  );
  writeArtifact(
    'PULSE_NO_HARDCODED_REALITY.json',
    JSON.stringify(
      buildNoHardcodedRealityState(rootDir, snapshot.certification.timestamp),
      null,
      2,
    ),
    registry,
    identity,
  );
  const autonomyState = buildPulseAutonomyStateSeed({
    rootDir,
    directive: directivePayload,
    previousState: previousAutonomyState,
    orchestrationMode: previousAutonomyState?.orchestrationMode || 'single',
    parallelAgents: previousAutonomyState?.parallelAgents || 1,
    maxWorkerRetries: previousAutonomyState?.maxWorkerRetries || 1,
  });
  writeArtifact(
    'PULSE_AUTONOMY_STATE.json',
    JSON.stringify(normalizeCanonicalArtifactValue(autonomyState), null, 2),
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
    JSON.stringify(
      buildRuntimeProbesArtifact(snapshot.certification.evidenceSummary.runtime, {
        generatedAt: identity.generatedAt,
        environment: snapshot.certification.environment,
      }),
      null,
      2,
    ),
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
    machineReadinessPath,
    cliDirectivePath,
    artifactIndexPath,
  };
}

function buildHealth(snapshot: PulseArtifactSnapshot): string {
  return JSON.stringify(snapshot.health, null, 2);
}
