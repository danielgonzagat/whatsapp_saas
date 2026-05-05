import type {
  PulseCapability,
  PulseExecutionMatrix,
  PulseExecutionTrace,
  PulseRuntimeEvidence,
} from '../types';
import { readJsonFile, pathExists } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel';
import { loadArtifactRecords } from './detection-core';

export function loadCapabilities(rootDir: string): PulseCapability[] {
  const artifacts = discoverAllObservedArtifactFilenames();
  const capabilityPath = safeJoin(rootDir, '.pulse', 'current', artifacts.capabilityState);
  if (!pathExists(capabilityPath)) return [];
  try {
    const state = readJsonFile<{ capabilities: PulseCapability[] }>(capabilityPath);
    return state.capabilities ?? [];
  } catch {
    return [];
  }
}

export function loadMatrixPaths(rootDir: string): PulseExecutionMatrix['paths'] {
  const artifacts = discoverAllObservedArtifactFilenames();
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', artifacts.executionMatrix);
  if (!pathExists(matrixPath)) return [];
  try {
    const matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    return matrix.paths ?? [];
  } catch {
    return [];
  }
}

export function loadRuntimeEvidence(rootDir: string): PulseRuntimeEvidence | null {
  const artifacts = discoverAllObservedArtifactFilenames();
  const runtimePath = safeJoin(rootDir, '.pulse', 'current', artifacts.runtimeEvidence);
  if (!pathExists(runtimePath)) return null;
  try {
    return readJsonFile<PulseRuntimeEvidence>(runtimePath);
  } catch {
    return null;
  }
}

export function loadExecutionTrace(rootDir: string): PulseExecutionTrace | null {
  const artifacts = discoverAllObservedArtifactFilenames();
  const tracePath = safeJoin(rootDir, '.pulse', 'current', artifacts.executionTrace);
  if (!pathExists(tracePath)) return null;
  try {
    return readJsonFile<PulseExecutionTrace>(tracePath);
  } catch {
    return null;
  }
}

export function loadEffectGraphRecords(rootDir: string): Record<string, unknown>[] {
  const artifacts = discoverAllObservedArtifactFilenames();
  return [
    ...loadArtifactRecords(rootDir, artifacts.behaviorGraph),
    ...loadArtifactRecords(rootDir, artifacts.structuralGraph),
    ...loadArtifactRecords(rootDir, artifacts.effectGraph),
    ...loadArtifactRecords(rootDir, artifacts.runtimeFusion),
  ];
}
