import { safeResolve } from '../../safe-path';
import { readPulseArtifact, deriveObservabilityPillars } from './types-and-utils';
import type { ObservabilityRuntimeContext } from './types-and-utils';
import type { PulseObservabilityEvidence, PulseRuntimeEvidence } from '../../types';
import type { BehaviorGraph, BehaviorNode } from '../../types.behavior-graph';
import type { RuntimeFusionState, RuntimeSignal } from '../../types.runtime-fusion';

export function loadObservabilityRuntimeContext(
  rootDir: string,
  pulseCurrentDir: string,
): ObservabilityRuntimeContext {
  const runtimeFusion = readPulseArtifact<RuntimeFusionState>(
    pulseCurrentDir,
    'PULSE_RUNTIME_FUSION.json',
  );
  const behaviorGraph = readPulseArtifact<BehaviorGraph>(
    pulseCurrentDir,
    'PULSE_BEHAVIOR_GRAPH.json',
  );
  const behaviorNodesByFile = new Map<string, BehaviorNode[]>();
  for (const node of behaviorGraph?.nodes ?? []) {
    const absolutePath = safeResolve(rootDir, node.filePath);
    for (const key of [absolutePath, node.filePath]) {
      const existing = behaviorNodesByFile.get(key) ?? [];
      existing.push(node);
      behaviorNodesByFile.set(key, existing);
    }
  }

  const runtimeSignalsByCapability = new Map<string, RuntimeSignal[]>();
  const runtimeSignalsByFlow = new Map<string, RuntimeSignal[]>();
  for (const signal of runtimeFusion?.signals ?? []) {
    for (const capabilityId of signal.affectedCapabilityIds ?? []) {
      const existing = runtimeSignalsByCapability.get(capabilityId) ?? [];
      existing.push(signal);
      runtimeSignalsByCapability.set(capabilityId, existing);
    }
    for (const flowId of signal.affectedFlowIds ?? []) {
      const existing = runtimeSignalsByFlow.get(flowId) ?? [];
      existing.push(signal);
      runtimeSignalsByFlow.set(flowId, existing);
    }
  }

  return {
    pillars: deriveObservabilityPillars(rootDir),
    observabilityEvidence: readPulseArtifact<PulseObservabilityEvidence>(
      pulseCurrentDir,
      'PULSE_OBSERVABILITY_EVIDENCE.json',
    ),
    runtimeEvidence: readPulseArtifact<PulseRuntimeEvidence>(
      pulseCurrentDir,
      'PULSE_RUNTIME_EVIDENCE.json',
    ),
    runtimeFusion,
    behaviorGraph,
    behaviorNodesByFile,
    runtimeSignalsByCapability,
    runtimeSignalsByFlow,
  };
}
