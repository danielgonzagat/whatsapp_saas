/**
 * Derived model building and output rendering phase of the PULSE main loop.
 * Accepts a finalized scan result + evidence payload and produces all derived
 * models (structural graph, capabilities, flows, signals, parity gaps, vision),
 * then renders or emits output based on the active flags.
 */
import type { FullScanResult } from './daemon/types';
import type { PulseCertification } from './types.evidence';
import type { PulseConfig } from './types.manifest';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildExecutionMatrix } from './execution-matrix/matrix';
import { buildCapabilityState } from './capability-model/builder';
import { buildFlowProjection } from './flow-projection/builder';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision/builder';
import { buildProductModel } from './product-model/model-builder';
import { buildExternalSignalState } from './external-signals/signal-state';
import { runExternalSourcesOrchestrator } from './adapters/external-sources-orchestrator/orchestration';
import type { ExternalSourcesConfig } from './adapters/external-sources-orchestrator/core';
import { deriveExternalSourcesTimeoutMs } from './external-sources-timeout';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { PulseExecutionTracer, runPhaseWithTrace } from './execution-trace';
import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts/generate';
import type { PulseArtifactPaths, PulseArtifactSnapshot } from './artifacts/types';
import type { SelfTrustReport } from './self-trust/checks-core';
import { formatSelfTrustReport } from './self-trust/runner';
import { readTextFile } from './safe-fs';
import type { flags } from './cli-args';

export interface DerivedOutputsInput {
  config: PulseConfig;
  scanResult: FullScanResult;
  certification: PulseCertification;
  selfTrustReport: SelfTrustReport;
  tracer: PulseExecutionTracer;
  flags: typeof flags;
  queryModeRequested: boolean;
}

function generateArtifactsWithProofReadiness(
  snapshot: PulseArtifactSnapshot,
  rootDir: string,
): PulseArtifactPaths {
  return generateArtifacts(snapshot, rootDir);
}

export async function runDerivedOutputs(input: DerivedOutputsInput): Promise<void> {
  const { config, scanResult, tracer } = input;
  let { certification } = input;

  // Build structural models
  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: scanResult.coreData,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: certification.evidenceSummary,
  });
  const executionChains = buildExecutionChains({ structuralGraph });
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

  const githubToken = process.env.GITHUB_TOKEN;
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const datadogApiKey = process.env.DATADOG_API_KEY;
  const datadogAppKey = process.env.DATADOG_APP_KEY;
  const datadogSite = process.env.DATADOG_SITE;
  const prometheusBaseUrl = process.env.PROMETHEUS_BASE_URL || process.env.PULSE_PROMETHEUS_URL;
  const prometheusBearerToken =
    process.env.PROMETHEUS_BEARER_TOKEN || process.env.PULSE_PROMETHEUS_TOKEN;
  const prometheusQuery = process.env.PROMETHEUS_QUERY;
  const codecovToken = process.env.CODECOV_TOKEN;
  const dependabotToken = process.env.GITHUB_TOKEN;

  // Run external sources orchestration
  const externalSourcesConfig: ExternalSourcesConfig = {
    rootDir: config.rootDir,
    github: {
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      ...(githubToken !== undefined ? { token: githubToken } : {}),
    },
    sentry: {
      ...(sentryAuthToken !== undefined ? { authToken: sentryAuthToken } : {}),
      ...(sentryOrg !== undefined ? { org: sentryOrg } : {}),
      ...(sentryProject !== undefined ? { project: sentryProject } : {}),
    },
    datadog: {
      ...(datadogApiKey !== undefined ? { apiKey: datadogApiKey } : {}),
      ...(datadogAppKey !== undefined ? { appKey: datadogAppKey } : {}),
      ...(datadogSite !== undefined ? { site: datadogSite } : {}),
    },
    prometheus: {
      ...(prometheusBaseUrl !== undefined ? { baseUrl: prometheusBaseUrl } : {}),
      ...(prometheusBearerToken !== undefined ? { bearerToken: prometheusBearerToken } : {}),
      ...(prometheusQuery !== undefined ? { query: prometheusQuery } : {}),
    },
    codecov: {
      ...(codecovToken !== undefined ? { token: codecovToken } : {}),
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    dependabot: {
      ...(dependabotToken !== undefined ? { token: dependabotToken } : {}),
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    ...(config.certificationProfile != null ? { profile: config.certificationProfile } : {}),
    ...(config.certificationProfile != null
      ? { certificationScope: config.certificationProfile }
      : {}),
  };
  const externalSourcesTask = runExternalSourcesOrchestrator(externalSourcesConfig).catch(
    () => null,
  );
  const externalSourcesTimeoutMs = deriveExternalSourcesTimeoutMs(externalSourcesConfig);

  const liveExternalState = await runPhaseWithTrace(
    tracer,
    'external-sources-orchestration',
    () => externalSourcesTask,
    { timeoutMs: externalSourcesTimeoutMs, onTimeout: () => null },
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

  const finalScanResult: FullScanResult = {
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

  const { flags, queryModeRequested, selfTrustReport } = input;
  const health = finalScanResult.health;
  const coreData = finalScanResult.coreData;

  if (flags.manifestValidate) {
    if (
      finalScanResult.manifest &&
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

  if (flags.fmap) {
    console.log('  Building functional map...');
    const fmapStart = Date.now();
    const fmapResult = buildFunctionalMap(config, coreData);
    const fmapElapsed = ((Date.now() - fmapStart) / 1000).toFixed(1);
    console.log(`  Functional map built in ${fmapElapsed}s`);
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
            codebaseTruth: finalScanResult.codebaseTruth,
            resolvedManifest: finalScanResult.resolvedManifest,
            scopeState: finalScanResult.scopeState,
            codacyEvidence: finalScanResult.codacyEvidence,
            structuralGraph: finalScanResult.structuralGraph,
            executionMatrix: finalScanResult.executionMatrix,
            capabilityState: finalScanResult.capabilityState,
            flowProjection: finalScanResult.flowProjection,
            parityGaps: finalScanResult.parityGaps,
            externalSignalState: finalScanResult.externalSignalState,
            productVision: finalScanResult.productVision,
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
      const artifactPaths = generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }
    process.exit(0);
  }

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          health,
          certification,
          codebaseTruth: finalScanResult.codebaseTruth,
          resolvedManifest: finalScanResult.resolvedManifest,
          scopeState: finalScanResult.scopeState,
          codacyEvidence: finalScanResult.codacyEvidence,
          structuralGraph: finalScanResult.structuralGraph,
          executionMatrix: finalScanResult.executionMatrix,
          capabilityState: finalScanResult.capabilityState,
          flowProjection: finalScanResult.flowProjection,
          parityGaps: finalScanResult.parityGaps,
          externalSignalState: finalScanResult.externalSignalState,
          productVision: finalScanResult.productVision,
        },
        null,
        2,
      ),
    );
  } else if (flags.guidance) {
    const artifactPaths = generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive, null, 2));
  } else if (flags.prove) {
    const artifactPaths = generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive.autonomyProof, null, 2));
  } else if (flags.vision) {
    generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
    console.log(JSON.stringify(finalScanResult.productVision, null, 2));
  } else if (flags.selfTrust) {
    console.log('\n Self-Trust Verification Report\n');
    console.log(formatSelfTrustReport(selfTrustReport));
  } else if (flags.report) {
    const artifactPaths = generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
    renderDashboard(health, certification, { verbose: flags.verbose });
    console.log(`  Report saved to: ${artifactPaths.reportPath}`);
  } else {
    renderDashboard(health, certification, { verbose: flags.verbose });
    if (!flags.watch) {
      const artifactPaths = generateArtifactsWithProofReadiness(finalScanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }
  }

  if (!flags.watch) {
    if (queryModeRequested) process.exit(0);
    if (flags.certify) process.exit(certification.status === 'CERTIFIED' ? 0 : 1);
    const criticalBreaks = health.breaks.filter((b) => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}
