import * as path from 'path';
import type {
  PulseCodebaseTruth,
  PulseConfig,
  PulseHealth,
  Break,
  PulseCertification,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParserDefinition,
  PulseParserInventory,
  PulseResolvedManifest,
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
import type { PulseExecutionTracer } from './execution-trace';

/** Full scan result shape. */
export interface FullScanResult {
  /** Health property. */
  health: PulseHealth;
  /** Core data property. */
  coreData: CoreParserData;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Manifest result property. */
  manifestResult: PulseManifestLoadResult;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
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

type ParserType = 'schema' | 'backend' | 'service' | 'api' | 'ui' | 'facade' | 'proxy';

function getParserType(filePath: string, config: PulseConfig): ParserType | null {
  const rel = path.relative(config.rootDir, filePath);
  if (rel.endsWith('schema.prisma')) {
    return 'schema';
  }
  if (rel.includes('backend') && rel.endsWith('.controller.ts')) {
    return 'backend';
  }
  if (rel.includes('backend') && rel.endsWith('.service.ts')) {
    return 'service';
  }
  if (rel.includes('frontend') && rel.match(/\/app\/api\/.*\/route\.ts$/)) {
    return 'proxy';
  }
  if (rel.includes('frontend') && rel.match(/\/lib\/api\/.*\.ts$/)) {
    return 'api';
  }
  if (rel.includes('frontend') && rel.endsWith('.tsx')) {
    return 'ui';
  }
  return null;
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

  const watcher = chokidar.watch(
    [
      path.join(config.frontendDir, '**/*.{ts,tsx}'),
      path.join(config.backendDir, '**/*.{ts}'),
      config.schemaPath,
    ].filter(Boolean),
    {
      ignored: /(node_modules|\.next|dist|\.git|coverage)/,
      persistent: true,
      ignoreInitial: true,
    },
  );

  watcher.on('change', (filePath: string) => {
    const existing = debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      filePath,
      setTimeout(async () => {
        debounceTimers.delete(filePath);
        const parserType = getParserType(filePath, config);
        if (parserType) {
          scanResult = await fullScan(config); // Full re-scan for simplicity
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
  for (const surface of manifestResult.unknownSurfaces) {
    extendedBreaks.push({
      type: 'UNKNOWN_SURFACE',
      severity: 'high',
      file: manifestResult.manifestPath
        ? path.relative(config.rootDir, manifestResult.manifestPath)
        : PULSE_MANIFEST_FILENAME,
      line: 1,
      description: `Discovered surface "${surface}" is not declared in pulse.manifest.json`,
      detail:
        'Add the surface to the manifest or explicitly exclude it to close certification scope.',
      source: 'manifest',
      surface,
    });
  }
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
  const codebaseTruth = extractCodebaseTruth(config, coreData, manifestResult.manifest);
  const resolvedManifest = buildResolvedManifest(
    manifestResult.manifest,
    manifestResult.manifestPath,
    codebaseTruth,
  );
  options.tracer?.finishPhase('scan:truth', 'passed', {
    metadata: {
      pages: codebaseTruth.summary.totalPages,
      modules: resolvedManifest.summary.totalModules,
      flowGroups: resolvedManifest.summary.totalFlowGroups,
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
    manifest: manifestResult.manifest,
    manifestResult,
    codebaseTruth,
    resolvedManifest,
    certification,
    parserInventory,
  };
}
