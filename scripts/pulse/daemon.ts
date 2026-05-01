import type {
  Break,
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseCertification,
  PulseConfig,
  PulseExternalSignalState,
  PulseExecutionMatrix,
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
import { spawn } from 'child_process';
import * as path from 'path';
import { ensureDir, writeTextFile } from './safe-fs';
import { buildCapabilityState } from './capability-model';
import { computeCertification } from './certification';
import { extractCodebaseTruth } from './codebase-truth';
import { buildCodacyEvidence } from './codacy-evidence';
import { buildExecutionChains } from './execution-chains';
import { buildExecutionMatrix } from './execution-matrix';
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

// ── Perfectness layer imports ──
import { buildAstCallGraph } from './ast-graph';
import { buildScopeEngineState } from './scope-engine';
import { generateBehaviorGraph } from './behavior-graph';
import { buildMerkleDag } from './merkle-cache';
import { collectRuntimeTraces } from './otel-runtime';
import { buildRuntimeFusionState } from './runtime-fusion';
import { buildPropertyTestEvidence } from './property-tester';
import { buildExecutionHarness } from './execution-harness';
import { buildUICrawlerCatalog } from './ui-crawler';
import { buildAPIFuzzCatalog } from './api-fuzzer';
import { buildDataflowState } from './dataflow-engine';
import { buildContractTestEvidence } from './contract-tester';
import { buildDoDEngineState } from './dod-engine';
import { buildObservabilityCoverage } from './observability-coverage';
import { buildScenarioCatalog } from './scenario-engine';
import { buildReplayState } from './replay-adapter';
import { buildProductionProofState } from './production-proof';
import { buildChaosCatalog } from './chaos-engine';
import { buildPathCoverageState } from './path-coverage-engine';
import { writePulseCommandGraphArtifact } from './command-graph-artifact';
import { buildProofSynthesisState } from './proof-synthesis';
import { buildProbabilisticRisk } from './probabilistic-risk';
import { buildStructuralMemory } from './structural-memory';
import { buildFPAdjudicationState } from './false-positive-adjudicator';
import { evaluateAuthorityState } from './authority-engine';
import { buildAuditChain } from './audit-chain';
import { checkGitNexusFreshness } from './gitnexus-freshness';
import { loadPluginRegistry } from './plugin-system';
import { buildSandboxState } from './safety-sandbox';
import { evaluatePerfectness } from './perfectness-test';

interface PerfectnessModuleRun {
  module: string;
  status: 'passed' | 'failed';
  durationMs: number;
  error?: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Wraps a sync or async call and preserves module-level evidence. */
async function safeRun<T>(module: string, fn: () => T | Promise<T>): Promise<PerfectnessModuleRun> {
  const startedAt = Date.now();
  if (process.env.PULSE_PERFECTNESS_DEBUG === '1') {
    console.warn(`[perfectness] starting ${module}`);
  }
  try {
    await Promise.resolve(fn());
    if (process.env.PULSE_PERFECTNESS_DEBUG === '1') {
      console.warn(`[perfectness] passed ${module} in ${Date.now() - startedAt}ms`);
    }
    return {
      module,
      status: 'passed',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (process.env.PULSE_PERFECTNESS_DEBUG === '1') {
      console.warn(
        `[perfectness] failed ${module} in ${Date.now() - startedAt}ms: ${errorMessage(error)}`,
      );
    }
    return {
      module,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  }
}

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
  /** Execution matrix. */
  executionMatrix: PulseExecutionMatrix;
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
  return runParserInIsolatedProcess(parser, config, timeoutMs);
}

function resolveTsNodeRegister(rootDir: string): string {
  const candidates = [
    rootDir,
    path.join(rootDir, 'backend'),
    path.join(rootDir, 'worker'),
    path.join(rootDir, 'e2e'),
  ];
  for (const candidate of candidates) {
    try {
      return require.resolve('ts-node/register/transpile-only', { paths: [candidate] });
    } catch {
      // Try the next workspace.
    }
  }
  throw new Error('Unable to resolve ts-node/register/transpile-only for isolated parser worker.');
}

function parseParserWorkerOutput(output: string): Break[] {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith('__PULSE_PARSER_RESULT__'));
  if (!line) {
    throw new Error('Parser worker exited without a structured result.');
  }
  const payload = JSON.parse(line.replace('__PULSE_PARSER_RESULT__', '')) as
    | { ok: true; breaks: Break[] }
    | { ok: false; error: string };
  if (payload.ok === false) {
    throw new Error(payload.error);
  }
  return payload.breaks;
}

function runParserInIsolatedProcess(
  parser: PulseParserDefinition,
  config: PulseConfig,
  timeoutMs: number,
): Promise<Break[]> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(config.rootDir, 'scripts', 'pulse', 'parser-worker.ts');
    const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
    const startedAt = Date.now();
    const commandArgs = [
      '-r',
      resolveTsNodeRegister(config.rootDir),
      workerPath,
      parser.name,
      '<encoded-config>',
    ];
    const child = spawn(
      process.execPath,
      commandArgs.map((arg) => (arg === '<encoded-config>' ? encodedConfig : arg)),
      {
        cwd: config.rootDir,
        env: {
          ...process.env,
          TS_NODE_PROJECT: path.join(config.rootDir, 'scripts', 'pulse', 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let settled = false;
    let stdout = '';
    let stderr = '';
    const buildDiagnostic = (kind: 'timeout' | 'failure', extra: string): string => {
      const elapsedMs = Date.now() - startedAt;
      return [
        `parser=${parser.name}`,
        `file=${parser.file}`,
        `kind=${kind}`,
        `pid=${child.pid ?? 'unknown'}`,
        `elapsedMs=${elapsedMs}`,
        `timeoutMs=${timeoutMs}`,
        `command=${process.execPath} ${commandArgs.join(' ')}`,
        `stdout=${stdout.trim().slice(-2000) || '<empty>'}`,
        `stderr=${stderr.trim().slice(-2000) || '<empty>'}`,
        extra,
      ].join(' | ');
    };
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          buildDiagnostic(
            'timeout',
            'action=SIGKILL sent to isolated parser worker because the parser exceeded its budget.',
          ),
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        resolve(parseParserWorkerOutput(stdout));
      } catch (error) {
        const detail = stderr.trim()
          ? `${(error as Error).message}: ${stderr.trim()}`
          : (error as Error).message;
        reject(
          new Error(
            buildDiagnostic(
              'failure',
              code === 0 ? `result=${detail}` : `exitCode=${code} | result=${detail}`,
            ),
          ),
        );
      }
    });
  });
}
import "./__companions__/daemon.companion";
