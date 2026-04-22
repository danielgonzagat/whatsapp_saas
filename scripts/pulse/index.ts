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
 *   npx ts-node scripts/pulse/index.ts --vision      # Print dynamic product vision JSON
 *   npx ts-node scripts/pulse/index.ts --autonomous  # Run the autonomous Pulse -> Codex loop
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

import * as fs from 'fs';
import { detectConfig } from './config';
import { fullScan, startDaemon } from './daemon';
import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts';
import { computeCertification } from './certification';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildCapabilityState } from './capability-model';
import { buildFlowProjection } from './flow-projection';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision';
import { buildProductModel } from './product-model';
import { buildExternalSignalState } from './external-signals';
import { runPulseAutonomousLoop } from './autonomy-loop';
import {
  buildFailedRuntimeProbe,
  buildTimedOutActorEvidence,
  buildTimedOutFlowEvidence,
  buildTimedOutInvariantEvidence,
  buildTimedOutRuntimeProbe,
  buildTimedOutWorldState,
} from './timeout-evidence';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { PulseExecutionTracer, runPhaseWithTrace } from './execution-trace';
import { runDeclaredFlows } from './flows';
import { runDeclaredInvariants } from './invariants';
import { runBrowserStressTest } from './browser-stress-tester';
import { loadPulseLocalEnv } from './local-env';
import { runSyntheticActors, type PulseSyntheticRunMode } from './actors';
import { getProfileSelection, getTargetLabel, parseCertificationProfile } from './profiles';
import type {
  PulseActorEvidence,
  PulseBrowserEvidence,
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

const args = process.argv.slice(2);
const tierArgIndex = args.indexOf('--tier');
const parsedTier = tierArgIndex >= 0 ? Number.parseInt(args[tierArgIndex + 1] || '', 10) : null;
const profileArgIndex = args.indexOf('--profile');
const requestedProfile = parseCertificationProfile(
  profileArgIndex >= 0 ? args[profileArgIndex + 1] || null : null,
);
const flags = {
  watch: args.includes('--watch') || args.includes('-w'),
  report: args.includes('--report') || args.includes('-r'),
  json: args.includes('--json') || args.includes('-j'),
  guidance: args.includes('--guidance'),
  vision: args.includes('--vision'),
  autonomous: args.includes('--autonomous'),
  continuous: args.includes('--continuous'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  deep: args.includes('--deep') || args.includes('-d'),
  total: args.includes('--total') || args.includes('-t'),
  fmap: args.includes('--functional-map') || args.includes('--fmap') || args.includes('-f'),
  certify: args.includes('--certify'),
  final: args.includes('--final'),
  tier: Number.isFinite(parsedTier) ? parsedTier : null,
  manifestValidate: args.includes('--manifest-validate'),
  headed: args.includes('--headed'),
  fast: args.includes('--fast'),
  customer: args.includes('--customer'),
  operator: args.includes('--operator'),
  admin: args.includes('--admin'),
  shift: args.includes('--shift'),
  soak: args.includes('--soak'),
  pageFilter: args.includes('--page') ? args[args.indexOf('--page') + 1] : null,
  groupFilter: args.includes('--group') ? args[args.indexOf('--group') + 1] : null,
  slowMo: args.includes('--slow-mo') ? parseInt(args[args.indexOf('--slow-mo') + 1], 10) : 50,
  maxIterations: args.includes('--max-iterations')
    ? parseInt(args[args.indexOf('--max-iterations') + 1], 10)
    : null,
  intervalMs: args.includes('--interval-ms')
    ? parseInt(args[args.indexOf('--interval-ms') + 1], 10)
    : null,
  plannerModel: args.includes('--planner-model') ? args[args.indexOf('--planner-model') + 1] : null,
  codexModel: args.includes('--codex-model') ? args[args.indexOf('--codex-model') + 1] : null,
  disableAgentPlanner: args.includes('--disable-agent-planner'),
  profile: requestedProfile,
};
const inferredSyntheticModes = new Set<PulseSyntheticRunMode>(
  [
    flags.customer ? 'customer' : null,
    flags.operator ? 'operator' : null,
    flags.admin ? 'admin' : null,
    flags.shift ? 'shift' : null,
    flags.soak ? 'soak' : null,
  ].filter((value): value is PulseSyntheticRunMode => Boolean(value)),
);

if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 1)) {
  inferredSyntheticModes.add('customer');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 2)) {
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
}
if (flags.final || (typeof flags.tier === 'number' && flags.tier >= 4)) {
  inferredSyntheticModes.add('soak');
}
if (flags.profile === 'core-critical') {
  inferredSyntheticModes.add('customer');
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
}
if (flags.profile === 'full-product') {
  inferredSyntheticModes.add('customer');
  inferredSyntheticModes.add('operator');
  inferredSyntheticModes.add('admin');
  inferredSyntheticModes.add('soak');
}

const requestedSyntheticModes = [...inferredSyntheticModes];
const queryModeRequested = flags.guidance || flags.vision;

const actorModeRequested = requestedSyntheticModes.length > 0;

function deriveEffectiveTarget() {
  if (flags.profile) {
    return getProfileSelection(flags.profile).certificationTarget;
  }

  return {
    tier: flags.tier,
    final: flags.final,
    profile: null,
  };
}

function deriveEffectiveEnvironment() {
  if (flags.profile) {
    return getProfileSelection(flags.profile).environment;
  }
  if (flags.total) {
    return 'total' as const;
  }
  if (flags.deep) {
    return 'deep' as const;
  }
  return 'scan' as const;
}

function compactReason(value: string, max: number = 500): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

function deriveBrowserEvidenceFromActors(
  actorModeRequested: boolean,
  browserEvidence: PulseBrowserEvidence,
  syntheticEvidence: ReturnType<typeof runSyntheticActors>,
) {
  if (!actorModeRequested || browserEvidence.executed) {
    return browserEvidence;
  }

  const actorResults = [
    ...syntheticEvidence.customer.results,
    ...syntheticEvidence.operator.results,
    ...syntheticEvidence.admin.results,
    ...syntheticEvidence.soak.results,
  ].filter((result) => result.requested && result.runner === 'playwright-spec');

  if (actorResults.length === 0) {
    return browserEvidence;
  }

  const executed = actorResults.filter((result) => result.executed);
  const passed = executed.filter((result) => result.status === 'passed');
  const blocking = executed.filter(
    (result) => result.status === 'failed' || result.status === 'checker_gap',
  );

  return {
    ...browserEvidence,
    attempted: true,
    executed: executed.length > 0,
    artifactPaths: [
      ...new Set([
        ...browserEvidence.artifactPaths,
        ...executed.flatMap((result) => result.artifactPaths),
      ]),
    ],
    summary:
      executed.length === 0
        ? `No requested Playwright synthetic scenarios executed successfully. Requested: ${actorResults.map((result) => result.scenarioId).join(', ')}.`
        : blocking.length > 0
          ? `Synthetic Playwright scenarios executed with failures: ${blocking.map((result) => result.scenarioId).join(', ')}.`
          : `Synthetic Playwright scenarios executed successfully: ${passed.map((result) => result.scenarioId).join(', ')}.`,
    totalTested: actorResults.length,
    passRate: executed.length > 0 ? Math.round((passed.length / executed.length) * 100) : 0,
    blockingInteractions: blocking.length,
  };
}

// Activate runtime parsers when --deep/--total or synthetic actor modes are passed
if (
  flags.deep ||
  flags.total ||
  actorModeRequested ||
  flags.final ||
  Boolean(flags.profile) ||
  (typeof flags.tier === 'number' && flags.tier >= 0)
) {
  process.env.PULSE_DEEP = '1';
}
if (
  flags.total ||
  actorModeRequested ||
  flags.final ||
  Boolean(flags.profile) ||
  (typeof flags.tier === 'number' && flags.tier >= 1)
) {
  process.env.PULSE_TOTAL = '1';
}

async function main() {
  const loadedEnvFiles = loadPulseLocalEnv(process.cwd());
  if (flags.autonomous) {
    const autonomyState = await runPulseAutonomousLoop(process.cwd(), {
      dryRun: flags.dryRun,
      continuous: flags.continuous,
      maxIterations: flags.maxIterations,
      intervalMs: flags.intervalMs,
      plannerModel: flags.plannerModel,
      codexModel: flags.codexModel,
      disableAgentPlanner: flags.disableAgentPlanner,
    });
    console.log(JSON.stringify(autonomyState, null, 2));
    process.exit(autonomyState.status === 'failed' ? 1 : 0);
  }
  const bootstrapProfileSelection = flags.profile ? getProfileSelection(flags.profile, null) : null;
  let profileSelection = bootstrapProfileSelection;
  const effectiveTarget = deriveEffectiveTarget();
  const effectiveEnvironment = deriveEffectiveEnvironment();
  const humanReadableOutput = !flags.json && !flags.guidance && !flags.vision;
  let effectiveRequestedSyntheticModes = [
    ...new Set([...requestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
  ];
  let effectiveActorModeRequested = effectiveRequestedSyntheticModes.length > 0;
  const tracer = new PulseExecutionTracer(process.cwd(), effectiveTarget, effectiveEnvironment);

  if (humanReadableOutput) {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║    PULSE — Live Codebase Nervous System         ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
  }

  // 1. Detect project structure
  const config = detectConfig(process.cwd());
  if (humanReadableOutput) {
    console.log(`  Frontend:  ${config.frontendDir}`);
    console.log(`  Backend:   ${config.backendDir}`);
    console.log(`  Schema:    ${config.schemaPath || '(not found)'}`);
    console.log(`  Prefix:    ${config.globalPrefix || '(none)'}`);
  }
  config.certificationProfile = flags.profile;
  const mode = effectiveEnvironment.toUpperCase();
  if (humanReadableOutput) {
    console.log(`  Mode:      ${mode}${mode !== 'SCAN' ? ' (runtime parsers active)' : ''}`);
  }
  if (humanReadableOutput && (flags.final || flags.tier !== null || flags.profile)) {
    console.log(`  Target:    ${getTargetLabel(effectiveTarget)}`);
  }
  if (humanReadableOutput && effectiveActorModeRequested) {
    console.log(`  Actors:    ${effectiveRequestedSyntheticModes.join(', ')}`);
  }
  if (humanReadableOutput && loadedEnvFiles.length > 0) {
    console.log(`  Local env: ${loadedEnvFiles.join(', ')} loaded`);
  }
  if (humanReadableOutput) {
    console.log('');
    console.log('  Scanning...');
  }

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
      timeoutMs: bootstrapProfileSelection?.phaseTimeoutMs,
      metadata: {
        profile: flags.profile || 'none',
        environment: effectiveEnvironment,
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
  let browserEvidence = certification.evidenceSummary.browser;

  const shouldRunBrowserStress = effectiveEnvironment === 'total' && !profileSelection;
  if (shouldRunBrowserStress) {
    if (humanReadableOutput) {
      console.log('  Executing browser certification...');
    }
    const browserRun = await runPhaseWithTrace(
      tracer,
      'browser-certification',
      () =>
        runBrowserStressTest({
          headed: flags.headed,
          fast: flags.fast,
          pageFilter: flags.pageFilter,
          groupFilter: flags.groupFilter,
          slowMo: flags.slowMo,
          log: true,
        }),
      {
        timeoutMs: 120_000,
        onTimeout: () => ({
          attempted: true,
          executed: false,
          exitCode: 124,
          frontendUrl: runtimeEvidence.frontendUrl || process.env.PULSE_FRONTEND_URL || '',
          backendUrl: runtimeEvidence.backendUrl || process.env.PULSE_BACKEND_URL || '',
          screenshotDir: 'screenshots/pulse-browser-timeout',
          reportPath: null,
          artifactPath: null,
          preflight: {
            status: 'frontend_unreachable' as const,
            detail: 'Browser certification phase timed out before the crawler completed.',
            checkedAt: new Date().toISOString(),
          },
          summary: 'Browser certification timed out before the crawler completed.',
          stressResult: null,
          error: 'browser phase timeout',
        }),
      },
    );
    browserEvidence = {
      ...certification.evidenceSummary.browser,
      attempted: browserRun.attempted,
      executed: browserRun.executed,
      artifactPaths: [
        ...new Set([
          ...(certification.evidenceSummary.browser.artifactPaths || []),
          ...(browserRun.artifactPath ? [browserRun.artifactPath] : []),
          ...(browserRun.reportPath ? [browserRun.reportPath] : []),
          browserRun.screenshotDir,
        ]),
      ],
      summary: compactReason(browserRun.summary),
      failureCode: browserRun.preflight.status,
      preflight: {
        status: browserRun.preflight.status,
        detail: compactReason(browserRun.preflight.detail, 280),
        checkedAt: browserRun.preflight.checkedAt,
      },
      totalPages: browserRun.stressResult?.summary.totalPages,
      totalTested: browserRun.stressResult?.summary.totalTested,
      passRate: browserRun.stressResult?.summary.passRate,
      blockingInteractions: browserRun.stressResult
        ? browserRun.stressResult.summary.byStatus.QUEBRADO +
          browserRun.stressResult.summary.byStatus.CRASH +
          browserRun.stressResult.summary.byStatus.TIMEOUT
        : undefined,
    };
  } else if (effectiveEnvironment === 'total') {
    tracer.startPhase('browser-certification', {
      profile: flags.profile || 'none',
    });
    tracer.finishPhase('browser-certification', 'skipped', {
      errorSummary: flags.profile
        ? 'Profile-scoped certification uses actor/browser scenarios instead of the full browser crawler.'
        : undefined,
    });
  }

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
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedExternalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState: derivedCapabilityState,
    flowProjection: derivedFlowProjection,
  });

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
          certificationTarget: effectiveTarget,
          executionEvidence: finalExecutionEvidencePayload,
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
    executionEvidence: certification.evidenceSummary,
  });
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState,
    flowProjection,
  });
  const parityGaps = buildParityGaps({
    codebaseTruth: scanResult.codebaseTruth,
    capabilityState,
    flowProjection,
    certification,
    resolvedManifest: scanResult.resolvedManifest,
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
    productGraph,
    capabilityState,
    flowProjection,
    parityGaps,
    externalSignalState,
    productVision,
    certification,
  };

  if (flags.manifestValidate) {
    if (
      scanResult.manifest &&
      certification.gates.scopeClosed.status === 'pass' &&
      certification.gates.specComplete.status === 'pass'
    ) {
      console.log('  Manifest valid.');
      process.exit(0);
    }

    console.error('  Manifest invalid.');
    console.error(`  ${certification.gates.specComplete.reason}`);
    console.error(`  ${certification.gates.scopeClosed.reason}`);
    process.exit(1);
  }

  // 3. Functional Map (if --fmap)
  if (flags.fmap) {
    console.log('  Building functional map...');
    const fmapStart = Date.now();
    const fmapResult = buildFunctionalMap(config, coreData);
    const fmapElapsed = ((Date.now() - fmapStart) / 1000).toFixed(1);
    console.log(`  Functional map built in ${fmapElapsed}s`);

    // Store in health stats
    health.stats.functionalMap = {
      totalInteractions: fmapResult.summary.totalInteractions,
      byStatus: fmapResult.summary.byStatus,
      functionalScore: fmapResult.summary.functionalScore,
    };

    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            health,
            certification,
            codebaseTruth: scanResult.codebaseTruth,
            resolvedManifest: scanResult.resolvedManifest,
            scopeState: scanResult.scopeState,
            codacyEvidence: scanResult.codacyEvidence,
            structuralGraph: scanResult.structuralGraph,
            capabilityState: scanResult.capabilityState,
            flowProjection: scanResult.flowProjection,
            parityGaps: scanResult.parityGaps,
            externalSignalState: scanResult.externalSignalState,
            productVision: scanResult.productVision,
            functionalMap: fmapResult,
          },
          null,
          2,
        ),
      );
    } else {
      renderDashboard(health, certification, { verbose: flags.verbose });
      renderFunctionalMapSummary(fmapResult);
      const fmapPath = generateFunctionalMapReport(fmapResult, config.rootDir);
      console.log(`  Functional map saved to: ${fmapPath}`);
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }

    process.exit(0);
  }

  // 4. Output
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          health,
          certification,
          codebaseTruth: scanResult.codebaseTruth,
          resolvedManifest: scanResult.resolvedManifest,
          scopeState: scanResult.scopeState,
          codacyEvidence: scanResult.codacyEvidence,
          structuralGraph: scanResult.structuralGraph,
          capabilityState: scanResult.capabilityState,
          flowProjection: scanResult.flowProjection,
          parityGaps: scanResult.parityGaps,
          externalSignalState: scanResult.externalSignalState,
          productVision: scanResult.productVision,
        },
        null,
        2,
      ),
    );
  } else if (flags.guidance) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    const directive = JSON.parse(fs.readFileSync(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive, null, 2));
  } else if (flags.vision) {
    generateArtifacts(scanResult, config.rootDir);
    console.log(JSON.stringify(scanResult.productVision, null, 2));
  } else if (flags.report) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    renderDashboard(health, certification, { verbose: flags.verbose });
    console.log(`  Report saved to: ${artifactPaths.reportPath}`);
  } else {
    renderDashboard(health, certification, { verbose: flags.verbose });

    if (!flags.watch) {
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }
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
