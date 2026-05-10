import * as p from 'path';
import { pathExists as existsAt, writeTextFile, ensureDir } from '../../safe-fs';
import { unique } from '../../signal-normalizers';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceUnitPriorityLabels } from '../../__kernel_additions__/discoverConvergenceUnitPriorityLabels';
import type { RuntimeSignal, RuntimeFusionState } from '../../types.runtime-fusion';
import {
  ACTION_BLOCK_DEPLOY,
  ACTION_BLOCK_MERGE,
  FUSION_OUTPUT_FILE,
  SEVERITY_INFO,
  average,
  bound01,
  isCriticalSignal,
  isDecisiveRuntimeRealitySignal,
  isHighSignal,
  normalizeImpactByRuntimeReality,
  observedMeanOrSelf,
  observedSpread,
  runtimeRealityFactor,
} from './helpers';
import {
  emptySourceCounts,
  loadCanonicalExternalSignals,
  resolvePulseCurrentDir,
  safeJsonParseFile,
  syncAffectedAliases,
} from './parsing';
import {
  computeImpactScore,
  mapCapabilitiesFromFlows,
  mapSignalToCapabilities,
  mapSignalToFlows,
} from './mapping';
import { buildMachineImprovementSignals, loadRuntimeTraceEvidence } from './otel';

// ─── Priority Overrides ─────────────────────────────────────────────────────

/**
 * Override static analysis priorities based on runtime signal reality.
 *
 * Any capability that has active critical or high runtime signals is promoted
 * to P0 priority regardless of its static analysis priority.
 *
 * @param fusionState - The current runtime fusion state.
 * @param convergencePlan - Optional convergence plan with current priorities.
 * @returns The fusion state with priority overrides applied.
 */
export function overridePriorities(
  fusionState: RuntimeFusionState,
  convergencePlan?: {
    priorities?: Record<string, string>;
    units?: Array<{ capabilityId?: string; priority: string; name?: string }>;
  },
): RuntimeFusionState {
  let overrides = fusionState.priorityOverrides.slice();

  for (let capId of Object.keys(fusionState.summary.signalsByCapability)) {
    let capabilitySignals = fusionState.signals.filter(
      (s) => s.affectedCapabilityIds.includes(capId) && isDecisiveRuntimeRealitySignal(s),
    );
    if (capabilitySignals.length === 0) continue;

    let originalPriority: string = PRIORITY_P2;
    if (convergencePlan) {
      if (convergencePlan.priorities?.[capId]) {
        originalPriority = convergencePlan.priorities[capId];
      } else if (convergencePlan.units) {
        let unit = convergencePlan.units.find((u) => u.capabilityId === capId || u.name === capId);
        if (unit) originalPriority = unit.priority;
      }
    }

    if (originalPriority === PRIORITY_P0) continue;
    let dynamicPriority = rankByRuntimeReality(capabilitySignals, originalPriority);
    if ((ORDER_INDEX[dynamicPriority] ?? 2) >= (ORDER_INDEX[originalPriority] ?? 2)) continue;

    let uniqueSources = unique(capabilitySignals.map((s) => s.source));
    let impactFloor = observedMeanOrSelf(
      capabilitySignals.map((signal) => signal.impactScore),
      0,
    );
    let reasons = capabilitySignals
      .filter((s) => s.impactScore >= impactFloor || s.action === ACTION_BLOCK_DEPLOY)
      .map((s) => `[${s.severity}] ${s.message.slice(0, 100)}`)
      .slice(0, 3);

    overrides.push({
      capabilityId: capId,
      originalPriority,
      newPriority: dynamicPriority,
      reason: `Dynamic signal semantics promoted runtime priority from observed operational impact from ${uniqueSources.join(', ')}: ${reasons.join('; ')}`,
    });
  }

  return { ...fusionState, priorityOverrides: overrides };
}

// ─── Runtime Reality Ranking ────────────────────────────────────────────────

let ORDER_INDEX: Record<string, number> = Object.fromEntries(
  [...discoverConvergenceUnitPriorityLabels()].map((label, idx) => [label, idx]),
);
let PRIORITY_P0 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P0')!;
let PRIORITY_P1 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P1')!;
let PRIORITY_P2 = [...discoverConvergenceUnitPriorityLabels()].find((l) => l === 'P2')!;

/**
 * Rank capabilities by runtime reality precedence.
 *
 * The rule is:
 * > "real error > lint, real latency > code smell,
 * >  deploy failure > refactor, test regression > new feature"
 *
 * Runtime signals are classified into tiers, and the resulting priority
 * is the max of the runtime-derived priority and the static priority.
 *
 * @param signals - Active runtime signals for a capability.
 * @param staticOrder - The current static priority (P0–P3).
 * @returns The final priority string.
 */
export function rankByRuntimeReality(signals: RuntimeSignal[], staticOrder: string): string {
  return deriveOrder(signals, staticOrder);
}

function deriveOrder(signals: RuntimeSignal[], staticOrder: string): string {
  if (signals.length === 0) return staticOrder;

  let activeSignals = signals.filter(
    (s) => (!s.pinned || s.severity !== SEVERITY_INFO) && isDecisiveRuntimeRealitySignal(s),
  );
  if (activeSignals.length === 0) return staticOrder;

  let impactValues = activeSignals.map((signal) =>
    Math.max(bound01(signal.impactScore), computeImpactScore(signal), runtimeRealityFactor(signal)),
  );
  let strongestImpact = Math.max(...impactValues);
  let dynamicFloor = observedMeanOrSelf(impactValues, strongestImpact);
  let dynamicSpread = observedSpread(impactValues);
  let deployBlockingMass = activeSignals
    .filter((signal) => signal.action === ACTION_BLOCK_DEPLOY)
    .map((signal) => signal.impactScore);
  let mergeBlockingMass = activeSignals
    .filter((signal) => signal.action === ACTION_BLOCK_MERGE)
    .map((signal) => signal.impactScore);

  let runtimeOrder = staticOrder;
  if (
    strongestImpact >= dynamicFloor + dynamicSpread ||
    average(deployBlockingMass) >= dynamicFloor
  ) {
    runtimeOrder = PRIORITY_P0;
  } else if (strongestImpact >= dynamicFloor || average(mergeBlockingMass) >= dynamicFloor) {
    runtimeOrder = PRIORITY_P1;
  } else if (strongestImpact > 0) {
    runtimeOrder = PRIORITY_P2;
  }

  let runtimeOrdinal = ORDER_INDEX[runtimeOrder] ?? 2;
  let staticOrdinal = ORDER_INDEX[staticOrder] ?? 2;

  return runtimeOrdinal <= staticOrdinal ? runtimeOrder : staticOrder;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

function buildSummary(
  signals: RuntimeSignal[],
  capabilityState?: { capabilities?: Array<{ id: string }> },
): RuntimeFusionState['summary'] {
  let totalSignals = signals.length;
  let criticalSignals = signals.filter(isCriticalSignal).length;
  let highSignals = signals.filter(isHighSignal).length;
  let blockMergeSignals = signals.filter(
    (s) => s.action === ACTION_BLOCK_MERGE || s.action === ACTION_BLOCK_DEPLOY,
  ).length;
  let blockDeploySignals = signals.filter((s) => s.action === ACTION_BLOCK_DEPLOY).length;

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

// ─── Main Builder ───────────────────────────────────────────────────────────

/**
 * Build the full Runtime Reality Fusion state from all available external signal sources.
 *
 * This function:
 * 1. Loads external signals from each source file in `.pulse/current/`
 * 2. Normalizes them into {@link RuntimeSignal} objects
 * 3. Maps signals to capabilities using file paths and message patterns
 * 4. Computes per-signal impact scores
 * 5. Generates a summary with counts, breakdowns, and top-impact rankings
 * 6. Generates priority overrides for capabilities with critical/high runtime signals
 * 7. Saves the result to `.pulse/current/PULSE_RUNTIME_FUSION.json`
 *
 * @param rootDir - The root directory of the PULSE state (typically `.pulse/current`).
 * @returns The complete {@link RuntimeFusionState}.
 */
export function buildRuntimeFusionState(rootDir: string): RuntimeFusionState {
  let currentDir = resolvePulseCurrentDir(rootDir);
  let externalSignals = loadCanonicalExternalSignals(currentDir);
  let runtimeTraces = loadRuntimeTraceEvidence(currentDir);
  let allSignals: RuntimeSignal[] = [...externalSignals.signals, ...runtimeTraces.signals];

  // Try loading capability state for signal→capability mapping context
  let capabilityStatePath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().capabilityState,
  );
  let capabilityPayload = safeJsonParseFile(capabilityStatePath);
  let capabilityState = capabilityPayload
    ? (capabilityPayload as unknown as {
        capabilities?: Array<{ id: string; name: string; filePaths?: string[] }>;
      })
    : undefined;
  let flowProjectionPath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().flowProjection,
  );
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

  // Map signals to capabilities where not already mapped
  for (let signal of allSignals) {
    let mapped = mapSignalToCapabilities(signal, capabilityState);
    signal.affectedCapabilityIds = unique([...signal.affectedCapabilityIds, ...mapped]);
    let mappedFlows = mapSignalToFlows(signal, flowProjection);
    signal.affectedFlowIds = unique([...signal.affectedFlowIds, ...mappedFlows]);
    signal.affectedCapabilityIds = unique([
      ...signal.affectedCapabilityIds,
      ...mapCapabilitiesFromFlows(signal, flowProjection),
    ]);
    // Recompute impact score using the fusion formula
    signal.impactScore = normalizeImpactByRuntimeReality(
      signal,
      Math.max(bound01(signal.impactScore), computeImpactScore(signal)),
      allSignals,
    );
    signal.confidence = bound01(signal.confidence);
    syncAffectedAliases(signal);
  }

  // Load convergence plan for priority context
  let convergencePlanPath = p.join(
    currentDir,
    discoverAllObservedArtifactFilenames().convergencePlan,
  );
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
