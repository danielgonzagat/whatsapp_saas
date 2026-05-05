/**
 * PULSE Observability Coverage Engine — Capability & Flow Layer
 *
 * Integrations detection, capability/flow loading, capability
 * observability construction, and pillar evidence scanning.
 */

import { safeJoin, safeResolve } from '../../safe-path';
import { pathExists, readJsonFile } from '../../safe-fs';
import { readFileSafe } from '../../parsers/utils';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import type {
  CapabilityObservability,
  ObservabilityPillar,
  ObservabilityStatus,
  ObservabilityPillarEvidence,
} from '../../types.observability-coverage';
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
} from '../../types.capabilities';
import {
  resolveCapabilityFiles,
  toRepoRelativePath,
  findPillarByTerm,
  statusForDerivedPillar,
  missingEvidence,
  signalMatchesPillar,
  observabilitySignalForPillar,
  UNTRUSTED_PRESENT_KINDS,
} from './core';
import type { PillarScanResult, ObservabilityRuntimeContext } from './core';
import {
  scanForLoggingEvidence,
  scanForMetricsEvidence,
  scanForTracingEvidence,
  scanForErrorTrackingEvidence,
  scanForStructuredFields,
  scanPerFileLogging,
  computeLogQuality,
} from './scanner-primitives';
import {
  scanForAlertsEvidence,
  findDashboardEvidence,
  findHealthEndpointEvidence,
  findErrorBudgetEvidence,
  normalizePillarEvidence,
  computeOverallStatus,
} from './normalization';
import {
  countLogCalls,
  findMetricNames,
  countTraceSpans,
  countAlertRules,
  findDashboardUrls,
} from './helpers';

export function detectIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
): string[] {
  return capabilities
    .filter(
      (cap) =>
        cap.details.matchedFilePaths.length === 0 &&
        cap.overallStatus !== 'covered' &&
        cap.untrustedEvidencePillars.length > deriveZeroValue(),
    )
    .map((cap) => cap.capabilityId);
}

export function detectRuntimeIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): string[] {
  return capabilities
    .filter((cap) => {
      const hasExternalCall = cap.details.matchedFilePaths.some((filePath) => {
        const absolutePath = safeResolve(filePath);
        const nodes = runtimeContext.behaviorNodesByFile.get(absolutePath) ?? [];
        return nodes.some((node) => node.externalCalls.length > deriveZeroValue());
      });
      const hasObservability = cap.overallStatus === 'covered' || cap.overallStatus === 'partial';
      return hasExternalCall && !hasObservability;
    })
    .map((cap) => cap.capabilityId);
}

export function loadCapabilities(pulseCurrentDir: string): PulseCapability[] {
  const statePath = safeJoin(
    pulseCurrentDir,
    discoverAllObservedArtifactFilenames().capabilityState,
  );
  if (!pathExists(statePath)) return [];
  try {
    const state = readJsonFile<PulseCapabilityState>(statePath);
    return state.capabilities ?? [];
  } catch {
    return [];
  }
}

export function loadFlows(pulseCurrentDir: string): PulseFlowProjectionItem[] {
  const statePath = safeJoin(
    pulseCurrentDir,
    discoverAllObservedArtifactFilenames().flowProjection,
  );
  if (!pathExists(statePath)) return [];
  try {
    const state = readJsonFile<PulseFlowProjection>(statePath);
    return state.flows ?? [];
  } catch {
    return [];
  }
}

export function buildCapabilityObservability(
  rootDir: string,
  capabilities: PulseCapability[],
  allFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): CapabilityObservability[] {
  const fileCache = new Map<string, string>();
  const allFileSet = new Set(allFiles.map((filePath) => safeResolve(filePath)));

  function getContent(filePath: string): string {
    if (!fileCache.has(filePath)) {
      fileCache.set(filePath, readFileSafe(filePath));
    }
    return fileCache.get(filePath)!;
  }

  return capabilities.map((cap) => {
    const relevantFiles = resolveCapabilityFiles(rootDir, cap.filePaths, allFileSet);
    const evidence = Object.fromEntries(
      runtimeContext.pillars.map((pillar) => [
        pillar,
        normalizePillarEvidence(
          cap.id,
          pillar,
          scanPillarEvidence(cap, pillar, relevantFiles, runtimeContext),
          rootDir,
        ),
      ]),
    ) as Record<ObservabilityPillar, ObservabilityPillarEvidence>;

    const pillars = Object.fromEntries(
      (Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>).map(
        ([pillar, item]) => [pillar, item.status],
      ),
    ) as Record<ObservabilityPillar, ObservabilityStatus>;

    const structuredLogFields = scanForStructuredFields(relevantFiles, getContent);
    const perFileLogging = scanPerFileLogging(relevantFiles, getContent).map((entry) => ({
      ...entry,
      filePath: toRepoRelativePath(rootDir, entry.filePath),
    }));
    const healthProbePillar = findPillarByTerm(runtimeContext.pillars, 'health probe');
    const healthProbeEvidence = healthProbePillar ? evidence[healthProbePillar] : null;

    const detail = {
      matchedFilePaths: relevantFiles.map((filePath) => toRepoRelativePath(rootDir, filePath)),
      logCount: countLogCalls(relevantFiles, getContent),
      metricNames: findMetricNames(relevantFiles, getContent),
      traceSpans: countTraceSpans(relevantFiles, getContent),
      alertRules: countAlertRules(relevantFiles, getContent),
      dashboardUrls: findDashboardUrls(relevantFiles, getContent),
      healthProbeUrl:
        healthProbeEvidence?.status === 'observed'
          ? healthProbeEvidence.source.replace(/^health endpoint /, '')
          : null,
      errorBudgetRemaining: null,
      sentryProjectId: null,
      structuredLogFields,
      perFileLogging,
    };

    const overallStatus = computeOverallStatus(pillars);

    const logQuality = computeLogQuality(
      statusForDerivedPillar(pillars, runtimeContext.pillars, 'logs'),
      statusForDerivedPillar(pillars, runtimeContext.pillars, 'tracing'),
      statusForDerivedPillar(pillars, runtimeContext.pillars, 'sentry'),
      structuredLogFields.length,
    );

    const trustedObservedPillars = (
      Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>
    )
      .filter(([, item]) => item.observed)
      .map(([pillar]) => pillar);

    const untrustedEvidencePillars = (
      Object.entries(evidence) as Array<[ObservabilityPillar, ObservabilityPillarEvidence]>
    )
      .filter(([, item]) => UNTRUSTED_PRESENT_KINDS.has(item.sourceKind))
      .map(([pillar]) => pillar);
    const machineImprovementSignals = (
      Object.values(evidence) as ObservabilityPillarEvidence[]
    ).flatMap((item) => (item.machineImprovementSignal ? [item.machineImprovementSignal] : []));

    return {
      capabilityId: cap.id,
      capabilityName: cap.name,
      runtimeCritical: cap.runtimeCritical,
      pillars,
      evidence,
      details: detail,
      overallStatus,
      logQuality,
      trustedObservedPillars,
      untrustedEvidencePillars,
      criticalObservedByUntrustedSource: false,
      machineImprovementSignals,
    };
  });
}

export function scanPillarEvidence(
  capability: PulseCapability,
  pillar: ObservabilityPillar,
  relevantFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult {
  if (pillar === 'error_budget' && !capability.runtimeCritical) {
    return {
      status: 'not_applicable',
      sourceKind: 'not_applicable',
      source: 'non-runtime-critical capability',
      reason: 'Error budget evidence is not required for non-runtime-critical capabilities.',
      filePaths: [],
    };
  }

  const runtimeSignalEvidence = findRuntimeSignalEvidence(capability.id, pillar, runtimeContext);
  if (runtimeSignalEvidence) return runtimeSignalEvidence;

  const behaviorGraphEvidence = findBehaviorGraphEvidence(pillar, relevantFiles, runtimeContext);
  if (behaviorGraphEvidence) return behaviorGraphEvidence;

  const artifactSignal = observabilitySignalForPillar(runtimeContext.observabilityEvidence, pillar);
  if (artifactSignal) {
    return {
      status: 'partial',
      sourceKind: 'configuration',
      source: `observability artifact signal ${artifactSignal}`,
      reason:
        'The shared observability artifact contains this signal, but it is not scoped to the capability.',
      filePaths: [],
    };
  }

  const runtimeProbeEvidence = findRuntimeProbeEvidence(pillar, runtimeContext);
  if (runtimeProbeEvidence) return runtimeProbeEvidence;

  return scanStaticPillarEvidence(pillar, relevantFiles);
}

export function findRuntimeSignalEvidence(
  capabilityId: string,
  pillar: ObservabilityPillar,
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const matchingSignals = (
    runtimeContext.runtimeSignalsByCapability.get(capabilityId) ?? []
  ).filter(
    (signal) =>
      signal.evidenceMode !== 'simulated' &&
      (signalMatchesPillar(signal.source, pillar) ||
        signalMatchesPillar(signal.type, pillar) ||
        signalMatchesPillar(signal.evidenceKind, pillar) ||
        signalMatchesPillar(signal.message, pillar)),
  );
  const observedSignals = matchingSignals.filter((signal) => signal.evidenceMode === 'observed');
  const signal = observedSignals[0] ?? matchingSignals[0];
  if (!signal) return null;

  return {
    status: signal.evidenceMode === 'observed' ? 'observed' : 'partial',
    sourceKind: signal.evidenceMode === 'observed' ? 'runtime_observed' : 'configuration',
    source: `runtime fusion signal ${signal.id}`,
    reason: signal.message,
    filePaths: signal.affectedFilePaths,
  };
}

export function findBehaviorGraphEvidence(
  pillar: ObservabilityPillar,
  relevantFiles: string[],
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const graphFlag = `has${pillar
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
  const observedFiles: string[] = [];

  for (const filePath of relevantFiles) {
    const nodes = runtimeContext.behaviorNodesByFile.get(filePath) ?? [];
    if (
      nodes.some((node) => {
        const nodeRecord = node as unknown as Record<string, unknown>;
        return nodeRecord[graphFlag] === true;
      })
    ) {
      observedFiles.push(filePath);
    }
  }

  if (observedFiles.length === 0) return null;
  return {
    status: 'observed',
    sourceKind: 'static_instrumentation',
    source: `behavior graph ${graphFlag}`,
    reason: 'The behavior graph reports capability-owned nodes with this observability signal.',
    filePaths: observedFiles,
  };
}

export function findRuntimeProbeEvidence(
  pillar: ObservabilityPillar,
  runtimeContext: ObservabilityRuntimeContext,
): PillarScanResult | null {
  const probes = runtimeContext.runtimeEvidence?.probes ?? [];
  const matchingProbe = probes.find(
    (probe) =>
      probe.executed &&
      probe.status === 'passed' &&
      (signalMatchesPillar(probe.probeId, pillar) ||
        signalMatchesPillar(probe.target, pillar) ||
        signalMatchesPillar(probe.summary, pillar)),
  );
  if (!matchingProbe) return null;
  return {
    status: 'partial',
    sourceKind: 'configuration',
    source: `runtime probe ${matchingProbe.probeId}`,
    reason:
      'A runtime probe produced matching evidence, but the probe artifact is not scoped to this capability.',
    filePaths: [],
  };
}

export function scanStaticPillarEvidence(
  pillar: ObservabilityPillar,
  relevantFiles: string[],
): PillarScanResult {
  if (pillar === 'logs') return scanForLoggingEvidence(relevantFiles);
  if (pillar === 'metrics') return scanForMetricsEvidence(relevantFiles);
  if (pillar === 'tracing') return scanForTracingEvidence(relevantFiles);
  if (pillar === 'alerts') return scanForAlertsEvidence(relevantFiles);
  if (pillar === 'dashboards') return findDashboardEvidence(relevantFiles);
  if (pillar === 'health_probes') return findHealthEndpointEvidence(relevantFiles);
  if (pillar === 'error_budget') return findErrorBudgetEvidence(relevantFiles);
  if (pillar === 'sentry') return scanForErrorTrackingEvidence(relevantFiles);
  return missingEvidence(`No scanner is registered for observability pillar ${pillar}.`);
}
