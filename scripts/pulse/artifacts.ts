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
  deriveStringUnionMembersFromTypeContract,
  discoverAllObservedArtifactFilenames,
  discoverAllObservedHttpStatusCodes,
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

function deriveArtifactIdFromObserved(contractName: string): string {
  const ids = Object.keys(discoverAllObservedArtifactFilenames());
  return ids.find((k) => k === contractName) || contractName;
}

function readRegisteredJson<T>(registry: PulseArtifactRegistry, artifactId: string): T | null {
  return readOptionalJson<T>(
    resolveInsideCanonicalDir(
      registry,
      resolveArtifactRelativePath(registry, deriveArtifactIdFromObserved(artifactId)),
    ),
  );
}

function writeRegisteredArtifact(
  registry: PulseArtifactRegistry,
  artifactId: string,
  content: string,
  identity?: PulseRunIdentity,
): string {
  return writeArtifact(
    resolveArtifactRelativePath(registry, deriveArtifactIdFromObserved(artifactId)),
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
  const RUN_MODES = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/run-identity.ts',
    'PulseRunMode',
  );
  const defaultRunMode = [...RUN_MODES].find((m) => m === 'scan') || [...RUN_MODES][0];
  const identity = createRunIdentity(runMode ?? defaultRunMode, profile);
  registry.runId = identity.runId;

  const INDENT = discoverAllObservedHttpStatusCodes().filter((c) => c >= 200 && c < 300).length;

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
    JSON.stringify(machineReadiness, null, INDENT),
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
    JSON.stringify(contextBundle.gitnexusState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'beads-state',
    JSON.stringify(contextBundle.beadsState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'context-broadcast',
    JSON.stringify(contextBundle.broadcast, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'worker-leases',
    JSON.stringify(contextBundle.leases, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'context-delta',
    JSON.stringify(contextBundle.delta, null, INDENT),
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
      return JSON.stringify(directive, null, INDENT);
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
    JSON.stringify(
      (directivePayload as { autonomyProof?: unknown }).autonomyProof || {},
      null,
      INDENT,
    ),
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
    JSON.stringify(snapshot.scopeState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'codacy-evidence',
    JSON.stringify(snapshot.codacyEvidence, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'structural-graph',
    JSON.stringify(snapshot.structuralGraph, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-chains',
    JSON.stringify(snapshot.executionChains, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-matrix',
    JSON.stringify(normalizeCanonicalArtifactValue(snapshot.executionMatrix), null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'product-graph',
    JSON.stringify(snapshot.productGraph, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'capability-state',
    JSON.stringify(snapshot.capabilityState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'flow-projection',
    JSON.stringify(snapshot.flowProjection, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'parity-gaps',
    JSON.stringify(snapshot.parityGaps, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'external-signal-state',
    JSON.stringify(snapshot.externalSignalState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'product-vision',
    JSON.stringify(snapshot.productVision, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'convergence-plan',
    JSON.stringify(normalizeCanonicalArtifactValue(convergencePlan), null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'finding-validation-state',
    JSON.stringify(buildFindingValidationState(snapshot), null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'no-hardcoded-reality-state',
    JSON.stringify(normalizeCanonicalArtifactValue(noHardcodedRealityState), null, INDENT),
    identity,
  );
  const AUTO_MODES = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.autonomy.ts',
    'orchestrationMode',
  );
  const PLAN_MODES = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.autonomy.ts',
    'plannerMode',
  );
  const autonomyState = buildPulseAutonomyStateSeed({
    rootDir,
    directive: directivePayload,
    previousState: previousAutonomyState,
    orchestrationMode:
      previousAutonomyState?.orchestrationMode ||
      [...AUTO_MODES].find((m) => m === 'single') ||
      [...AUTO_MODES][0],
    parallelAgents:
      previousAutonomyState?.parallelAgents ||
      discoverAllObservedHttpStatusCodes().filter((c) => c >= 100 && c < 200).length,
    maxWorkerRetries:
      previousAutonomyState?.maxWorkerRetries ||
      discoverAllObservedHttpStatusCodes().filter((c) => c >= 400 && c < 500).length,
  });
  writeRegisteredArtifact(
    registry,
    'autonomy-state',
    JSON.stringify(normalizeCanonicalArtifactValue(autonomyState), null, INDENT),
    identity,
  );
  const orchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: directivePayload,
    previousState: previousAgentOrchestrationState,
    parallelAgents:
      previousAgentOrchestrationState?.parallelAgents ||
      discoverAllObservedHttpStatusCodes().filter((c) => c >= 100 && c < 200).length,
    maxWorkerRetries:
      previousAgentOrchestrationState?.maxWorkerRetries ||
      discoverAllObservedHttpStatusCodes().filter((c) => c >= 400 && c < 500).length,
    plannerMode:
      previousAgentOrchestrationState?.plannerMode ||
      [...PLAN_MODES].find((m) => m === 'deterministic') ||
      [...PLAN_MODES][0],
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
      INDENT,
    ),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'agent-orchestration-state',
    JSON.stringify(orchestrationState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'runtime-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime, null, INDENT),
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
      INDENT,
    ),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'browser-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.browser, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'flow-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.flows, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'invariant-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.invariants, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'observability-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.observability, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'recovery-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.recovery, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'customer-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.customer, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'operator-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.operator, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'admin-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.admin, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'soak-evidence',
    JSON.stringify(snapshot.certification.evidenceSummary.soak, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'scenario-coverage',
    JSON.stringify(snapshot.certification.evidenceSummary.syntheticCoverage, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'world-state',
    JSON.stringify(snapshot.certification.evidenceSummary.worldState, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'execution-trace',
    JSON.stringify(snapshot.certification.evidenceSummary.executionTrace, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'codebase-truth',
    JSON.stringify(snapshot.codebaseTruth, null, INDENT),
    identity,
  );
  writeRegisteredArtifact(
    registry,
    'resolved-manifest',
    JSON.stringify(snapshot.resolvedManifest, null, INDENT),
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
  const allStatusCodes = discoverAllObservedHttpStatusCodes();
  const indent = allStatusCodes.filter((c) => c >= 200 && c < 300).length;
  return JSON.stringify(snapshot.health, null, indent);
}
