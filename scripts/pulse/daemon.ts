import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
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
import { renderDashboard } from './dashboard';
import { loadParserInventory } from './parser-registry';
import { loadPulseManifest, PULSE_MANIFEST_FILENAME } from './manifest';
import { computeCertification } from './certification';
import { generateArtifacts } from './artifacts';
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
import { buildExternalSignalState, PULSE_EXTERNAL_INPUT_FILES } from './external-signals';
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

export type PulseWatchChangeKind =
  | 'schema'
  | 'manifest'
  | 'codacy'
  | 'external-signal'
  | 'frontend'
  | 'frontend-admin'
  | 'backend'
  | 'worker'
  | 'e2e'
  | 'scripts'
  | 'container'
  | 'root-config'
  | 'docs';

export type PulseWatchRefreshMode = 'none' | 'derived' | 'full';

function normalizeWatchPath(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

export function classifyWatchChange(
  filePath: string,
  config: PulseConfig,
): PulseWatchChangeKind | null {
  const rel = normalizeWatchPath(filePath, config.rootDir);
  if (!rel || rel.startsWith('../')) {
    return null;
  }

  if (rel === normalizeWatchPath(config.schemaPath, config.rootDir)) {
    return 'schema';
  }
  if (rel === PULSE_MANIFEST_FILENAME) {
    return 'manifest';
  }
  if (rel === 'PULSE_CODACY_STATE.json') {
    return 'codacy';
  }
  if (PULSE_EXTERNAL_INPUT_FILES.includes(rel) && rel !== 'PULSE_CODACY_STATE.json') {
    return 'external-signal';
  }
  if (rel === 'package.json' || rel === 'package-lock.json') {
    return 'root-config';
  }
  if (
    rel === 'Dockerfile' ||
    rel.startsWith('Dockerfile.') ||
    rel.startsWith('docker/') ||
    rel.startsWith('nginx/') ||
    rel.startsWith('.github/workflows/')
  ) {
    return 'container';
  }
  if (rel.startsWith('docs/') || /\.mdx?$/i.test(rel)) {
    return 'docs';
  }
  if (rel.startsWith('prisma/migrations/')) {
    return 'schema';
  }
  if (rel.startsWith('frontend-admin/')) {
    return 'frontend-admin';
  }
  if (rel.startsWith('frontend/')) {
    return 'frontend';
  }
  if (rel.startsWith('backend/')) {
    return 'backend';
  }
  if (rel.startsWith('worker/')) {
    return 'worker';
  }
  if (rel.startsWith('e2e/')) {
    return 'e2e';
  }
  if (rel.startsWith('scripts/')) {
    return 'scripts';
  }
  return null;
}

export function shouldRescanForWatchChange(kind: PulseWatchChangeKind | null): boolean {
  if (!kind) {
    return false;
  }
  return kind !== 'docs';
}

export function getWatchRefreshMode(kind: PulseWatchChangeKind | null): PulseWatchRefreshMode {
  if (!kind || kind === 'docs') {
    return 'none';
  }
  if (kind === 'codacy' || kind === 'manifest' || kind === 'external-signal') {
    return 'derived';
  }
  return 'full';
}

interface RebuildDerivedScanStateOptions {
  /** Tracer property. */
  tracer?: PulseExecutionTracer;
  /** Refresh manifest property. */
  refreshManifest?: boolean;
}

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

function getWatchGlobs(config: PulseConfig): string[] {
  return [
    safeJoin(config.rootDir, 'frontend/**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,json,md}'),
    safeJoin(config.rootDir, 'frontend-admin/**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,json,md}'),
    safeJoin(config.rootDir, 'backend/**/*.{ts,js,mjs,cjs,json,sql,md,yml,yaml}'),
    safeJoin(config.rootDir, 'worker/**/*.{ts,js,mjs,cjs,json,sql,md,yml,yaml}'),
    safeJoin(config.rootDir, 'e2e/**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,yml,yaml}'),
    safeJoin(config.rootDir, 'scripts/**/*.{ts,js,mjs,cjs,json,md,yml,yaml}'),
    safeJoin(config.rootDir, 'docs/**/*.{md,json,yml,yaml}'),
    safeJoin(config.rootDir, 'docker/**/*.{yml,yaml,json,md}'),
    safeJoin(config.rootDir, 'nginx/**/*.{conf,yml,yaml,json,md}'),
    safeJoin(config.rootDir, '.github/workflows/**/*.{yml,yaml,json}'),
    safeJoin(config.rootDir, 'pulse.manifest.json'),
    safeJoin(config.rootDir, 'PULSE_CODACY_STATE.json'),
    ...PULSE_EXTERNAL_INPUT_FILES.filter((fileName) => fileName !== 'PULSE_CODACY_STATE.json').map(
      (fileName) => safeJoin(config.rootDir, fileName),
    ),
    safeJoin(config.rootDir, 'package.json'),
    safeJoin(config.rootDir, 'package-lock.json'),
    safeJoin(config.rootDir, 'Dockerfile'),
    safeJoin(config.rootDir, 'Dockerfile.*'),
  ];
}

/** Start daemon. */
export async function startDaemon(config: PulseConfig): Promise<void> {
  let chokidar: any;
  try {
    chokidar = require('chokidar');
  } catch {
    console.error('  chokidar not installed. Run: npm install --save-dev chokidar');
    console.error('  Falling back to single scan mode.');
    return;
  }

  let scanResult = await fullScan(config);
  renderDashboard(scanResult.health, scanResult.certification, { watching: true });

  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch([...getWatchGlobs(config), config.schemaPath].filter(Boolean), {
    ignored:
      /(node_modules|\.next|dist|\.git|coverage|\.turbo|build|\.cache|\.pulse|\.claude|\.copilot)/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on('change', (filePath: string) => {
    const existing = debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      filePath,
      setTimeout(async () => {
        debounceTimers.delete(filePath);
        const changeKind = classifyWatchChange(filePath, config);
        if (shouldRescanForWatchChange(changeKind)) {
          scanResult = await refreshScanResultForWatchChange(config, scanResult, changeKind);
          renderDashboard(scanResult.health, scanResult.certification, { watching: true });
        }
      }, 500),
    );
  });

  // Keyboard input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (data: Buffer) => {
      const key = data.toString();
      if (key === 'q' || key === '\x03') {
        // q or Ctrl+C
        watcher.close();
        process.stdin.setRawMode(false);
        process.exit(0);
      }
      if (key === 'r') {
        scanResult = await fullScan(config);
        renderDashboard(scanResult.health, scanResult.certification, { watching: true });
      }
      if (key === 'e') {
        const paths = generateArtifacts(scanResult, config.rootDir);
        renderDashboard(scanResult.health, scanResult.certification, { watching: true });
        console.log(`  Report exported to: ${paths.reportPath}`);
      }
    });
  }

  console.log('  Watching for changes... Press [q] to quit, [r] to rescan, [e] to export.');
}

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
