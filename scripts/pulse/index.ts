#!/usr/bin/env ts-node
/**
 * PULSE — Live Codebase Nervous System
 *
 * Maps the complete structure of a full-stack web application and finds
 * every disconnection between layers: UI → API → Backend → Database
 *
 * Usage:
 *   npx ts-node scripts/pulse/index.ts              # SCAN mode (static analysis, <5s)
 *   npx ts-node scripts/pulse/index.ts --deep       # DEEP mode (SCAN + runtime tests against Railway)
 *   npx ts-node scripts/pulse/index.ts --total      # TOTAL mode (DEEP + chaos/edge cases)
 *   npx ts-node scripts/pulse/index.ts --watch       # Daemon mode (live)
 *   npx ts-node scripts/pulse/index.ts --report      # Generate PULSE_REPORT.md
 *   npx ts-node scripts/pulse/index.ts --json        # JSON output
 *   npx ts-node scripts/pulse/index.ts --guidance    # Print dynamic CLI directive JSON
 *   npx ts-node scripts/pulse/index.ts --prove       # Print autonomy proof verdict JSON
 *   npx ts-node scripts/pulse/index.ts --vision      # Print dynamic product vision JSON
 *   npx ts-node scripts/pulse/index.ts --autonomous  # Run the autonomous Pulse -> Codex loop
 *   npx ts-node scripts/pulse/index.ts --autonomous --parallel-agents 3  # Run manager + workers
 *   npx ts-node scripts/pulse/index.ts --autonomous --risk-profile dangerous  # Expand ai_safe blast radius
 *   npx ts-node scripts/pulse/index.ts --verbose     # Show all breaks (including low severity)
 *   npx ts-node scripts/pulse/index.ts --fmap        # Generate FUNCTIONAL_MAP.md (page-by-page interaction trace)
 *   npx ts-node scripts/pulse/index.ts --customer    # Run customer synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --operator    # Run operator synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --admin       # Run admin synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --shift       # Run shift-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --soak        # Run soak-time synthetic scenarios (implies TOTAL mode)
 *   npx ts-node scripts/pulse/index.ts --certify --tier 0  # Certify tier 0 hard gates
 *   npx ts-node scripts/pulse/index.ts --certify --final   # Run final certification target
 */

import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { computeCertification } from './certification';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildExecutionMatrix } from './execution-matrix';
import { buildCapabilityState } from './capability-model';
import { buildFlowProjection } from './flow-projection';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision';
import { buildProductModel } from './product-model';
import { buildExternalSignalState, createExternalSignalProfileState } from './external-signals';
import { runExternalSourcesOrchestrator } from './adapters/external-sources-orchestrator';
import { runPulseAutonomousLoop } from './autonomy-loop';
import {
  buildFailedRuntimeProbe,
  buildTimedOutActorEvidence,
  buildTimedOutFlowEvidence,
  buildTimedOutInvariantEvidence,
  buildTimedOutRuntimeProbe,
  buildTimedOutWorldState,
} from './timeout-evidence';
import { PulseExecutionTracer, runPhaseWithTrace } from './execution-trace';
import { runSelfTrustChecks } from './self-trust';
import { runCrossArtifactConsistencyCheck } from './cross-artifact-consistency-check';
import { runDeclaredFlows } from './flows';
import { runDeclaredInvariants } from './invariants';
import { loadParserInventory } from './parser-registry';
import { loadPulseLocalEnv } from './local-env';
import { runSyntheticActors } from './actors';
import { getProfileSelection } from './profiles';
import type {
  PulseFlowEvidence,
  PulseInvariantEvidence,
  PulseRuntimeProbe,
  PulseWorldState,
} from './types';
import {
  collectObservabilityEvidence,
  collectRecoveryEvidence,
  collectRuntimeProbe,
  getRuntimeProbeIds,
  summarizeRuntimeEvidence,
} from './runtime-evidence';
import { getRuntimeResolution } from './parsers/runtime-utils';
import { readOptionalJson } from './artifacts.io';
import type { PulseDirectiveSnapshot, PulseCertificateSnapshot } from './cert-gate-overclaim';
import type { PulseAutonomyStateSnapshot } from './cert-gate-multi-cycle';

import {
  activateRuntimeParserEnv,
  actorModeRequested,
  deriveBrowserEvidenceFromActors,
  deriveEffectiveEnvironment,
  deriveEffectiveTarget,
  flags,
  queryModeRequested,
  requestedSyntheticModes,
} from './index-cli';
import { buildBrowserEvidenceForIndex } from './index-browser-evidence';
import { printPulseStartupSummary } from './index-preamble';
import { handlePulseOutput } from './index-output';

activateRuntimeParserEnv();

function deriveFullScanTimeoutMs(
  config: ReturnType<typeof detectConfig>,
  includeParser: ((name: string) => boolean) | undefined,
  parserTimeoutMs: number | undefined,
  phaseTimeoutMs: number | undefined,
): number | undefined {
  if (!parserTimeoutMs || parserTimeoutMs <= 0) {
    return phaseTimeoutMs;
  }
  const parserInventory = loadParserInventory(config, { includeParser });
  const parserBudgetMs = parserInventory.loadedChecks.length * parserTimeoutMs;
  const baseScanOverheadMs = 120_000;
  const unavailableBudgetMs = parserInventory.unavailableChecks.length * 250;
  const dynamicBudgetMs = parserBudgetMs + baseScanOverheadMs + unavailableBudgetMs;
  return Math.max(phaseTimeoutMs ?? 0, dynamicBudgetMs);
}

async function main() {
  const loadedEnvFiles = loadPulseLocalEnv(process.cwd());
  const gitnexusMode = process.argv.includes('gitnexus');
  if (gitnexusMode) {
    const { gitnexusCli } = await import('./gitnexus/cli');
    await gitnexusCli(process.argv.slice(process.argv.indexOf('gitnexus') + 1));
    return;
  }

  if (flags.autonomous) {
    const autonomyState = await runPulseAutonomousLoop(process.cwd(), {
      dryRun: flags.dryRun,
      continuous: flags.continuous,
      maxIterations: flags.maxIterations,
      intervalMs: flags.intervalMs,
      parallelAgents: flags.parallelAgents,
      maxWorkerRetries: flags.maxWorkerRetries,
      riskProfile:
        flags.riskProfile === 'safe' ||
        flags.riskProfile === 'balanced' ||
        flags.riskProfile === 'dangerous'
          ? flags.riskProfile
          : null,
      plannerModel: flags.plannerModel,
      codexModel: flags.codexModel,
      disableAgentPlanner: flags.disableAgentPlanner,
      executor: flags.executor,
    });
    console.log(JSON.stringify(autonomyState, null, 2));
    process.exit(autonomyState.status === 'failed' ? 1 : 0);
  }
  const bootstrapProfileSelection = flags.profile ? getProfileSelection(flags.profile, null) : null;
  let profileSelection = bootstrapProfileSelection;
  const effectiveTarget = deriveEffectiveTarget();
  const effectiveEnvironment = deriveEffectiveEnvironment();
  const humanReadableOutput = !flags.json && !flags.guidance && !flags.prove && !flags.vision;
  let effectiveRequestedSyntheticModes = [
    ...new Set([...requestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
  ];
  let effectiveActorModeRequested = effectiveRequestedSyntheticModes.length > 0;
  const tracer = new PulseExecutionTracer(process.cwd(), effectiveTarget, effectiveEnvironment);

  const config = detectConfig(process.cwd());
  config.certificationProfile = flags.profile;
  const fullScanTimeoutMs = deriveFullScanTimeoutMs(
    config,
    bootstrapProfileSelection?.includeParser,
    bootstrapProfileSelection?.parserTimeoutMs,
    bootstrapProfileSelection?.phaseTimeoutMs,
  );
  const mode = effectiveEnvironment.toUpperCase();
  printPulseStartupSummary({
    humanReadableOutput,
    config,
    mode,
    modeHasRuntimeParsers: mode !== 'SCAN',
    target: effectiveTarget,
    showTarget: Boolean(flags.final || flags.tier !== null || flags.profile),
    actorModes: effectiveRequestedSyntheticModes,
    loadedEnvFiles,
  });

  // 2. Full scan
  const startTime = Date.now();
  let scanResult = await runPhaseWithTrace(
    tracer,
    'full-scan',
    () =>
      fullScan(config, {
        includeParser: bootstrapProfileSelection?.includeParser,
        parserTimeoutMs: bootstrapProfileSelection?.parserTimeoutMs,
        tracer,
      }),
    {
      timeoutMs: fullScanTimeoutMs,
      metadata: {
        profile: flags.profile || 'none',
        environment: effectiveEnvironment,
        parserTimeoutMs: bootstrapProfileSelection?.parserTimeoutMs ?? 0,
        dynamicTimeoutMs: fullScanTimeoutMs ?? 0,
      },
    },
  );
  const { health, coreData } = scanResult;
  profileSelection = flags.profile ? getProfileSelection(flags.profile, scanResult.manifest) : null;
  effectiveRequestedSyntheticModes = [
    ...new Set([...requestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
  ];
  effectiveActorModeRequested = effectiveRequestedSyntheticModes.length > 0;
  let certification = scanResult.certification;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (humanReadableOutput) {
    console.log(`  Done in ${elapsed}s`);
  }
  tracer.setContext(effectiveTarget, effectiveEnvironment);

  const runtimeProbeIds = getRuntimeProbeIds(profileSelection?.runtimeProbeIds);
  tracer.startPhase('runtime-evidence', {
    probeCount: runtimeProbeIds.length,
  });
  const runtimeProbes: PulseRuntimeProbe[] = [];
  for (const probeId of runtimeProbeIds) {
    try {
      const probe = await runPhaseWithTrace(
        tracer,
        `runtime:${probeId}`,
        () =>
          collectRuntimeProbe(effectiveEnvironment, probeId, {
            requireDbConnectivity: profileSelection ? true : undefined,
          }),
        {
          timeoutMs: 12_000,
          metadata: {
            probeId,
          },
          onTimeout: () => buildTimedOutRuntimeProbe(probeId),
        },
      );
      runtimeProbes.push(probe);
    } catch (error) {
      runtimeProbes.push(buildFailedRuntimeProbe(probeId, error));
    }
  }
  const runtimeEvidence = summarizeRuntimeEvidence(effectiveEnvironment, runtimeProbes);
  tracer.finishPhase('runtime-evidence', 'passed', {
    metadata: {
      executedChecks: runtimeEvidence.executedChecks.length,
      missingEvidence: runtimeEvidence.probes.filter((probe) => probe.status === 'missing_evidence')
        .length,
      failedProbes: runtimeEvidence.probes.filter((probe) => probe.status === 'failed').length,
    },
  });
  const observabilityEvidence = await runPhaseWithTrace(
    tracer,
    'observability-evidence',
    () => collectObservabilityEvidence(config.rootDir, runtimeEvidence),
    { timeoutMs: 10_000 },
  );
  const recoveryEvidence = await runPhaseWithTrace(
    tracer,
    'recovery-evidence',
    () => collectRecoveryEvidence(config.rootDir),
    { timeoutMs: 10_000 },
  );
  let browserEvidence = await buildBrowserEvidenceForIndex({
    tracer,
    flags,
    humanReadableOutput,
    effectiveEnvironment,
    profileSelection,
    runtimeEvidence,
    certification,
  });

  const flowEnvironment = effectiveActorModeRequested ? 'total' : effectiveEnvironment;

  const flowEvidence = await runPhaseWithTrace(
    tracer,
    'declared-flows',
    () =>
      runDeclaredFlows({
        environment: flowEnvironment,
        manifest: scanResult.manifest,
        health: scanResult.health,
        parserInventory: scanResult.parserInventory,
        flowIds: profileSelection?.flowIds,
        enforceDiagnosticPreconditions: profileSelection?.profile !== 'core-critical',
      }),
    {
      timeoutMs: 90_000,
      metadata: {
        flowCount: profileSelection?.flowIds.length || 0,
        environment: flowEnvironment,
      },
      onTimeout: () => buildTimedOutFlowEvidence(profileSelection?.flowIds || []),
    },
  );

  const invariantEvidence = await runPhaseWithTrace(
    tracer,
    'declared-invariants',
    () =>
      Promise.resolve(
        runDeclaredInvariants({
          environment: effectiveEnvironment,
          manifest: scanResult.manifest,
          health: scanResult.health,
          parserInventory: scanResult.parserInventory,
          invariantIds: profileSelection?.invariantIds,
          enforceDiagnosticDependencies: profileSelection?.profile !== 'core-critical',
        }),
      ),
    {
      timeoutMs: 30_000,
      metadata: {
        invariantCount: profileSelection?.invariantIds.length || 0,
      },
      onTimeout: () => buildTimedOutInvariantEvidence(profileSelection?.invariantIds || []),
    },
  );

  const syntheticEvidence = await runPhaseWithTrace(
    tracer,
    'synthetic-actors',
    () =>
      Promise.resolve(
        runSyntheticActors({
          rootDir: config.rootDir,
          environment: effectiveEnvironment,
          manifest: scanResult.manifest,
          resolvedManifest: scanResult.resolvedManifest,
          codebaseTruth: scanResult.codebaseTruth,
          runtimeEvidence,
          browserEvidence,
          flowEvidence,
          requestedModes: effectiveRequestedSyntheticModes,
          scenarioIds: profileSelection?.scenarioIds,
        }),
      ),
    {
      timeoutMs: 10 * 60 * 1000,
      metadata: {
        requestedModes: effectiveRequestedSyntheticModes.join(','),
        scenarioCount: profileSelection?.scenarioIds.length || 0,
      },
      onTimeout: () => {
        const requestedScenarioIds = profileSelection?.scenarioIds || [];
        const customerScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('customer-'));
        const operatorScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('operator-'));
        const adminScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('admin-'));
        const soakScenarioIds = requestedScenarioIds.filter(
          (id) => id.startsWith('system-') || id.startsWith('soak-'),
        );
        return {
          customer: buildTimedOutActorEvidence('customer', customerScenarioIds),
          operator: buildTimedOutActorEvidence('operator', operatorScenarioIds),
          admin: buildTimedOutActorEvidence('admin', adminScenarioIds),
          soak: buildTimedOutActorEvidence('soak', soakScenarioIds),
          syntheticCoverage: {
            executed: false,
            artifactPaths: ['PULSE_SCENARIO_COVERAGE.json'],
            summary: 'Synthetic coverage timed out before scenario execution completed.',
            totalPages: 0,
            userFacingPages: 0,
            coveredPages: 0,
            uncoveredPages: [],
            results: [],
          },
          worldState: buildTimedOutWorldState(
            runtimeEvidence.backendUrl,
            runtimeEvidence.frontendUrl,
            requestedScenarioIds,
          ),
        };
      },
    },
  );

  browserEvidence = deriveBrowserEvidenceFromActors(
    effectiveActorModeRequested,
    browserEvidence,
    syntheticEvidence,
  );

  const finalExecutionEvidencePayload = {
    ...certification.evidenceSummary,
    runtime: runtimeEvidence,
    browser: browserEvidence,
    flows: flowEvidence,
    invariants: invariantEvidence,
    observability: observabilityEvidence,
    recovery: recoveryEvidence,
    customer: syntheticEvidence.customer,
    operator: syntheticEvidence.operator,
    admin: syntheticEvidence.admin,
    soak: syntheticEvidence.soak,
    syntheticCoverage: syntheticEvidence.syntheticCoverage,
    worldState: syntheticEvidence.worldState,
    executionTrace: tracer.getSnapshot(),
  };
  const derivedStructuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: scanResult.coreData,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedCapabilityState = buildCapabilityState({
    structuralGraph: derivedStructuralGraph,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedFlowProjection = buildFlowProjection({
    structuralGraph: derivedStructuralGraph,
    capabilityState: derivedCapabilityState,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedExternalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState: derivedCapabilityState,
    flowProjection: derivedFlowProjection,
    liveExternalState: createExternalSignalProfileState(
      effectiveTarget.profile,
      effectiveTarget.certificationScope,
    ),
  });
  const derivedExecutionChains = buildExecutionChains({
    structuralGraph: derivedStructuralGraph,
  });
  const derivedExecutionMatrix = buildExecutionMatrix({
    structuralGraph: derivedStructuralGraph,
    scopeState: scanResult.scopeState,
    executionChains: derivedExecutionChains,
    capabilityState: derivedCapabilityState,
    flowProjection: derivedFlowProjection,
    executionEvidence: finalExecutionEvidencePayload,
    externalSignalState: derivedExternalSignalState,
  });

  // TODO(pulse-pipeline): Restructure to generate non-cert artifacts (external-signal-state,
  // convergence-plan, product-vision, autonomy-*) before self-trust runs, eliminating the
  // need for the empty-object override workaround below. Two-phase artifact generation would
  // also allow the post-write cross-artifact check to move into the cert flow directly.

  // Self-trust cross-artifact consistency override map.
  // ALL 9 DEFAULT_ARTIFACT_PATHS must be present to prevent stale disk reads
  // from the previous run. Artifacts without fresh in-memory data at this
  // pipeline stage use empty objects ({}), which contribute no fields and
  // cause no false divergences.
  //
  // Fresh in-memory data:
  //   .pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json  — derivedExternalSignalState
  //   PULSE_CERTIFICATE.json                           — scanResult.certification
  //
  // Empty objects (not yet generated at this stage; stale disk reads avoided):
  //   PULSE_CLI_DIRECTIVE.json
  //   PULSE_ARTIFACT_INDEX.json
  //   .pulse/current/PULSE_AUTONOMY_PROOF.json
  //   .pulse/current/PULSE_AUTONOMY_STATE.json
  //   .pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json
  //   .pulse/current/PULSE_CONVERGENCE_PLAN.json
  //   .pulse/current/PULSE_PRODUCT_VISION.json
  //
  // Full cross-artifact verification with all 9 fresh artifacts on disk
  // happens post-write (see handlePulseOutput call below, line ~598).
  const artifactsOverride: Record<string, Record<string, unknown>> = {
    'PULSE_CERTIFICATE.json': scanResult.certification as unknown as Record<string, unknown>,
    'PULSE_CLI_DIRECTIVE.json': {},
    'PULSE_ARTIFACT_INDEX.json': {},
    '.pulse/current/PULSE_AUTONOMY_PROOF.json': {},
    '.pulse/current/PULSE_AUTONOMY_STATE.json': {},
    '.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json': {},
    '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json':
      derivedExternalSignalState as unknown as Record<string, unknown>,
    '.pulse/current/PULSE_CONVERGENCE_PLAN.json': {},
    '.pulse/current/PULSE_PRODUCT_VISION.json': {},
  };

  const selfTrustReport = await runPhaseWithTrace(
    tracer,
    'self-trust-verification',
    () =>
      Promise.resolve(
        runSelfTrustChecks({
          manifestPath: scanResult.manifestResult.manifestPath,
          parsersDir: `${config.rootDir}/scripts/pulse/parsers`,
          evidenceFile: `${config.rootDir}/PULSE_ARTIFACT_INDEX.json`,
          repoRoot: config.rootDir,
          breaks: scanResult.health.breaks,
          artifactsOverride,
        }),
      ),
    { timeoutMs: 5_000 },
  );

  const previousDirective = readOptionalJson<PulseDirectiveSnapshot>(
    `${config.rootDir}/PULSE_CLI_DIRECTIVE.json`,
  );
  const previousCertificate = readOptionalJson<{ status?: string; rawContent?: string }>(
    `${config.rootDir}/PULSE_CERTIFICATE.json`,
  );
  const previousCertificateSnapshot: PulseCertificateSnapshot | null = previousCertificate
    ? { status: previousCertificate.status }
    : null;
  const autonomyStateSnapshot =
    readOptionalJson<PulseAutonomyStateSnapshot>(
      `${config.rootDir}/.pulse/current/PULSE_AUTONOMY_STATE.json`,
    ) ?? null;

  certification = await runPhaseWithTrace(
    tracer,
    'final-certification',
    () =>
      Promise.resolve(
        computeCertification({
          rootDir: config.rootDir,
          manifestResult: scanResult.manifestResult,
          parserInventory: scanResult.parserInventory,
          health: scanResult.health,
          codebaseTruth: scanResult.codebaseTruth,
          resolvedManifest: scanResult.resolvedManifest,
          scopeState: scanResult.scopeState,
          codacyEvidence: scanResult.codacyEvidence,
          structuralGraph: derivedStructuralGraph,
          capabilityState: derivedCapabilityState,
          flowProjection: derivedFlowProjection,
          externalSignalState: derivedExternalSignalState,
          executionMatrix: derivedExecutionMatrix,
          certificationTarget: effectiveTarget,
          executionEvidence: finalExecutionEvidencePayload,
          previousDirective,
          previousCertificate: previousCertificateSnapshot,
          autonomyState: autonomyStateSnapshot,
          selfTrustReport,
        }),
      ),
    { timeoutMs: 15_000 },
  );
  certification = {
    ...certification,
    evidenceSummary: {
      ...certification.evidenceSummary,
      runtime: runtimeEvidence,
      browser: browserEvidence,
      flows: flowEvidence,
      invariants: invariantEvidence,
      observability: observabilityEvidence,
      recovery: recoveryEvidence,
      customer: syntheticEvidence.customer,
      operator: syntheticEvidence.operator,
      admin: syntheticEvidence.admin,
      soak: syntheticEvidence.soak,
      syntheticCoverage: syntheticEvidence.syntheticCoverage,
      worldState: syntheticEvidence.worldState,
      executionTrace: tracer.getSnapshot(),
    },
    selfTrustReport,
  };

  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: scanResult.coreData,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: certification.evidenceSummary,
  });
  const executionChains = buildExecutionChains({
    structuralGraph,
  });
  const productGraph = buildProductModel({
    structuralGraph,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
  });
  const capabilityState = buildCapabilityState({
    structuralGraph,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: certification.evidenceSummary,
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    executionEvidence: certification.evidenceSummary,
  });

  // Run external sources orchestration in parallel
  const externalSourcesTask = runExternalSourcesOrchestrator({
    rootDir: config.rootDir,
    github: {
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      token: process.env.GITHUB_TOKEN,
    },
    sentry: {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    },
    datadog: {
      apiKey: process.env.DATADOG_API_KEY,
      appKey: process.env.DATADOG_APP_KEY,
      site: process.env.DATADOG_SITE,
    },
    prometheus: {
      baseUrl: process.env.PROMETHEUS_BASE_URL || process.env.PULSE_PROMETHEUS_URL,
      bearerToken: process.env.PROMETHEUS_BEARER_TOKEN || process.env.PULSE_PROMETHEUS_TOKEN,
      query: process.env.PROMETHEUS_QUERY,
    },
    codecov: {
      token: process.env.CODECOV_TOKEN,
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    dependabot: {
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    profile: effectiveTarget.profile || undefined,
    certificationScope: effectiveTarget.certificationScope || effectiveTarget.profile || undefined,
  }).catch(() => null);

  const liveExternalState = await runPhaseWithTrace(
    tracer,
    'external-sources-orchestration',
    () => externalSourcesTask,
    {
      timeoutMs: 15_000,
      onTimeout: () => null,
    },
  );
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState,
    flowProjection,
    liveExternalState,
  });
  const executionMatrix = buildExecutionMatrix({
    structuralGraph,
    scopeState: scanResult.scopeState,
    executionChains,
    capabilityState,
    flowProjection,
    executionEvidence: certification.evidenceSummary,
    externalSignalState,
  });
  certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult: scanResult.manifestResult,
    parserInventory: scanResult.parserInventory,
    health: scanResult.health,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
    executionMatrix,
    certificationTarget: effectiveTarget,
    executionEvidence: finalExecutionEvidencePayload,
    previousDirective,
    previousCertificate: previousCertificateSnapshot,
    autonomyState: autonomyStateSnapshot,
    selfTrustReport,
  });
  certification = {
    ...certification,
    selfTrustReport,
  };
  const parityGaps = buildParityGaps({
    codebaseTruth: scanResult.codebaseTruth,
    capabilityState,
    flowProjection,
    certification,
    resolvedManifest: scanResult.resolvedManifest,
    health: scanResult.health,
  });
  const productVision = buildProductVision({
    capabilityState,
    flowProjection,
    certification,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    parityGaps,
    externalSignalState,
  });

  scanResult = {
    ...scanResult,
    structuralGraph,
    executionChains,
    executionMatrix,
    productGraph,
    capabilityState,
    flowProjection,
    parityGaps,
    externalSignalState,
    productVision,
    certification,
  };

  handlePulseOutput({
    flags,
    scanResult,
    health,
    certification,
    config,
    coreData,
    selfTrustReport,
  });

  const postWriteConsistency = runCrossArtifactConsistencyCheck(config.rootDir);
  if (!postWriteConsistency.pass) {
    console.error('\n⚠️  Post-write cross-artifact consistency check FAILED:');
    for (const d of postWriteConsistency.divergences) {
      console.error(`  - ${d.field}: ${d.sources.length} artifacts disagree`);
    }
  } else {
    console.log('\n✅ Post-write cross-artifact consistency: PASS');
  }

  // 5. Watch mode
  if (flags.watch) {
    await startDaemon(config);
  } else {
    if (queryModeRequested) {
      process.exit(0);
    }

    if (flags.certify) {
      process.exit(certification.status === 'CERTIFIED' ? 0 : 1);
    }

    const criticalBreaks = health.breaks.filter((b) => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error('PULSE error:', e.message || e);
  process.exit(2);
});
