import { computeCertification } from '../../certification';
import { buildStructuralGraph } from '../../structural-graph';
import { buildExecutionChains } from '../../execution-chains';
import { buildExecutionMatrix } from '../../execution-matrix';
import { buildCapabilityState } from '../../capability-model';
import { buildFlowProjection } from '../../flow-projection';
import { buildParityGaps } from '../../parity-gaps';
import { buildProductVision } from '../../product-vision';
import { buildProductModel } from '../../product-model';
import { buildExternalSignalState, createExternalSignalProfileState } from '../../external-signals';
import { runExternalSourcesOrchestrator } from '../../adapters/external-sources-orchestrator';
import type { ExternalSourcesConfig } from '../../adapters/external-sources-orchestrator';
import { deriveExternalSourcesTimeoutMs } from '../../external-sources-timeout';
import { buildPathCoverageState } from '../../path-coverage-engine';
import { runSelfTrustChecks } from '../../self-trust';
import { runCrossArtifactConsistencyCheck } from '../../cross-artifact-consistency-check';
import { readOptionalJson } from '../../artifacts.io';
import { startDaemon } from '../../daemon';
import { handlePulseOutput } from '../../index-output';
import { flags, queryModeRequested } from '../../index-cli';
import { buildRegisteredArtifactOverrides, type PulseIndexStageId } from './stage-definitions';
import { runRegisteredStage } from './stage-runner';
import type { PulseDirectiveSnapshot, PulseCertificateSnapshot } from '../../cert-gate-overclaim';
import type { PulseAutonomyStateSnapshot } from '../../cert-gate-multi-cycle';
import { runPulseGatherPhase } from './main-gather';

type PulseRunState = Awaited<ReturnType<typeof runPulseGatherPhase>>;

function buildExternalSourcesConfig(
  rootDir: string,
  effectiveTarget: PulseRunState['effectiveTarget'],
): ExternalSourcesConfig {
  return {
    rootDir,
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
  };
}

export async function runPulseCertifyPhase(state: PulseRunState): Promise<void> {
  const {
    config,
    tracer,
    effectiveTarget,
    effectiveEnvironment,
    humanReadableOutput,
    scanResult,
    certification: incomingCertification,
    runtimeEvidence,
    observabilityEvidence,
    recoveryEvidence,
    browserEvidence,
    flowEvidence,
    invariantEvidence,
    syntheticEvidence,
  } = state;

  const finalExecutionEvidencePayload = {
    ...incomingCertification.evidenceSummary,
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
  buildPathCoverageState(config.rootDir, derivedExecutionMatrix);

  const artifactsOverride = buildRegisteredArtifactOverrides({
    stageId: 'self-trust-verification',
    certification: scanResult.certification,
    externalSignalState: derivedExternalSignalState,
  });

  const selfTrustReport = await runRegisteredStage(
    tracer,
    'self-trust-verification' as PulseIndexStageId,
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

  let certification = await runRegisteredStage(
    tracer,
    'final-certification' as PulseIndexStageId,
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

  const externalSourcesConfig = buildExternalSourcesConfig(config.rootDir, effectiveTarget);
  const externalSourcesTask = runExternalSourcesOrchestrator(externalSourcesConfig).catch(
    () => null,
  );
  const externalSourcesTimeoutMs = deriveExternalSourcesTimeoutMs(externalSourcesConfig);

  const liveExternalState = await runRegisteredStage(
    tracer,
    'external-sources-orchestration' as PulseIndexStageId,
    () => externalSourcesTask,
    {
      timeoutMs: externalSourcesTimeoutMs,
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
  buildPathCoverageState(config.rootDir, executionMatrix);
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

  const finalScanResult = {
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
    scanResult: finalScanResult,
    health: scanResult.health,
    certification,
    config,
    coreData: scanResult.coreData,
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

  if (flags.watch) {
    await startDaemon(config);
  } else {
    if (queryModeRequested) {
      process.exit(0);
    }

    if (flags.certify) {
      process.exit(certification.status === 'CERTIFIED' ? 0 : 1);
    }

    const criticalBreaks = scanResult.health.breaks.filter((b) => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}
