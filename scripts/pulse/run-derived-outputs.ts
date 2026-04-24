/**
 * Derived model building and output rendering phase of the PULSE main loop.
 * Accepts a finalized scan result + evidence payload and produces all derived
 * models (structural graph, capabilities, flows, signals, parity gaps, vision),
 * then renders or emits output based on the active flags.
 */
import type { FullScanResult } from './daemon';
import type { PulseCertification, PulseConfig } from './types';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildCapabilityState } from './capability-model';
import { buildFlowProjection } from './flow-projection';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision';
import { buildProductModel } from './product-model';
import { buildExternalSignalState } from './external-signals';
import { runExternalSourcesOrchestrator } from './adapters/external-sources-orchestrator';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { PulseExecutionTracer, runPhaseWithTrace } from './execution-trace';
import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts';
import { formatSelfTrustReport, type SelfTrustReport } from './self-trust';
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

  // Run external sources orchestration
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
  }).catch(() => null);

  const liveExternalState = await runPhaseWithTrace(
    tracer,
    'external-sources-orchestration',
    () => externalSourcesTask,
    { timeoutMs: 15_000, onTimeout: () => null },
  );
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState,
    flowProjection,
    liveExternalState,
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
  const humanReadableOutput = !flags.json && !flags.guidance && !flags.prove && !flags.vision;

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
      const artifactPaths = generateArtifacts(finalScanResult, config.rootDir);
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
    const artifactPaths = generateArtifacts(finalScanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive, null, 2));
  } else if (flags.prove) {
    const artifactPaths = generateArtifacts(finalScanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive.autonomyProof, null, 2));
  } else if (flags.vision) {
    generateArtifacts(finalScanResult, config.rootDir);
    console.log(JSON.stringify(finalScanResult.productVision, null, 2));
  } else if (flags.selfTrust) {
    console.log('\n Self-Trust Verification Report\n');
    console.log(formatSelfTrustReport(selfTrustReport));
  } else if (flags.report) {
    const artifactPaths = generateArtifacts(finalScanResult, config.rootDir);
    renderDashboard(health, certification, { verbose: flags.verbose });
    console.log(`  Report saved to: ${artifactPaths.reportPath}`);
  } else {
    renderDashboard(health, certification, { verbose: flags.verbose });
    if (!flags.watch) {
      const artifactPaths = generateArtifacts(finalScanResult, config.rootDir);
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
