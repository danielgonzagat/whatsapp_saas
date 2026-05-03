import * as p from 'path';
import { pathExists as existsAt, writeTextFile, ensureDir } from '../../safe-fs';
import type { RuntimeFusionState, RuntimeSignal } from '../../types.runtime-fusion';
import { unique } from '../../signal-normalizers';
import { bound01 } from './math-helpers';
import {
  mapSignalToCapabilities,
  mapSignalToFlows,
  mapCapabilitiesFromFlows,
} from './capability-mapping';
import { loadCanonicalExternalSignals } from './external-signal-parser';
import { loadRuntimeTraceEvidence } from './otel-signal-extractor';
import {
  safeJsonParseFile,
  syncAffectedAliases,
  resolvePulseCurrentDir,
  emptySourceCounts,
} from './json-parsing';
import { isCriticalSignal, isHighSignal } from './signal-semantics';
import { buildMachineImprovementSignals } from './machine-improvement';
import { FUSION_OUTPUT_FILE } from './constants';
import {
  computeImpactScore,
  normalizeImpactByRuntimeReality,
  overridePriorities,
} from './impact-priorities';

export function buildRuntimeFusionState(rootDir: string): RuntimeFusionState {
  let currentDir = resolvePulseCurrentDir(rootDir);
  let externalSignals = loadCanonicalExternalSignals(currentDir);
  let runtimeTraces = loadRuntimeTraceEvidence(currentDir);
  let allSignals: RuntimeSignal[] = [...externalSignals.signals, ...runtimeTraces.signals];

  let capabilityStatePath = p.join(currentDir, 'PULSE_CAPABILITY_STATE.json');
  let capabilityPayload = safeJsonParseFile(capabilityStatePath);
  let capabilityState = capabilityPayload
    ? (capabilityPayload as unknown as {
        capabilities?: Array<{ id: string; name: string; filePaths?: string[] }>;
      })
    : undefined;
  let flowProjectionPath = p.join(currentDir, 'PULSE_FLOW_PROJECTION.json');
  let flowProjectionPayload = safeJsonParseFile(flowProjectionPath);
  let flowProjection = flowProjectionPayload
    ? (flowProjectionPayload as unknown as {
        flows?: Array<{
          id: string;
          name: string;
          capabilityIds?: string[];
          routePatterns?: string[];
        }>;
      })
    : undefined;

  for (let signal of allSignals) {
    let mapped = mapSignalToCapabilities(signal, capabilityState);
    signal.affectedCapabilityIds = unique([...signal.affectedCapabilityIds, ...mapped]);
    let mappedFlows = mapSignalToFlows(signal, flowProjection);
    signal.affectedFlowIds = unique([...signal.affectedFlowIds, ...mappedFlows]);
    signal.affectedCapabilityIds = unique([
      ...signal.affectedCapabilityIds,
      ...mapCapabilitiesFromFlows(signal, flowProjection),
    ]);
    signal.impactScore = normalizeImpactByRuntimeReality(
      signal,
      Math.max(bound01(signal.impactScore), computeImpactScore(signal)),
      allSignals,
    );
    signal.confidence = bound01(signal.confidence);
    syncAffectedAliases(signal);
  }

  let convergencePlanPath = p.join(currentDir, 'PULSE_CONVERGENCE_PLAN.json');
  let convergencePayload = safeJsonParseFile(convergencePlanPath);
  let convergencePlan = convergencePayload
    ? (convergencePayload as unknown as {
        priorities?: Record<string, string>;
        units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
      })
    : undefined;

  let summary = buildSummary(allSignals, capabilityState);

  let state: RuntimeFusionState = {
    generatedAt: new Date().toISOString(),
    signals: allSignals,
    summary,
    evidence: {
      externalSignalState: externalSignals.evidence,
      runtimeTraces: runtimeTraces.evidence,
    },
    priorityOverrides: [],
    machineImprovementSignals: buildMachineImprovementSignals(
      externalSignals.evidence,
      runtimeTraces.evidence,
    ),
  };

  state = overridePriorities(state, convergencePlan);

  if (!existsAt(currentDir)) {
    ensureDir(currentDir, { recursive: true });
  }
  writeTextFile(p.join(currentDir, FUSION_OUTPUT_FILE), JSON.stringify(state, null, 2));

  return state;
}

function buildSummary(
  signals: RuntimeSignal[],
  capabilityState?: { capabilities?: Array<{ id: string }> },
): RuntimeFusionState['summary'] {
  let totalSignals = signals.length;
  let criticalSignals = signals.filter(isCriticalSignal).length;
  let highSignals = signals.filter(isHighSignal).length;
  let blockMergeSignals = signals.filter(
    (s) => s.action === 'block_merge' || s.action === 'block_deploy',
  ).length;
  let blockDeploySignals = signals.filter((s) => s.action === 'block_deploy').length;

  let sourceCounts = emptySourceCounts();
  for (let s of signals) {
    sourceCounts[s.source] = (sourceCounts[s.source] ?? 0) + 1;
  }

  let signalsByCapability: Record<string, number> = {};
  let signalsByFlow: Record<string, number> = {};
  let capImpactAccum: Record<string, number> = {};
  let flowImpactAccum: Record<string, number> = {};

  for (let s of signals) {
    for (let capId of s.affectedCapabilityIds) {
      signalsByCapability[capId] = (signalsByCapability[capId] ?? 0) + 1;
      capImpactAccum[capId] = (capImpactAccum[capId] ?? 0) + s.impactScore;
    }
    for (let flowId of s.affectedFlowIds) {
      signalsByFlow[flowId] = (signalsByFlow[flowId] ?? 0) + 1;
      flowImpactAccum[flowId] = (flowImpactAccum[flowId] ?? 0) + s.impactScore;
    }
  }

  let topImpactCapabilities = Object.entries(capImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, observedExtent(capImpactAccum))
    .map(([capabilityId, impactScore]) => ({ capabilityId, impactScore }));

  let topImpactFlows = Object.entries(flowImpactAccum)
    .sort(([, a], [, b]) => b - a)
    .slice(0, observedExtent(flowImpactAccum))
    .map(([flowId, impactScore]) => ({ flowId, impactScore }));

  return {
    totalSignals,
    criticalSignals,
    highSignals,
    blockMergeSignals,
    blockDeploySignals,
    sourceCounts,
    signalsByCapability,
    signalsByFlow,
    topImpactCapabilities,
    topImpactFlows,
  };
}

function observedExtent(values: Record<string, number>): number {
  let size = Object.keys(values).length;
  let nonEmptySize = Math.max(Math.sign(size), size);
  return Math.max(
    Math.sign(nonEmptySize),
    Math.ceil(Math.sqrt(nonEmptySize)) + Math.ceil(Math.log2(nonEmptySize)),
  );
}
