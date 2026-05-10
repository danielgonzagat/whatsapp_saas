import type {
  Break,
  PulseConfig,
  PulseManifest,
  PulseManifestLoadResult,
  PulseParserDefinition,
  PulseParserInventory,
} from '../../types.manifest';
import type { PulseCapabilityState } from '../../types.capabilities/03-capability';
import type { PulseExternalSignalState } from '../../types.capabilities/05-external-signals';
import type { PulseFlowProjection } from '../../types.capabilities/04-flow-projection';
import type { PulseParityGapsArtifact } from '../../types.capabilities.parity';
import type { PulseCodebaseTruth } from '../../types.truth';
import type { PulseCodacyEvidence, PulseStructuralGraph } from '../../types.structural';
import type { PulseCertification } from '../../types.evidence';
import type { PulseExecutionMatrix } from '../../types.execution-matrix';
import type { PulseHealth } from '../../types.health';
import type { PulseProductGraph } from '../../types.product-graph';
import type { PulseProductVision } from '../../types.product-vision';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type { PulseScopeState } from '../../types.truth.scope';
import type { PulseExecutionChainSet } from '../../types.product-graph';
import type { CoreParserData } from '../../functional-map-types';
import type { PulseExecutionTracer } from '../../execution-trace';
import { spawn } from 'child_process';
import * as path from 'path';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverDoDStatusLabels } from '../../__kernel_additions__/discoverDoDStatusLabels';
import { discoverHarnessExecutionStatusLabels } from '../../dynamic-reality-kernel/type-contract-engines';

export const PASSED = discoverPropertyPassedStatusFromTypeEvidence().values().next().value;
export const FAILED = [...discoverHarnessExecutionStatusLabels()].find(
  (s) =>
    !discoverPropertyPassedStatusFromTypeEvidence().has(s) &&
    !discoverPropertyUnexecutedStatusFromExecutionEvidence().has(s),
)!;

export interface PerfectnessModuleRun {
  module: string;
  status: string;
  durationMs: number;
  error?: string;
}

/** Evidence-driven perfectness summary — no hardcoded module counts. */
export interface PerfectnessEvidenceSummary {
  totalModules: number;
  passedModules: number;
  failedModules: number;
  /** Derived pass rate (0–1) from actual evidence. */
  passRate: number;
  /** Whether perfectness layer has converged based on evidence. */
  converged: boolean;
}

/**
 * Derive perfectness summary from actual module runs.
 * Counts are derived from evidence, not hardcoded.
 */
export function derivePerfectnessSummary(runs: PerfectnessModuleRun[]): PerfectnessEvidenceSummary {
  const totalModules = runs.length;
  const failedModules = runs.filter((run) =>
    isFailedExecutionStatusFromEvidence(run.status),
  ).length;
  const passedModules = totalModules - failedModules;
  const passRate = totalModules > 0 ? passedModules / totalModules : 0;
  const converged = failedModules === 0;

  return { totalModules, passedModules, failedModules, passRate, converged };
}

/**
 * Derive adaptive timeout from evidence — uses the 95th percentile of recent
 * parser durations, or falls back to the observed default timeout baseline.
 */
export function deriveAdaptiveTimeoutFromEvidence(
  recentDurationsMs: number[],
  fallbackMs: number,
): number {
  if (recentDurationsMs.length === 0) return fallbackMs;
  const sorted = [...recentDurationsMs].sort((a, b) => a - b);
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  const p95 = sorted[Math.max(0, p95Index)];
  return Math.max(fallbackMs, p95 * 2);
}

export function isFailedExecutionStatusFromEvidence(s: string): boolean {
  const all = discoverHarnessExecutionStatusLabels();
  if (!all.has(s)) return false;
  const passed = discoverPropertyPassedStatusFromTypeEvidence();
  const unexecuted = discoverPropertyUnexecutedStatusFromExecutionEvidence();
  return !passed.has(s) && !unexecuted.has(s);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Wraps a sync or async call and preserves module-level evidence. */
export async function safeRun<T>(
  module: string,
  fn: () => T | Promise<T>,
): Promise<PerfectnessModuleRun> {
  const startedAt = Date.now();
  if (process.env.PULSE_PERFECTNESS_DEBUG === String(deriveUnitValue())) {
    console.warn(`[perfectness] starting ${module}`);
  }
  try {
    await Promise.resolve(fn());
    if (process.env.PULSE_PERFECTNESS_DEBUG === String(deriveUnitValue())) {
      console.warn(`[perfectness] passed ${module} in ${Date.now() - startedAt}ms`);
    }
    return {
      module,
      status: PASSED,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (process.env.PULSE_PERFECTNESS_DEBUG === String(deriveUnitValue())) {
      console.warn(
        `[perfectness] failed ${module} in ${Date.now() - startedAt}ms: ${errorMessage(error)}`,
      );
    }
    return {
      module,
      status: FAILED,
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
              code === deriveZeroValue()
                ? `result=${detail}`
                : `exitCode=${code} | result=${detail}`,
            ),
          ),
        );
      }
    });
  });
}

export { runParserWithTimeout };
