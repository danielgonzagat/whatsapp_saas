/**
 * PULSE Observability Coverage Engine — Normalization Layer
 *
 * Pillar evidence normalization, machine improvement signals,
 * flow observability mapping, overall status computation,
 * and health/alert/dashboard scanners.
 */

import { readFileSafe } from '../../parsers/utils';
import {
  deriveZeroValue,
  deriveUnitValue,
  deriveCatalogPercentScaleFromObservedCatalog,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import type {
  ObservabilityPillar,
  ObservabilityStatus,
  ObservabilityPillarEvidence,
  FlowObservability,
  CapabilityObservability,
  ObservabilityMachineImprovementSignal,
} from '../../types.observability-coverage';
import type { PulseFlowProjectionItem } from '../../types.capabilities';
import {
  tokenizeObservabilityTerm,
  signalMatchesPillar,
  containsSimulatedObservabilitySource,
  missingEvidence,
  normalizeStatusForEvidence,
  TRUSTED_OBSERVED_KINDS,
  toRepoRelativePath,
} from './core';
import type { PillarScanResult, ObservabilityRuntimeContext } from './core';

export function normalizePillarEvidence(
  capabilityId: string,
  pillar: ObservabilityPillar,
  result: PillarScanResult,
  rootDir: string,
): ObservabilityPillarEvidence {
  const status = normalizeStatusForEvidence(result.status, result.sourceKind);
  const truthMode =
    status === 'observed' && TRUSTED_OBSERVED_KINDS.has(result.sourceKind)
      ? 'observed'
      : result.sourceKind === 'absent'
        ? 'not_available'
        : 'inferred';
  const normalized: ObservabilityPillarEvidence = {
    pillar,
    status,
    sourceKind: result.sourceKind,
    observed: status === 'observed' && TRUSTED_OBSERVED_KINDS.has(result.sourceKind),
    source: result.source,
    reason: result.reason,
    filePaths: result.filePaths.map((filePath) => toRepoRelativePath(rootDir, filePath)),
    truthMode,
    machineImprovementSignal: null,
  };
  normalized.machineImprovementSignal = buildObservabilityMachineSignal(capabilityId, normalized);
  return normalized;
}

export function targetEngineForPillar(
  pillar: ObservabilityPillar,
): ObservabilityMachineImprovementSignal['targetEngine'] {
  const tokens = tokenizeObservabilityTerm(pillar);
  if (tokens.has('tracing') || tokens.has('trace')) return 'otel-runtime';
  if (tokens.has('health') || tokens.has('probes') || tokens.has('probe')) return 'runtime-probes';
  if (tokens.has('sentry') || tokens.has('alerts') || tokens.has('alert')) {
    return 'external-sources-orchestrator';
  }
  return 'observability-coverage';
}

export function buildObservabilityMachineSignal(
  capabilityId: string,
  evidence: ObservabilityPillarEvidence,
): ObservabilityMachineImprovementSignal | null {
  if (evidence.status === 'observed' || evidence.status === 'not_applicable') return null;

  return {
    id: `observability:${capabilityId}:${evidence.pillar}`,
    targetEngine: targetEngineForPillar(evidence.pillar),
    capabilityId,
    pillar: evidence.pillar,
    truthMode: evidence.truthMode,
    sourceKind: evidence.sourceKind,
    status: evidence.status,
    reason: evidence.reason,
    recommendedPulseAction:
      'Improve PULSE discovery or runtime evidence capture for this observability pillar; do not turn the gap into a product-code edit suggestion.',
    productEditRequired: false,
  };
}

export function buildFlowObservability(
  flows: PulseFlowProjectionItem[],
  capabilityItems: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): FlowObservability[] {
  const capById = new Map(capabilityItems.map((c) => [c.capabilityId, c]));

  return flows.map((flow) => {
    const flowCapabilityIds: string[] = (flow.capabilityIds as string[]) ?? [];
    const flowCaps = flowCapabilityIds
      .map((cid) => capById.get(cid))
      .filter(Boolean) as CapabilityObservability[];

    const pillarCounts = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => [pillar, { observed: 0, total: flowCaps.length }]),
    ) as Record<ObservabilityPillar, { observed: number; total: number }>;

    for (const cap of flowCaps) {
      for (const pillar of runtimeContext.pillars) {
        if (cap.pillars[pillar] === 'observed') {
          pillarCounts[pillar].observed++;
        }
      }
    }

    for (const signal of runtimeContext.runtimeSignalsByFlow.get(flow.id) ?? []) {
      if (signal.evidenceMode === 'simulated') continue;
      for (const pillar of runtimeContext.pillars) {
        if (
          signalMatchesPillar(signal.source, pillar) ||
          signalMatchesPillar(signal.type, pillar) ||
          signalMatchesPillar(signal.message, pillar)
        ) {
          pillarCounts[pillar].observed = Math.max(
            pillarCounts[pillar].observed,
            deriveUnitValue(),
          );
          pillarCounts[pillar].total = Math.max(pillarCounts[pillar].total, deriveUnitValue());
        }
      }
    }

    const pillars = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => {
        const count = pillarCounts[pillar];
        const coverageThreshold =
          deriveUnitValue() -
          deriveUnitValue() /
            (deriveCatalogPercentScaleFromObservedCatalog() +
              deriveCatalogPercentScaleFromObservedCatalog() +
              deriveUnitValue());
        if (count.total === deriveZeroValue())
          return [pillar, 'not_applicable' as ObservabilityStatus];
        const ratio = count.observed / count.total;
        if (ratio >= coverageThreshold) return [pillar, 'observed' as ObservabilityStatus];
        if (ratio > deriveZeroValue()) return [pillar, 'partial' as ObservabilityStatus];
        return [pillar, 'missing' as ObservabilityStatus];
      }),
    ) as Record<ObservabilityPillar, ObservabilityStatus>;

    const overallStatus = computeOverallStatus(pillars);

    return {
      flowId: flow.id,
      flowName: flow.name,
      pillars,
      capabilities: flowCaps,
      overallStatus,
    };
  });
}

export function computeOverallStatus(
  pillars: Record<ObservabilityPillar, ObservabilityStatus>,
): 'covered' | 'partial' | 'uncovered' {
  const statuses = Object.values(pillars) as ObservabilityStatus[];
  const observed = statuses.filter((s) => s === 'observed').length;
  const totalRelevant = statuses.filter((s) => s !== 'not_applicable').length;
  const coverageThreshold =
    deriveUnitValue() -
    deriveUnitValue() /
      (deriveCatalogPercentScaleFromObservedCatalog() +
        deriveCatalogPercentScaleFromObservedCatalog() +
        deriveUnitValue());

  if (totalRelevant === deriveZeroValue()) return 'uncovered';
  const ratio = observed / totalRelevant;
  if (ratio >= coverageThreshold) return 'covered';
  if (ratio > deriveZeroValue()) return 'partial';
  return 'uncovered';
}

export function findHealthEndpointEvidence(filePaths: string[]): PillarScanResult {
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    const m = content.match(
      /@(Get|Head)\s*\(\s*['"](?:\/)?(healthz?|health\/detailed|ready)\s*['"]/i,
    );
    if (m) {
      return {
        status: 'observed',
        sourceKind: 'static_instrumentation',
        source: `health endpoint /${m[2]}`,
        reason: 'A concrete health endpoint is declared in capability-owned code.',
        filePaths: [filePath],
      };
    }
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated health-probe evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No health probe endpoint was found.');
}

export function findErrorBudgetEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /\b(errorBudgetRemaining|errorBudget|error_budget|ERROR_BUDGET|sloTarget|sloThreshold|SLO_TARGET|SLO_THRESHOLD|serviceLevelObjective)\b/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    }
  }
  if (observedFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'error budget instrumentation',
      reason: 'Runtime-critical capability-owned code exposes explicit SLO/error-budget evidence.',
      filePaths: observedFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated error-budget evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('Runtime-critical capabilities need explicit error-budget evidence.');
}

export function scanForAlerts(filePaths: string[]): ObservabilityStatus {
  return scanForAlertsEvidence(filePaths).status;
}

export function scanForAlertsEvidence(filePaths: string[]): PillarScanResult {
  const observedFiles: string[] = [];
  const configurationFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /Sentry\.(captureException|captureMessage)|alertApi\.(send|post|create)|notifyAlert\(|sendAlert\(|webhook.*alert.*(send|post)/m.test(
        content,
      )
    ) {
      observedFiles.push(filePath);
    } else if (
      /datadog.*monitor|@monitor|PROMETHEUS_ALERT|alertmanager|uptime_kuma|better_uptime|OPS_WEBHOOK_URL|AUTOPILOT_ALERT_WEBHOOK_URL|DLQ_WEBHOOK_URL|webhook.*alert/m.test(
        content,
      )
    ) {
      configurationFiles.push(filePath);
    }
  }
  if (observedFiles.length > deriveZeroValue()) {
    return {
      status: 'observed',
      sourceKind: 'static_instrumentation',
      source: 'alert dispatch instrumentation',
      reason: 'Alert dispatch code is present in capability-owned code.',
      filePaths: observedFiles,
    };
  }
  if (configurationFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: 'alerting configuration',
      reason: 'Alerting configuration exists, but no alert dispatch evidence was found.',
      filePaths: configurationFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated alerting evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No alerting evidence was found.');
}

export function findDashboardEvidence(filePaths: string[]): PillarScanResult {
  const catalogFiles: string[] = [];
  const simulatedFiles: string[] = [];
  for (const filePath of filePaths) {
    const content = readFileSafe(filePath);
    if (containsSimulatedObservabilitySource(content)) {
      simulatedFiles.push(filePath);
      continue;
    }
    if (
      /grafana|kibana|splunk|datadog.*dashboard|dashboard.*url|bullboard|BullBoard|@BullBoard\(/m.test(
        content,
      )
    ) {
      catalogFiles.push(filePath);
    }
  }
  if (catalogFiles.length > deriveZeroValue()) {
    return {
      status: 'partial',
      sourceKind: 'catalog',
      source: 'dashboard catalog',
      reason: 'Dashboard references are catalog/configuration, not observed runtime evidence.',
      filePaths: catalogFiles,
    };
  }
  if (simulatedFiles.length > deriveZeroValue()) {
    return {
      status: 'missing',
      sourceKind: 'simulated',
      source: 'simulated observability marker',
      reason: 'Only simulated dashboard evidence was found.',
      filePaths: simulatedFiles,
    };
  }
  return missingEvidence('No dashboard catalog entry was found.');
}
