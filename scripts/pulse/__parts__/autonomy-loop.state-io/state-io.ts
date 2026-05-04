import type { PulseAutonomyIterationRecord, PulseAutonomyState } from '../../types';
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
} from '../../autonomy-loop.types';
import {
  getAutonomyArtifactPath,
  getAutonomyMemoryArtifactPath,
  getAgentOrchestrationArtifactPath,
  readOptionalArtifact,
  writeAtomicArtifact,
} from '../../autonomy-loop.utils';
import { buildPulseAutonomyMemoryState } from '../../autonomy-loop.memory';
import {
  buildPulseAutonomyStateSeed,
  buildPulseAgentOrchestrationStateSeed,
} from './seed-builders';

export function writePulseAutonomyState(rootDir: string, state: PulseAutonomyState): void {
  writeAtomicArtifact(getAutonomyArtifactPath(rootDir), rootDir, JSON.stringify(state, null, 2));
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: state,
    orchestrationState: loadPulseAgentOrchestrationState(rootDir),
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAutonomyState(rootDir: string): PulseAutonomyState | null {
  return readOptionalArtifact<PulseAutonomyState>(getAutonomyArtifactPath(rootDir));
}

export function writePulseAgentOrchestrationState(
  rootDir: string,
  state: PulseAgentOrchestrationState,
): void {
  writeAtomicArtifact(
    getAgentOrchestrationArtifactPath(rootDir),
    rootDir,
    JSON.stringify(state, null, 2),
  );
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: loadPulseAutonomyState(rootDir),
    orchestrationState: state,
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

export function loadPulseAgentOrchestrationState(
  rootDir: string,
): PulseAgentOrchestrationState | null {
  return readOptionalArtifact<PulseAgentOrchestrationState>(
    getAgentOrchestrationArtifactPath(rootDir),
  );
}

export function appendHistory(
  state: PulseAutonomyState,
  iteration: PulseAutonomyIterationRecord,
): PulseAutonomyState {
  return {
    ...state,
    history: [...state.history, iteration].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

export function appendOrchestrationHistory(
  state: PulseAgentOrchestrationState,
  batch: PulseAgentOrchestrationBatchRecord,
): PulseAgentOrchestrationState {
  return {
    ...state,
    history: [...state.history, batch].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}
