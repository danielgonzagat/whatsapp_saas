import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ObservabilityCoverageState } from '../../types.observability-coverage';
import {
  buildCapabilityObservability,
  detectIntegrationsWithoutObservability,
  detectRuntimeIntegrationsWithoutObservability,
  loadCapabilities,
  loadFlows,
} from './capability-flow';
import { loadObservabilityRuntimeContext } from './core';
import { buildTopGaps } from './helpers';
import { buildFlowObservability } from './normalization';

function discoverObservableSourceFiles(rootDir: string): string[] {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

export function buildObservabilityCoverage(rootDir: string): ObservabilityCoverageState {
  const pulseCurrentDir = path.join(rootDir, '.pulse', 'current');
  const runtimeContext = loadObservabilityRuntimeContext(rootDir, pulseCurrentDir);
  const capabilities = loadCapabilities(pulseCurrentDir);
  const flows = loadFlows(pulseCurrentDir);
  const sourceFiles = discoverObservableSourceFiles(rootDir);
  const capabilityItems = buildCapabilityObservability(
    rootDir,
    capabilities,
    sourceFiles,
    runtimeContext,
  );
  const flowItems = buildFlowObservability(flows, capabilityItems, runtimeContext);
  const integrationsWithoutObservability = new Set([
    ...detectIntegrationsWithoutObservability(capabilityItems),
    ...detectRuntimeIntegrationsWithoutObservability(capabilityItems, runtimeContext),
  ]);
  const perFileLogging = capabilityItems.flatMap((capability) => capability.details.perFileLogging);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: capabilityItems.length,
      fullyCoveredCapabilities: capabilityItems.filter((item) => item.overallStatus === 'covered')
        .length,
      partiallyCoveredCapabilities: capabilityItems.filter(
        (item) => item.overallStatus === 'partial',
      ).length,
      uncoveredCapabilities: capabilityItems.filter((item) => item.overallStatus === 'uncovered')
        .length,
      totalFlows: flowItems.length,
      fullyCoveredFlows: flowItems.filter((item) => item.overallStatus === 'covered').length,
      criticalCapabilitiesWithoutAlerts: capabilityItems.filter(
        (item) => item.runtimeCritical && item.pillars.alerts === 'missing',
      ).length,
      criticalFlowsWithoutTracing: flowItems.filter((item) => item.pillars.tracing === 'missing')
        .length,
      integrationsWithoutObservability: integrationsWithoutObservability.size,
      capabilitiesWithComprehensiveLogging: capabilityItems.filter(
        (item) => item.logQuality === 'comprehensive',
      ).length,
      capabilitiesWithAdequateLogging: capabilityItems.filter(
        (item) => item.logQuality === 'adequate',
      ).length,
      capabilitiesWithMinimalLogging: capabilityItems.filter(
        (item) => item.logQuality === 'minimal',
      ).length,
      capabilitiesWithNoLogging: capabilityItems.filter((item) => item.logQuality === 'none')
        .length,
      filesWithStructuredLogging: perFileLogging.filter((item) => item.hasStructured).length,
      filesWithConsoleOnly: perFileLogging.filter((item) => item.hasConsole && !item.hasStructured)
        .length,
      filesWithNoLogging: perFileLogging.filter((item) => item.noLogging).length,
      filesWithErrorLogging: perFileLogging.filter((item) => item.hasErrorLogging).length,
      machineImprovementSignals: capabilityItems.reduce(
        (total, item) => total + item.machineImprovementSignals.length,
        0,
      ),
    },
    capabilities: capabilityItems,
    flows: flowItems,
    topGaps: buildTopGaps(capabilityItems),
  };
}
