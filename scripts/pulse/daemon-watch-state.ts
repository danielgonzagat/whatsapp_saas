import { safeJoin } from './safe-path';
import type { PulseConfig } from './types.manifest';
import { renderDashboard } from './dashboard';
import { loadPulseManifest } from './manifest';
import { computeCertification } from './certification/__parts__/compute';
import { generateArtifacts } from './__parts__/artifacts/generate';
import { extractCodebaseTruth } from './codebase-truth/__parts__/main-extraction';
import { buildResolvedManifest } from './resolved-manifest/__parts__/builder';
import { buildScopeState } from './scope-state/__parts__/assembler';
import { buildGraph } from './graph/__parts__/graph-part3-builder';
import { buildCodacyEvidence } from './codacy-evidence';
import { buildStructuralGraph } from './structural-graph';
import { buildExecutionChains } from './execution-chains';
import { buildProductModel } from './product-model/__parts__/model-builder';
import { buildCapabilityState } from './capability-model/__parts__/builder';
import { buildFlowProjection } from './flow-projection/__parts__/builder';
import { buildParityGaps } from './parity-gaps';
import { buildProductVision } from './product-vision/__parts__/builder';
import { buildExternalSignalState } from './external-signals/__parts__/signal-state';
import type { PulseExecutionTracer } from './execution-trace';
import { fullScan } from './daemon/__parts__/fullScan';
import type { FullScanOptions, FullScanResult } from './daemon/__parts__/types';
import { getWatchRefreshMode, type PulseWatchChangeKind } from './daemon-watch-classifier';
import { buildMerkleDag } from './merkle-cache/__parts__/dag-build';

interface RebuildDerivedScanStateOptions {
  /** Tracer property. */
  tracer?: PulseExecutionTracer;
  /** Refresh manifest property. */
  refreshManifest?: boolean;
  /** Changed path from the daemon watcher, absolute or repo-relative. */
  changedFilePath?: string;
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

  const next: FullScanResult = {
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

  refreshMerkleEvidence(config, next, options.changedFilePath);

  return next;
}

function refreshMerkleEvidence(
  config: PulseConfig,
  scanResult: FullScanResult,
  changedFilePath?: string,
): void {
  if (!changedFilePath) {
    return;
  }
  buildMerkleDag(config.rootDir, scanResult.structuralGraph, {
    changedFilePaths: [changedFilePath],
  });
}

/** Refresh scan result for watch change. */
export async function refreshScanResultForWatchChange(
  config: PulseConfig,
  previous: FullScanResult,
  kind: PulseWatchChangeKind | null,
  options: FullScanOptions = {},
  changedFilePath?: string,
): Promise<FullScanResult> {
  const refreshMode = getWatchRefreshMode(kind);
  if (refreshMode === 'none') {
    return previous;
  }
  if (refreshMode === 'derived') {
    return rebuildDerivedScanState(config, previous, {
      tracer: options.tracer,
      refreshManifest: kind === 'manifest',
      changedFilePath,
    });
  }
  return fullScan(config, options);
}
