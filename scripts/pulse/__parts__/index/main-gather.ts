import { detectConfig } from '../../config';
import { fullScan } from '../../daemon';
import { getProfileSelection } from '../../profiles';
import { PulseExecutionTracer, runPhaseWithTrace } from '../../execution-trace';
import { loadPulseLocalEnv } from '../../local-env';
import { printPulseStartupSummary } from '../../index-preamble';
import {
  flags,
  deriveEffectiveEnvironment,
  deriveEffectiveTarget,
  requestedSyntheticModes,
  deriveBrowserEvidenceFromActors,
} from '../../index-cli';
import { buildBrowserEvidenceForIndex } from '../../index-browser-evidence';
import {
  buildStageMetadata,
  printRegisteredStagePlan,
  type PulseIndexStageId,
} from './stage-definitions';
import { deriveFullScanTimeoutMs, runRegisteredStage } from './stage-runner';
import {
  buildFailedRuntimeProbe,
  buildTimedOutActorEvidence,
  buildTimedOutFlowEvidence,
  buildTimedOutInvariantEvidence,
  buildTimedOutRuntimeProbe,
  buildTimedOutWorldState,
} from '../../timeout-evidence';
import {
  collectObservabilityEvidence,
  collectRecoveryEvidence,
  collectRuntimeProbe,
  getRuntimeProbeIds,
  summarizeRuntimeEvidence,
} from '../../runtime-evidence';
import { runDeclaredFlows } from '../../flows';
import { runDeclaredInvariants } from '../../invariants';
import { runSyntheticActors } from '../../actors';
import type { PulseRuntimeProbe } from '../../types';

export async function runPulseGatherPhase() {
  const loadedEnvFiles = loadPulseLocalEnv(process.cwd());
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
  printRegisteredStagePlan(humanReadableOutput);

  const startTime = Date.now();
  let scanResult = await runRegisteredStage(
    tracer,
    'full-scan' as PulseIndexStageId,
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
  profileSelection = flags.profile
    ? getProfileSelection(flags.profile, scanResult.manifest)
    : profileSelection;
  effectiveRequestedSyntheticModes = [
    ...new Set([...effectiveRequestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
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
    ...buildStageMetadata('runtime-evidence'),
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
  const observabilityEvidence = await runRegisteredStage(
    tracer,
    'observability-evidence' as PulseIndexStageId,
    () => collectObservabilityEvidence(config.rootDir, runtimeEvidence),
    { timeoutMs: 10_000 },
  );
  const recoveryEvidence = await runRegisteredStage(
    tracer,
    'recovery-evidence' as PulseIndexStageId,
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

  const flowEvidence = await runRegisteredStage(
    tracer,
    'declared-flows' as PulseIndexStageId,
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

  const invariantEvidence = await runRegisteredStage(
    tracer,
    'declared-invariants' as PulseIndexStageId,
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

  const syntheticEvidence = await runRegisteredStage(
    tracer,
    'synthetic-actors' as PulseIndexStageId,
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

  return {
    config,
    tracer,
    effectiveTarget,
    effectiveEnvironment,
    humanReadableOutput,
    scanResult,
    certification,
    profileSelection,
    effectiveRequestedSyntheticModes,
    effectiveActorModeRequested,
    runtimeEvidence,
    observabilityEvidence,
    recoveryEvidence,
    browserEvidence,
    flowEvidence,
    invariantEvidence,
    syntheticEvidence,
  };
}
