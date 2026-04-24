import { safeJoin } from './safe-path';
import type { PulseConfig } from './types';
import { renderDashboard } from './dashboard';
import { loadPulseManifest } from './manifest';
import { computeCertification } from './certification';
import { generateArtifacts } from './artifacts';
import { extractCodebaseTruth } from './codebase-truth';
import { buildResolvedManifest } from './resolved-manifest';
import { buildScopeState } from './scope-state';
import { buildGraph } from './graph';
import { buildCodacyEvidence } from './codacy-evidence';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildProductModel } from './product-model';
import { buildCapabilityState } from './capability-model';
import { buildFlowProjection } from './flow-projection';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision';
import { buildExternalSignalState } from './external-signals';
import type { PulseExecutionTracer } from './execution-trace';
import { fullScan, type FullScanOptions, type FullScanResult } from './daemon';
import { getWatchRefreshMode, type PulseWatchChangeKind } from './daemon-watch-classifier';

interface RebuildDerivedScanStateOptions {
  /** Tracer property. */
  tracer?: PulseExecutionTracer;
  /** Refresh manifest property. */
  refreshManifest?: boolean;
}

/** Rebuild derived scan state. */
export function rebuildDerivedScanState(
  config: PulseConfig,
  previous: FullScanResult,
  options: RebuildDerivedScanStateOptions = {},
): FullScanResult {
  options.tracer?.startPhase('scan:derived-state-refresh');
  const manifestResult = options.refreshManifest
    ? loadPulseManifest(config, previous.coreData)
    : previous.manifestResult;
  const extendedBreaks = options.refreshManifest
    ? [
        ...previous.extendedBreaks.filter((item) => item.source !== 'manifest'),
        ...manifestResult.issues,
      ]
    : previous.extendedBreaks;
  const health = options.refreshManifest
    ? buildGraph({
        uiElements: previous.coreData.uiElements,
        apiCalls: previous.coreData.apiCalls,
        backendRoutes: previous.coreData.backendRoutes,
        prismaModels: previous.coreData.prismaModels,
        serviceTraces: previous.coreData.serviceTraces,
        proxyRoutes: previous.coreData.proxyRoutes,
        facades: previous.coreData.facades,
        globalPrefix: config.globalPrefix,
        config,
        extendedBreaks,
      })
    : previous.health;
  const scopeState = buildScopeState(config.rootDir);
  const codacyEvidence = buildCodacyEvidence(scopeState);
  const codebaseTruth = options.refreshManifest
    ? extractCodebaseTruth(config, previous.coreData, manifestResult.manifest)
    : previous.codebaseTruth;
  const resolvedManifest = buildResolvedManifest(
    manifestResult.manifest,
    manifestResult.manifestPath,
    codebaseTruth,
    scopeState,
  );
  const executionEvidence = previous.certification.evidenceSummary;
  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: previous.coreData,
    scopeState,
    resolvedManifest,
    executionEvidence,
  });
  const executionChains = buildExecutionChains({
    structuralGraph,
  });
  const productGraph = buildProductModel({
    structuralGraph,
    scopeState,
    resolvedManifest,
  });
  const capabilityState = buildCapabilityState({
    structuralGraph,
    scopeState,
    codacyEvidence,
    resolvedManifest,
    executionEvidence,
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    executionEvidence,
  });
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState,
    codacyEvidence,
    capabilityState,
    flowProjection,
  });
  const certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult,
    parserInventory: previous.parserInventory,
    health,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
    executionEvidence,
  });
  const parityGaps = buildParityGaps({
    codebaseTruth,
    capabilityState,
    flowProjection,
    certification,
    resolvedManifest,
    health,
  });
  const productVision = buildProductVision({
    capabilityState,
    flowProjection,
    certification,
    scopeState,
    codacyEvidence,
    resolvedManifest,
    parityGaps,
    externalSignalState,
  });
  options.tracer?.finishPhase('scan:derived-state-refresh', 'passed', {
    metadata: {
      scopeFiles: scopeState.summary.totalFiles,
      capabilities: capabilityState.summary.totalCapabilities,
      projectedFlows: flowProjection.summary.totalFlows,
      codacyHighIssues: codacyEvidence.summary.highIssues,
      manifestRefreshed: Boolean(options.refreshManifest),
      score: certification.score,
    },
  });

  return {
    ...previous,
    health,
    codebaseTruth,
    extendedBreaks,
    manifest: manifestResult.manifest,
    manifestResult,
    resolvedManifest,
    scopeState,
    codacyEvidence,
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
}

/** Refresh scan result for watch change. */
export async function refreshScanResultForWatchChange(
  config: PulseConfig,
  previous: FullScanResult,
  kind: PulseWatchChangeKind | null,
  options: FullScanOptions = {},
): Promise<FullScanResult> {
  const refreshMode = getWatchRefreshMode(kind);
  if (refreshMode === 'none') {
    return previous;
  }
  if (refreshMode === 'derived') {
    return rebuildDerivedScanState(config, previous, {
      tracer: options.tracer,
      refreshManifest: kind === 'manifest',
    });
  }
  return fullScan(config, options);
}
