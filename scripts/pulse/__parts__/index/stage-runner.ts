import { PulseExecutionTracer, runPhaseWithTrace } from '../../execution-trace';
import { detectConfig } from '../../config';
import { loadParserInventory } from '../../parser-registry';
import { buildStageMetadata, type PulseIndexStageId } from './stage-definitions';

async function runRegisteredStage<T>(
  tracer: PulseExecutionTracer,
  stageId: PulseIndexStageId,
  fn: () => Promise<T> | T,
  options: {
    timeoutMs?: number;
    metadata?: Record<string, string | number | boolean>;
    onTimeout?: () => T | Promise<T>;
  } = {},
): Promise<T> {
  return runPhaseWithTrace(tracer, stageId, fn, {
    ...options,
    metadata: buildStageMetadata(stageId, options.metadata),
  });
}

function deriveFullScanTimeoutMs(
  config: ReturnType<typeof detectConfig>,
  includeParser: ((name: string) => boolean) | undefined,
  parserTimeoutMs: number | undefined,
  phaseTimeoutMs: number | undefined,
): number | undefined {
  if (!parserTimeoutMs || parserTimeoutMs <= 0) {
    return phaseTimeoutMs;
  }
  const parserInventory = loadParserInventory(config, { includeParser });
  const parserBudgetMs = parserInventory.loadedChecks.length * parserTimeoutMs;
  const baseScanOverheadMs = 120_000;
  const unavailableBudgetMs = parserInventory.unavailableChecks.length * 250;
  const dynamicBudgetMs = parserBudgetMs + baseScanOverheadMs + unavailableBudgetMs;
  return Math.max(phaseTimeoutMs ?? 0, dynamicBudgetMs);
}

export { deriveFullScanTimeoutMs, runRegisteredStage };
