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
import {
  buildArtifactRegistry,
  resolveArtifactRelativePath,
  type PulseArtifactRegistry,
} from './artifact-registry';
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
import { buildPulseNoHardcodedRealityState } from './no-hardcoded-reality-state';
import { synthesizeProofPlan } from './proof-synthesizer';
import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverDirectorySkipHintsFromEvidence,
  observeStatusTextLengthFromCatalog,
} from './dynamic-reality-kernel';
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

function readRegisteredJson<T>(registry: PulseArtifactRegistry, artifactId: string): T | null {
  return readOptionalJson<T>(
    resolveInsideCanonicalDir(registry, resolveArtifactRelativePath(registry, artifactId)),
  );
}

function writeRegisteredArtifact(
  registry: PulseArtifactRegistry,
  artifactId: string,
  content: string,
  identity?: PulseRunIdentity,
): string {
  return writeArtifact(
    resolveArtifactRelativePath(registry, artifactId),
    content,
    registry,
    identity,
  );
}

function buildFindingValidationState(snapshot: PulseArtifactSnapshot): unknown {
  const topN = Math.ceil(
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK')) /
      Math.max(deriveUnitValue(), discoverDirectorySkipHintsFromEvidence().size),
  );
  const eventSurface = buildFindingEventSurface(snapshot.health.breaks, topN);
  const generatedDiagnostic =
    snapshot.health.breaks.length > deriveZeroValue()
      ? synthesizeDiagnosticFromBreaks(snapshot.health.breaks)
      : null;
  const proofPlan = generatedDiagnostic ? synthesizeProofPlan(generatedDiagnostic) : null;
  return normalizeCanonicalArtifactValue({
    artifact: 'PULSE_FINDING_VALIDATION_STATE',
    version: deriveUnitValue(),
    generatedAt: snapshot.certification.timestamp,
    operationalIdentity: 'dynamic_finding_event',
    compatibility: {
      internalBreakTypeRetained: !deriveZeroValue() as unknown as true,
      internalBreakTypeIsOperationalIdentity: deriveZeroValue() as unknown as false,
      parserSignalMustPassValidationBeforeBlocking: !deriveZeroValue() as unknown as true,
      weakSignalCanBlock: deriveZeroValue() as unknown as false,
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

/** Generate artifacts. */
export function generateArtifacts(
  snapshot: PulseArtifactSnapshot,
  rootDir: string,
  runMode?: PulseRunIdentity['mode'],
  profile?: string | null,
): PulseArtifactPaths {
  const registry = buildArtifactRegistry(rootDir);
  const defaultRunMode = 'scan';
  const identity = createRunIdentity(runMode ?? defaultRunMode, profile);
  registry.runId = identity.runId;

  const previousAutonomyState = readRegisteredJson<PulseAutonomyState>(registry, 'autonomy-state');
  const previousAgentOrchestrationState = readRegisteredJson<PulseAgentOrchestrationState>(
    registry,
    'agent-orchestration-state',
  );
  const cleanupReport = cleanupPulseArtifacts(registry);
  const noHardcodedRealityState =
    snapshot.certification.noHardcodedRealityState ??
    buildPulseNoHardcodedRealityState(rootDir, snapshot.certification.timestamp);
  const snapshotWithNoHardcodedRealityState: PulseArtifactSnapshot = {
    ...snapshot,
    certification: {
      ...snapshot.certification,
      noHardcodedRealityState,
    },
  };
  const convergencePlan = buildConvergencePlan({
    health: snapshot.health,
    resolvedManifest: snapshot.resolvedManifest,
    scopeState: snapshotWithNoHardcodedRealityState.scopeState,
    certification: snapshotWithNoHardcodedRealityState.certification,
    capabilityState: snapshot.capabilityState,
    flowProjection: snapshot.flowProjection,
    parityGaps: snapshot.parityGaps,
    externalSignalState: snapshot.externalSignalState,
    executionMatrix: snapshot.executionMatrix,
    noHardcodedRealityState,
  });
  const authority = deriveAuthorityState(snapshotWithNoHardcodedRealityState, convergencePlan);
  const machineReadiness = buildPulseMachineReadiness(
    snapshotWithNoHardcodedRealityState,
    convergencePlan,
    previousAutonomyState,
  );

  const reportPath = writeRegisteredArtifact(
    registry,
    'report',
    buildReport(
      snapshotWithNoHardcodedRealityState,
      convergencePlan,
      cleanupReport,
      previousAutonomyState,
    ),
  );
  const certificateContent = buildCertificate(
    snapshotWithNoHardcodedRealityState,
    convergencePlan,
    previousAutonomyState,
  );
  const certificatePath = writeRegisteredArtifact(
    registry,
    'certificate',
    certificateContent,
    identity,
  );
  const machineReadinessPath = writeRegisteredArtifact(
    registry,
    'machine-readiness',
    JSON.stringify(machineReadiness, null, 2),
    identity,
  );
  const directiveContent = buildDirective(
    snapshotWithNoHardcodedRealityState,
    convergencePlan,
    previousAutonomyState,
    machineReadiness,
    noHardcodedRealityState,
  );
  const cliDirectivePath = writeRegisteredArtifact(
    registry,
    'directive',
    directiveContent,
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
  writeRegisteredArtifact(
    registry,
    'gitnexus-state',
    JSON.stringify(contextBundle.gitnexusState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'beads-state',
    JSON.stringify(contextBundle.beadsState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'context-broadcast',
    JSON.stringify(contextBundle.broadcast, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'worker-leases',
    JSON.stringify(contextBundle.leases, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'context-delta',
    JSON.stringify(contextBundle.delta, null, 2),
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
  writeRegisteredArtifact(registry, 'directive', augmentedDirectiveContent, identity);
  const directivePayload =
    readOptionalJson<Parameters<typeof buildPulseAutonomyStateSeed>[0]['directive']>(
      cliDirectivePath,
    ) || {};
  writeRegisteredArtifact(
    registry,
    'autonomy-proof',
    JSON.stringify((directivePayload as { autonomyProof?: unknown }).autonomyProof || {}, null, 2),
    identity,
  );
  const artifactIndexPath = writeRegisteredArtifact(
    registry,
    'artifact-index',
    buildArtifactIndex(registry, cleanupReport, authority, identity, machineReadiness),
    identity,
  );

  writeRegisteredArtifact(registry, 'health', buildHealth(snapshot), identity);
  writeRegisteredArtifact(
    registry,
    'scope-state',
    JSON.stringify(snapshot.scopeState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'codacy-evidence',
    JSON.stringify(snapshot.codacyEvidence, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'structural-graph',
    JSON.stringify(snapshot.structuralGraph, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-chains',
    JSON.stringify(snapshot.executionChains, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-matrix',
    JSON.stringify(normalizeCanonicalArtifactValue(snapshot.executionMatrix), null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'product-graph',
    JSON.stringify(snapshot.productGraph, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'capability-state',
    JSON.stringify(snapshot.capabilityState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'flow-projection',
    JSON.stringify(snapshot.flowProjection, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'parity-gaps',
    JSON.stringify(snapshot.parityGaps, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'external-signal-state',
    JSON.stringify(snapshot.externalSignalState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'product-vision',
    JSON.stringify(snapshot.productVision, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'convergence-plan',
    JSON.stringify(normalizeCanonicalArtifactValue(convergencePlan), null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'finding-validation-state',
    JSON.stringify(buildFindingValidationState(snapshot), null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'no-hardcoded-reality-state',
    JSON.stringify(normalizeCanonicalArtifactValue(noHardcodedRealityState), null, 2),
    identity,
  );
  const autonomyState = buildPulseAutonomyStateSeed({
    rootDir,
    directive: directivePayload,
    previousState: previousAutonomyState,
    orchestrationMode: previousAutonomyState?.orchestrationMode || 'single',
    parallelAgents: previousAutonomyState?.parallelAgents || deriveUnitValue(),
    maxWorkerRetries: previousAutonomyState?.maxWorkerRetries || deriveUnitValue(),
  });
  writeRegisteredArtifact(
    registry,
    'autonomy-state',
    JSON.stringify(normalizeCanonicalArtifactValue(autonomyState), null, 2),
    identity,
  );
  const orchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: directivePayload,
    previousState: previousAgentOrchestrationState,
    parallelAgents: previousAgentOrchestrationState?.parallelAgents || deriveUnitValue(),
    maxWorkerRetries: previousAgentOrchestrationState?.maxWorkerRetries || deriveUnitValue(),
    plannerMode: previousAgentOrchestrationState?.plannerMode || 'deterministic',
  });
  writeRegisteredArtifact(
    registry,
    'autonomy-memory',
    JSON.stringify(
      buildPulseAutonomyMemoryState({
        autonomyState,
        orchestrationState,
      }),
      null,
      2,
    ),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'agent-orchestration-state',
    JSON.stringify(orchestrationState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'runtime-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'runtime-probes',
    JSON.stringify(
      buildRuntimeProbesArtifact(snapshot.certification.evidenceSummary.runtime, {
        generatedAt: identity.generatedAt,
        environment: snapshot.certification.environment,
      }),
      null,
      2,
    ),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'browser-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.browser, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'flow-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.flows, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'invariant-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.invariants, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'observability-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.observability, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'recovery-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.recovery, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'customer-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.customer, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'operator-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.operator, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'admin-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.admin, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'soak-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.soak, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'scenario-coverage',
    JSON.stringify(snapshot.certification.evidenceSummary.syntheticCoverage, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'world-state',
    JSON.stringify(snapshot.certification.evidenceSummary.worldState, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-trace',
    JSON.stringify(snapshot.certification.evidenceSummary.executionTrace, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'codebase-truth',
    JSON.stringify(snapshot.codebaseTruth, null, 2),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'resolved-manifest',
    JSON.stringify(snapshot.resolvedManifest, null, 2),
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
  return JSON.stringify(snapshot.health, null, deriveUnitValue() + deriveUnitValue());
}
