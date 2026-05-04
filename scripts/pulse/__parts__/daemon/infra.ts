import type { PulseConfig, PulseParserDefinition } from '../../types';

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

export { errorMessage, safeRun };
export type { PerfectnessModuleRun };
