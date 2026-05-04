import { safeJoin } from '../../safe-path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import { loadObservabilityRuntimeContext } from './runtime-context';
import {
  loadCapabilities,
  loadFlows,
  buildCapabilityObservability,
} from './capability-observability';
import { buildFlowObservability } from './flow-observability';
import { buildTopGaps, buildSummary } from './coverage-detail';
import { ARTIFACT_FILE_NAME } from './types-and-utils';
import type { ObservabilityCoverageState } from '../../types.observability-coverage';

export function buildObservabilityCoverage(rootDir: string): ObservabilityCoverageState {
  const backendDir = safeJoin(rootDir, 'backend');
  const frontendDir = safeJoin(rootDir, 'frontend');
  const workerDir = safeJoin(rootDir, 'worker');
  const pulseCurrentDir = safeJoin(rootDir, '.pulse', 'current');

  const allFiles: string[] = [
    ...walkFiles(backendDir, ['.ts', '.tsx']),
    ...walkFiles(frontendDir, ['.ts', '.tsx']),
    ...walkFiles(workerDir, ['.ts', '.tsx']),
  ];

  const capabilities = loadCapabilities(pulseCurrentDir);
  const runtimeContext = loadObservabilityRuntimeContext(rootDir, pulseCurrentDir);
  const capabilityItems = buildCapabilityObservability(
    rootDir,
    capabilities,
    allFiles,
    runtimeContext,
  );

  const flows = loadFlows(pulseCurrentDir);
  const flowItems = buildFlowObservability(flows, capabilityItems, runtimeContext);

  const topGaps = buildTopGaps(capabilityItems);

  const state: ObservabilityCoverageState = {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(capabilityItems, flowItems, topGaps, runtimeContext),
    capabilities: capabilityItems,
    flows: flowItems,
    topGaps,
  };

  ensureDir(pulseCurrentDir, { recursive: true });
  writeTextFile(safeJoin(pulseCurrentDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}
