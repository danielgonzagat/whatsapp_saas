import type {
  Break,
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseCertification,
  PulseConfig,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseHealth,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParityGapsArtifact,
  PulseParserDefinition,
  PulseParserInventory,
  PulseProductGraph,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
} from './types';
import type { PulseExecutionChainSet } from './types.product-graph';
import type { CoreParserData } from './functional-map-types';
import type { PulseExecutionTracer } from './execution-trace';
import { buildCapabilityState } from './capability-model';
import { computeCertification } from './certification';
import { extractCodebaseTruth } from './codebase-truth';
import { buildCodacyEvidence } from './codacy-evidence';
import { buildExecutionChains } from './execution-chains';
import { buildExternalSignalState } from './external-signals';
import { buildFlowProjection } from './flow-projection';
import { buildGraph } from './graph';
import { loadParserInventory } from './parser-registry';
import { buildParityGaps } from './parity-gaps';
import { buildProductModel } from './product-model';
import { buildProductVision } from './product-vision';
import { buildResolvedManifest } from './resolved-manifest';
import { buildScopeState } from './scope-state';
import { buildStructuralGraph } from './structural-graph';
import { detectFacades } from './parsers/facade-detector';
import { parseAPICalls, parseProxyRoutes } from './parsers/api-parser';
import { parseBackendRoutes } from './parsers/backend-parser';
import { buildHookRegistry } from './parsers/hook-registry';
import { parseSchema } from './parsers/schema-parser';
import { traceServices } from './parsers/service-tracer';
import { parseUIElements } from './parsers/ui-parser';
import { loadPulseManifest } from './manifest';

/** Full scan result. */
export interface FullScanResult {
  /** Capability state. */
  capabilityState: PulseCapabilityState;
  /** Certification. */
  certification: PulseCertification;
  /** Codebase truth. */
  codebaseTruth: PulseCodebaseTruth;
  /** Codacy evidence. */
  codacyEvidence: PulseCodacyEvidence;
  /** Core data. */
  coreData: CoreParserData;
  /** Execution chains. */
  executionChains: PulseExecutionChainSet;
  /** Extended breaks. */
  extendedBreaks: Break[];
  /** External signal state. */
  externalSignalState: PulseExternalSignalState;
  /** Flow projection. */
  flowProjection: PulseFlowProjection;
  /** Health. */
  health: PulseHealth;
  /** Manifest. */
  manifest: PulseManifest | null;
  /** Manifest result. */
  manifestResult: PulseManifestLoadResult;
  /** Parity gaps. */
  parityGaps: PulseParityGapsArtifact;
  /** Parser inventory. */
  parserInventory: PulseParserInventory;
  /** Product graph. */
  productGraph: PulseProductGraph;
  /** Product vision. */
  productVision: PulseProductVision;
  /** Resolved manifest. */
  resolvedManifest: PulseResolvedManifest;
  /** Scope state. */
  scopeState: PulseScopeState;
  /** Structural graph. */
  structuralGraph: PulseStructuralGraph;
}

/** Full scan options. */
export interface FullScanOptions {
  /** Include parser predicate. */
  includeParser?: (name: string) => boolean;
  /** Parser timeout ms. */
  parserTimeoutMs?: number;
  /** Execution tracer. */
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

/**
 * Run parser with timeout enforcement.
 *
 * @param parser - Parser definition.
 * @param config - Pulse config.
 * @param timeoutMs - Timeout in milliseconds.
 * @returns Breaks found by parser.
 * @throws Error if parser times out.
 */
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
          const msg = `Parser "${parser.name}" timed out after ${timeoutMs}ms`;
          reject(new Error(msg));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Execute full PULSE scan.
 *
 * @param config - Pulse configuration.
 * @param options - Scan options.
 * @returns Complete scan result.
 */
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
      apiCalls: apiCalls.length,
      backendRoutes: backendRoutes.length,
      facades: facades.length,
      prismaModels: prismaModels.length,
      proxyRoutes: proxyRoutes.length,
      serviceTraces: serviceTraces.length,
      uiElements: uiElements.length,
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
