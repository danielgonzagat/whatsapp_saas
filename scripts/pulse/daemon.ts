import type {
  PulseCodebaseTruth,
  PulseConfig,
  PulseScopeState,
  PulseHealth,
  Break,
  PulseCertification,
  PulseCodacyEvidence,
  PulseCapabilityState,
  PulseFlowProjection,
  PulseExternalSignalState,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParityGapsArtifact,
  PulseParserDefinition,
  PulseParserInventory,
  PulseProductGraph,
  PulseProductVision,
  PulseResolvedManifest,
  PulseStructuralGraph,
} from './types';
import type { CoreParserData } from './functional-map-types';
import { parseSchema } from './parsers/schema-parser';
import { parseBackendRoutes } from './parsers/backend-parser';
import { traceServices } from './parsers/service-tracer';
import { parseAPICalls, parseProxyRoutes } from './parsers/api-parser';
import { parseUIElements } from './parsers/ui-parser';
import { detectFacades } from './parsers/facade-detector';
import { buildHookRegistry } from './parsers/hook-registry';
import { buildGraph } from './graph';
import { loadParserInventory } from './parser-registry';
import { safeResolve } from './safe-path';
import { loadPulseManifest } from './manifest';
import { computeCertification } from './certification';
import { extractCodebaseTruth } from './codebase-truth';
import { buildResolvedManifest } from './resolved-manifest';
import { buildScopeState } from './scope-state';
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

/** Full scan result shape. */
export interface FullScanResult {
  /** Health property. */
  health: PulseHealth;
  /** Core data property. */
  coreData: CoreParserData;
  /** Extended breaks property. */
  extendedBreaks: Break[];
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Manifest result property. */
  manifestResult: PulseManifestLoadResult;
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
  executionChains: any;
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
  /** Parser inventory property. */
  parserInventory: PulseParserInventory;
}

/** Full scan options shape. */
export interface FullScanOptions {
  /** Include parser property. */
  includeParser?: (name: string) => boolean;
  /** Parser timeout ms property. */
  parserTimeoutMs?: number;
  /** Tracer property. */
  tracer?: PulseExecutionTracer;
}

export {
  classifyWatchChange,
  getWatchRefreshMode,
  shouldRescanForWatchChange,
} from './daemon-watch-classifier';
export type { PulseWatchChangeKind, PulseWatchRefreshMode } from './daemon-watch-classifier';
export { refreshScanResultForWatchChange, rebuildDerivedScanState } from './daemon-watch-state';
export { startDaemon } from './daemon-watch';

async function runParserWithTimeout(
  parser: PulseParserDefinition,
  config: PulseConfig,
  timeoutMs: number,
): Promise<Break[]> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => parser.fn(config)),
      new Promise<Break[]>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Parser "${parser.name}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Full scan. */
export async function fullScan(
  config: PulseConfig,
  options: FullScanOptions = {},
): Promise<FullScanResult> {
  // Core parsers (1-6)
  options.tracer?.startPhase('scan:core-parsers');
  const prismaModels = parseSchema(config);
  const backendRoutes = parseBackendRoutes(config);
  const serviceTraces = traceServices(config);
  const apiCalls = parseAPICalls(config);
  const proxyRoutes = parseProxyRoutes(config);
  const hookRegistry = buildHookRegistry(config);
  const uiElements = parseUIElements(config, hookRegistry);
  const facades = detectFacades(config);
  options.tracer?.finishPhase('scan:core-parsers', 'passed', {
    metadata: {
      uiElements: uiElements.length,
      apiCalls: apiCalls.length,
      backendRoutes: backendRoutes.length,
      prismaModels: prismaModels.length,
      serviceTraces: serviceTraces.length,
      proxyRoutes: proxyRoutes.length,
      facades: facades.length,
    },
  });

  const coreData: CoreParserData = {
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    hookRegistry,
  };

  // Extended parsers (7+) — collect all breaks, support async parsers
  const extendedBreaks: Break[] = [];
  options.tracer?.startPhase('scan:extended-parser-inventory');
  const parserInventory = loadParserInventory(config, {
    includeParser: options.includeParser,
  });
  options.tracer?.finishPhase('scan:extended-parser-inventory', 'passed', {
    metadata: {
      discoveredChecks: parserInventory.discoveredChecks.length,
      loadedChecks: parserInventory.loadedChecks.length,
      unavailableChecks: parserInventory.unavailableChecks.length,
    },
  });

  for (const unavailable of parserInventory.unavailableChecks) {
    extendedBreaks.push({
      type: 'CHECK_UNAVAILABLE',
      severity: 'high',
      file: unavailable.file,
      line: 1,
      description: `PULSE parser "${unavailable.name}" could not be loaded`,
      detail: unavailable.reason,
      source: 'parser-registry',
    });
  }

  options.tracer?.startPhase('scan:extended-parsers', {
    parserCount: parserInventory.loadedChecks.length,
  });
  const parserTimeoutMs = options.parserTimeoutMs || 30_000;
  for (const parser of parserInventory.loadedChecks) {
    options.tracer?.startPhase(`parser:${parser.name}`, {
      timeoutMs: parserTimeoutMs,
    });
    try {
      const breaks = await runParserWithTimeout(parser, config, parserTimeoutMs);
      extendedBreaks.push(
        ...breaks.map((item) => ({
          ...item,
          source: item.source || parser.name,
        })),
      );
      options.tracer?.finishPhase(`parser:${parser.name}`, 'passed', {
        metadata: {
          breakCount: breaks.length,
        },
      });
    } catch (e) {
      const message = (e as Error).message || 'Unknown parser execution failure';
      parserInventory.unavailableChecks.push({
        name: parser.name,
        file: parser.file,
        reason: message,
      });
      extendedBreaks.push({
        type: 'CHECK_UNAVAILABLE',
        severity: 'high',
        file: parser.file,
        line: 1,
        description: `PULSE parser "${parser.name}" failed during execution`,
        detail: message,
        source: parser.name,
      });
      options.tracer?.finishPhase(
        `parser:${parser.name}`,
        message.includes('timed out after') ? 'timed_out' : 'failed',
        {
          errorSummary: message,
        },
      );
    }
  }
  options.tracer?.finishPhase('scan:extended-parsers', 'passed', {
    metadata: {
      breakCount: extendedBreaks.length,
      parserCount: parserInventory.loadedChecks.length,
    },
  });

  options.tracer?.startPhase('scan:manifest');
  const manifestResult = loadPulseManifest(config, coreData);
  extendedBreaks.push(...manifestResult.issues);
  options.tracer?.finishPhase('scan:manifest', 'passed', {
    metadata: {
      issues: manifestResult.issues.length,
      unknownSurfaces: manifestResult.unknownSurfaces.length,
      unsupportedStacks: manifestResult.unsupportedStacks.length,
    },
  });

  options.tracer?.startPhase('scan:graph');
  const health = buildGraph({
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    globalPrefix: config.globalPrefix,
    config,
    extendedBreaks,
  });
  options.tracer?.finishPhase('scan:graph', 'passed', {
    metadata: {
      score: health.score,
      breakCount: health.breaks.length,
    },
  });

  options.tracer?.startPhase('scan:truth');
  const scopeState = buildScopeState(config.rootDir);
  const codebaseTruth = extractCodebaseTruth(config, coreData, manifestResult.manifest);
  const resolvedManifest = buildResolvedManifest(
    manifestResult.manifest,
    manifestResult.manifestPath,
    codebaseTruth,
    scopeState,
  );
  const codacyEvidence = buildCodacyEvidence(scopeState);
  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData,
    scopeState,
    resolvedManifest,
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
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth,
    resolvedManifest,
    scopeState,
  });
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState,
    codacyEvidence,
    capabilityState,
    flowProjection,
  });
  options.tracer?.finishPhase('scan:truth', 'passed', {
    metadata: {
      pages: codebaseTruth.summary.totalPages,
      modules: resolvedManifest.summary.totalModules,
      flowGroups: resolvedManifest.summary.totalFlowGroups,
      scopeFiles: scopeState.summary.totalFiles,
      capabilities: capabilityState.summary.totalCapabilities,
      projectedFlows: flowProjection.summary.totalFlows,
    },
  });

  options.tracer?.startPhase('scan:certification');
  const certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult,
    parserInventory,
    health,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
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
  options.tracer?.finishPhase('scan:certification', 'passed', {
    metadata: {
      status: certification.status,
      score: certification.score,
    },
  });

  return {
    health,
    coreData,
    extendedBreaks,
    manifest: manifestResult.manifest,
    manifestResult,
    codebaseTruth,
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
    parserInventory,
  };
}
