/**
 * PULSE Observability Coverage Engine
 *
 * Static scanner that maps every capability and flow to its observability
 * posture across eight pillars: logs, metrics, tracing, alerts, dashboards,
 * health_probes, error_budget, and sentry.
 *
 * Runs synchronously against the filesystem. Stores its output at
 * `.pulse/current/PULSE_OBSERVABILITY_COVERAGE.json`.
 */

import { safeJoin } from './safe-path';
import { ensureDir, writeTextFile } from './safe-fs';
import { walkFiles } from './parsers/utils';
import { discoverSourceExtensionsFromObservedTypescript } from './dynamic-reality-kernel';
import type { ObservabilityCoverageState } from './types.observability-coverage';
import type {
  CapabilityObservability,
  FlowObservability,
  ObservabilityPillar,
} from './types.observability-coverage';

import {
  loadObservabilityRuntimeContext,
  findPillarByTerm,
  ARTIFACT_FILE_NAME,
} from './observability-coverage/__parts__/core';
import type { ObservabilityRuntimeContext } from './observability-coverage/__parts__/core';

import {
  loadCapabilities,
  buildCapabilityObservability,
  loadFlows,
  detectIntegrationsWithoutObservability,
  detectRuntimeIntegrationsWithoutObservability,
} from './observability-coverage/__parts__/capability-flow';

import { buildFlowObservability } from './observability-coverage/__parts__/normalization';

import { buildTopGaps } from './observability-coverage/__parts__/helpers';

// Public exports from scanner primitives
export { scanForLogging } from './observability-coverage/__parts__/scanner-primitives';
export { scanForStructuredFields } from './observability-coverage/__parts__/scanner-primitives';
export { scanPerFileLogging } from './observability-coverage/__parts__/scanner-primitives';
export { computeLogQuality } from './observability-coverage/__parts__/scanner-primitives';
export { scanForMetrics } from './observability-coverage/__parts__/scanner-primitives';
export { scanForTracing } from './observability-coverage/__parts__/scanner-primitives';
export { scanForErrorTracking } from './observability-coverage/__parts__/scanner-primitives';

// Public exports from capability-flow
export { detectIntegrationsWithoutObservability } from './observability-coverage/__parts__/capability-flow';

function buildSummary(
  capabilityItems: CapabilityObservability[],
  flowItems: FlowObservability[],
  _topGaps: ObservabilityCoverageState['topGaps'],
  runtimeContext: ObservabilityRuntimeContext,
): ObservabilityCoverageState['summary'] {
  const allPerFileEntries = capabilityItems.flatMap((c) => c.details.perFileLogging);
  const uniqueFiles = new Set(allPerFileEntries.map((e) => e.filePath));
  const dedupedEntries = Array.from(uniqueFiles).map(
    (fp) => allPerFileEntries.find((e) => e.filePath === fp)!,
  );
  const alertPillar = findPillarByTerm(runtimeContext.pillars, 'alert');
  const tracingPillar = findPillarByTerm(runtimeContext.pillars, 'tracing');

  return {
    totalCapabilities: capabilityItems.length,
    fullyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'covered').length,
    partiallyCoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'partial')
      .length,
    uncoveredCapabilities: capabilityItems.filter((c) => c.overallStatus === 'uncovered').length,
    totalFlows: flowItems.length,
    fullyCoveredFlows: flowItems.filter((f) => f.overallStatus === 'covered').length,
    criticalCapabilitiesWithoutAlerts: capabilityItems.filter(
      (c) =>
        alertPillar &&
        c.runtimeCritical &&
        c.pillars[alertPillar] === 'missing' &&
        c.overallStatus !== 'covered',
    ).length,
    criticalFlowsWithoutTracing: flowItems.filter(
      (f) =>
        tracingPillar && f.pillars[tracingPillar] === 'missing' && f.overallStatus !== 'covered',
    ).length,
    integrationsWithoutObservability: detectRuntimeIntegrationsWithoutObservability(
      capabilityItems,
      runtimeContext,
    ).length,
    capabilitiesWithComprehensiveLogging: capabilityItems.filter(
      (c) => c.logQuality === 'comprehensive',
    ).length,
    capabilitiesWithAdequateLogging: capabilityItems.filter((c) => c.logQuality === 'adequate')
      .length,
    capabilitiesWithMinimalLogging: capabilityItems.filter((c) => c.logQuality === 'minimal')
      .length,
    capabilitiesWithNoLogging: capabilityItems.filter((c) => c.logQuality === 'none').length,
    filesWithStructuredLogging: dedupedEntries.filter((e) => e.hasStructured).length,
    filesWithConsoleOnly: dedupedEntries.filter((e) => e.hasConsole && !e.hasStructured).length,
    filesWithNoLogging: dedupedEntries.filter((e) => e.noLogging).length,
    filesWithErrorLogging: dedupedEntries.filter((e) => e.hasErrorLogging).length,
    machineImprovementSignals: capabilityItems.reduce(
      (sum, item) => sum + item.machineImprovementSignals.length,
      0,
    ),
  };
}

/**
 * Main entry point. Scans every capability and flow for observability
 * coverage across all eight pillars.
 */
export function buildObservabilityCoverage(rootDir: string): ObservabilityCoverageState {
  const pulseCurrentDir = safeJoin(rootDir, '.pulse', 'current');

  const sourceExts = [...discoverSourceExtensionsFromObservedTypescript()];
  const allFiles: string[] = [
    ...walkFiles(safeJoin(rootDir, 'backend'), sourceExts),
    ...walkFiles(safeJoin(rootDir, 'frontend'), sourceExts),
    ...walkFiles(safeJoin(rootDir, 'worker'), sourceExts),
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
