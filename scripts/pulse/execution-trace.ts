import { safeJoin, safeResolve } from './safe-path';
import * as os from 'os';
import * as path from 'path';
import { ensureDir, writeTextFile } from './safe-fs';
import type {
  PulseCertificationTarget,
  PulseEnvironment,
  PulseExecutionPhase,
  PulseExecutionPhaseStatus,
  PulseExecutionTrace,
} from './types';

const EXECUTION_TRACE_ARTIFACT = 'PULSE_EXECUTION_TRACE.json';

function nowIso(): string {
  return new Date().toISOString();
}

function resolveLocalPulseStateDir(): string {
  const homeDir = os.homedir();

  if (process.platform === 'darwin') {
    return safeJoin(homeDir, 'Library', 'Application Support', 'Kloel', 'pulse');
  }

  return safeJoin(homeDir, '.kloel', 'pulse');
}

function resolveExecutionTraceWritePath(rootDir: string): string {
  const configuredPath = process.env.PULSE_EXECUTION_TRACE_PATH?.trim();

  if (configuredPath) {
    return path.isAbsolute(configuredPath) ? configuredPath : safeJoin(rootDir, configuredPath);
  }

  if (process.env.CI === 'true') {
    return safeJoin(rootDir, EXECUTION_TRACE_ARTIFACT);
  }

  return safeJoin(resolveLocalPulseStateDir(), EXECUTION_TRACE_ARTIFACT);
}

function buildDefaultSummary(trace: PulseExecutionTrace): string {
  const running = trace.phases.filter((phase) => phase.phaseStatus === 'running').length;
  const failed = trace.phases.filter((phase) => phase.phaseStatus === 'failed').length;
  const timedOut = trace.phases.filter((phase) => phase.phaseStatus === 'timed_out').length;
  const passed = trace.phases.filter((phase) => phase.phaseStatus === 'passed').length;

  if (running > 0) {
    return `Execution in progress: ${passed} passed, ${failed} failed, ${timedOut} timed out, ${running} running.`;
  }
  if (failed > 0 || timedOut > 0) {
    return `Execution completed with issues: ${passed} passed, ${failed} failed, ${timedOut} timed out.`;
  }
  return `Execution completed: ${passed} phase(s) passed.`;
}

/** Pulse execution tracer. */
export class PulseExecutionTracer {
  private readonly artifactPath: string;
  private readonly trace: PulseExecutionTrace;

  constructor(rootDir: string, target?: PulseCertificationTarget, environment?: PulseEnvironment) {
    const timestamp = Date.now();
    const runId = `pulse-${timestamp}`;
    this.artifactPath = resolveExecutionTraceWritePath(rootDir);
    this.trace = {
      runId,
      generatedAt: nowIso(),
      updatedAt: nowIso(),
      environment,
      certificationTarget: target,
      phases: [],
      summary: 'Execution trace initialized.',
      artifactPaths: [EXECUTION_TRACE_ARTIFACT],
    };
    this.flush();
  }

  /** Set context. */
  setContext(target?: PulseCertificationTarget, environment?: PulseEnvironment): void {
    if (target) {
      this.trace.certificationTarget = target;
    }
    if (environment) {
      this.trace.environment = environment;
    }
    this.trace.updatedAt = nowIso();
    this.trace.summary = buildDefaultSummary(this.trace);
    this.flush();
  }

  /** Start phase. */
  startPhase(phase: string, metadata?: Record<string, string | number | boolean>): void {
    const entry: PulseExecutionPhase = {
      phase,
      phaseStatus: 'running',
      startedAt: nowIso(),
      metadata,
    };
    this.trace.phases.push(entry);
    this.trace.updatedAt = nowIso();
    this.trace.summary = buildDefaultSummary(this.trace);
    this.flush();
  }

  /** Finish phase. */
  finishPhase(
    phase: string,
    status: Exclude<PulseExecutionPhaseStatus, 'running'>,
    extra: {
      errorSummary?: string;
      metadata?: Record<string, string | number | boolean>;
    } = {},
  ): void {
    const entry = [...this.trace.phases]
      .reverse()
      .find((item) => item.phase === phase && item.phaseStatus === 'running');
    const finishedAt = nowIso();

    if (!entry) {
      this.trace.phases.push({
        phase,
        phaseStatus: status,
        startedAt: finishedAt,
        finishedAt,
        durationMs: 0,
        errorSummary: extra.errorSummary,
        metadata: extra.metadata,
      });
    } else {
      entry.phaseStatus = status;
      entry.finishedAt = finishedAt;
      entry.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(entry.startedAt));
      if (extra.errorSummary) {
        entry.errorSummary = extra.errorSummary;
      }
      if (extra.metadata) {
        entry.metadata = {
          ...(entry.metadata || {}),
          ...extra.metadata,
        };
      }
    }

    this.trace.updatedAt = finishedAt;
    this.trace.summary = buildDefaultSummary(this.trace);
    this.flush();
  }

  /** Get snapshot. */
  getSnapshot(): PulseExecutionTrace {
    return JSON.parse(JSON.stringify(this.trace)) as PulseExecutionTrace;
  }

  /** Get artifact path. */
  getArtifactPath(): string {
    return this.artifactPath;
  }

  private flush(): void {
    ensureDir(path.dirname(this.artifactPath), { recursive: true });
    writeTextFile(this.artifactPath, JSON.stringify(this.trace, null, 2));
  }
}

/** Run phase with trace. */
export async function runPhaseWithTrace<T>(
  tracer: PulseExecutionTracer,
  phase: string,
  fn: () => Promise<T> | T,
  options: {
    timeoutMs?: number;
    metadata?: Record<string, string | number | boolean>;
    onTimeout?: () => T | Promise<T>;
  } = {},
): Promise<T> {
  tracer.startPhase(phase, options.metadata);

  const timeoutMs = options.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0) {
    try {
      const result = await fn();
      tracer.finishPhase(phase, 'passed');
      return result;
    } catch (error: any) {
      tracer.finishPhase(phase, 'failed', {
        errorSummary: String(error?.message || error || 'Unknown execution failure'),
      });
      throw error;
    }
  }

  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Phase "${phase}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    tracer.finishPhase(phase, 'passed');
    return result;
  } catch (error: any) {
    const message = String(error?.message || error || 'Unknown execution failure');
    if (message.includes('timed out after')) {
      tracer.finishPhase(phase, 'timed_out', { errorSummary: message });
      if (options.onTimeout) {
        return options.onTimeout();
      }
    } else {
      tracer.finishPhase(phase, 'failed', { errorSummary: message });
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/** Get execution trace artifact name. */
export function getExecutionTraceArtifactName(): string {
  return EXECUTION_TRACE_ARTIFACT;
}
