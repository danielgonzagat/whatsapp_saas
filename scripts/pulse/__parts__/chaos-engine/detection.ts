import * as path from 'path';

import { pathExists, readJsonFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { walkFiles } from '../../parsers/utils';
import type {
  PulseCapability,
  PulseExecutionMatrix,
  PulseExecutionTrace,
  PulseRuntimeEvidence,
  PulseRuntimeProbe,
} from '../../types';
import type { ChaosTarget } from '../../types.chaos-engine';
import type { ChaosProviderName } from './types';
import {
  PRISMA_OPERATION_RE,
  QUEUE_OR_CACHE_RE,
  EXTERNAL_HTTP_RE,
  WEBHOOK_RECEIVER_RE,
  IMPORT_SPECIFIER_RE,
  ENV_REFERENCE_RE,
  URL_HOST_RE,
  HTTP_CLIENT_IDENTIFIER_RE,
  EXTERNAL_PACKAGE_HINT_RE,
} from './patterns';
import {
  readSafe,
  unique,
  normalizeEvidencePath,
  slugDependency,
  getNamedImportsFromModule,
  hasDecoratorUse,
  hasInternalRouteEvidence,
  dependencyId,
  packageRoot,
  envDependencyName,
  addDetectedDependency,
  loadArtifactRecords,
  stringArray,
} from './helpers';

export function addDependenciesFromSource(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
  file: string,
  content: string,
): void {
  const relativeFile = normalizeEvidencePath(rootDir, file);
  if (PRISMA_OPERATION_RE.test(content)) {
    addDetectedDependency(dependencies, dependencyId('target', 'postgres'), relativeFile);
  }
  if (QUEUE_OR_CACHE_RE.test(content)) {
    addDetectedDependency(dependencies, dependencyId('target', 'redis'), relativeFile);
  }

  for (const match of content.matchAll(URL_HOST_RE)) {
    addDetectedDependency(dependencies, dependencyId('host', match[1] ?? ''), relativeFile);
  }

  for (const match of content.matchAll(ENV_REFERENCE_RE)) {
    const envName = match[1] ?? match[2] ?? '';
    addDetectedDependency(
      dependencies,
      dependencyId('env', envDependencyName(envName) ?? ''),
      relativeFile,
    );
  }

  for (const match of content.matchAll(HTTP_CLIENT_IDENTIFIER_RE)) {
    addDetectedDependency(dependencies, dependencyId('client', match[1] ?? ''), relativeFile);
  }

  const hasExternalCallShape = EXTERNAL_HTTP_RE.test(content);
  for (const match of content.matchAll(IMPORT_SPECIFIER_RE)) {
    const importedPackage = packageRoot(match[1] ?? '');
    if (!importedPackage) {
      continue;
    }
    const importedSlug = slugDependency(importedPackage) ?? '';
    if (hasExternalCallShape || EXTERNAL_PACKAGE_HINT_RE.test(importedSlug)) {
      addDetectedDependency(dependencies, dependencyId('package', importedPackage), relativeFile);
    }
  }
}

export function addDependenciesFromArtifactFiles(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
  files: string[],
): void {
  for (const file of unique(files)) {
    const absolutePath = path.isAbsolute(file) ? file : safeJoin(rootDir, file);
    if (!pathExists(absolutePath)) {
      continue;
    }
    addDependenciesFromSource(dependencies, rootDir, absolutePath, readSafe(absolutePath));
  }
}

export function addDependenciesFromPulseArtifacts(
  dependencies: Map<ChaosProviderName, string[]>,
  rootDir: string,
): void {
  const behaviorNodes = loadArtifactRecords(rootDir, 'PULSE_BEHAVIOR_GRAPH.json');
  for (const node of behaviorNodes) {
    const filePath = typeof node.filePath === 'string' ? node.filePath : '';
    const externalCalls = Array.isArray(node.externalCalls) ? node.externalCalls : [];
    for (const call of externalCalls) {
      if (!call || typeof call !== 'object') {
        continue;
      }
      const provider = (call as Record<string, unknown>).provider;
      if (typeof provider === 'string') {
        addDetectedDependency(dependencies, dependencyId('behavior', provider), filePath);
      }
    }
  }

  const structuralNodes = loadArtifactRecords(rootDir, 'PULSE_STRUCTURAL_GRAPH.json');
  const sideEffectFiles = structuralNodes
    .filter((node) => node.kind === 'side_effect_signal')
    .flatMap((node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;
      return typeof metadata?.filePath === 'string' ? [metadata.filePath] : [];
    });
  addDependenciesFromArtifactFiles(dependencies, rootDir, sideEffectFiles);

  const productCapabilities = loadArtifactRecords(rootDir, 'PULSE_PRODUCT_GRAPH.json');
  for (const capability of productCapabilities) {
    for (const provider of stringArray(capability.providersInvolved)) {
      addDetectedDependency(dependencies, dependencyId('product-graph', provider), '');
    }
  }

  const signalFiles = [
    ...loadArtifactRecords(rootDir, 'PULSE_EXTERNAL_SIGNAL_STATE.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_RUNTIME_FUSION.json'),
  ].flatMap((signal) => [
    ...stringArray(signal.relatedFiles),
    ...stringArray(signal.affectedFilePaths),
  ]);
  addDependenciesFromArtifactFiles(dependencies, rootDir, signalFiles);
}

export function detectProviders(rootDir: string): Map<ChaosProviderName, string[]> {
  const providerFiles = new Map<ChaosProviderName, string[]>();
  const backendDirs = [
    safeJoin(rootDir, 'backend', 'src'),
    safeJoin(rootDir, 'worker', 'src'),
    safeJoin(rootDir, 'worker'),
  ];

  const allFiles: string[] = [];
  for (const dir of backendDirs) {
    if (pathExists(dir)) {
      allFiles.push(
        ...walkFiles(dir, ['.ts', '.tsx']).filter(
          (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
        ),
      );
    }
  }

  for (const file of allFiles) {
    const content = readSafe(file);
    addDependenciesFromSource(providerFiles, rootDir, file, content);
  }

  addDependenciesFromPulseArtifacts(providerFiles, rootDir);

  return providerFiles;
}

export function detectCodebaseTargets(rootDir: string): Set<ChaosTarget> {
  const found = new Set<ChaosTarget>();
  const backendDirs = [
    safeJoin(rootDir, 'backend', 'src'),
    safeJoin(rootDir, 'worker', 'src'),
    safeJoin(rootDir, 'worker'),
  ];

  const allFiles: string[] = [];
  for (const dir of backendDirs) {
    if (pathExists(dir)) {
      allFiles.push(
        ...walkFiles(dir, ['.ts', '.tsx']).filter(
          (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
        ),
      );
    }
  }

  for (const file of allFiles) {
    const content = readSafe(file);
    for (const target of classifyTargetsFromSource(content)) {
      found.add(target);
    }
  }

  return found;
}

export function classifyTargetsFromSource(content: string): Set<ChaosTarget> {
  const targets = new Set<ChaosTarget>();
  if (PRISMA_OPERATION_RE.test(content)) {
    targets.add('postgres');
  }
  if (QUEUE_OR_CACHE_RE.test(content)) {
    targets.add('redis');
  }
  if (hasInternalRouteEvidence(content)) {
    targets.add('internal_api');
  }
  if (EXTERNAL_HTTP_RE.test(content)) {
    targets.add('external_http');
  }
  if (WEBHOOK_RECEIVER_RE.test(content)) {
    targets.add('webhook_receiver');
  }
  return targets;
}

export function loadCapabilities(rootDir: string): PulseCapability[] {
  const capabilityPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_CAPABILITY_STATE.json');
  if (!pathExists(capabilityPath)) {
    return [];
  }
  try {
    const state = readJsonFile<{ capabilities: PulseCapability[] }>(capabilityPath);
    return state.capabilities ?? [];
  } catch {
    return [];
  }
}

export function loadMatrixPaths(rootDir: string): PulseExecutionMatrix['paths'] {
  const matrixPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');
  if (!pathExists(matrixPath)) {
    return [];
  }
  try {
    const matrix = readJsonFile<PulseExecutionMatrix>(matrixPath);
    return matrix.paths ?? [];
  } catch {
    return [];
  }
}

export function loadRuntimeEvidence(rootDir: string): PulseRuntimeEvidence | null {
  const runtimePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_RUNTIME_EVIDENCE.json');
  if (!pathExists(runtimePath)) {
    return null;
  }
  try {
    return readJsonFile<PulseRuntimeEvidence>(runtimePath);
  } catch {
    return null;
  }
}

export function loadExecutionTrace(rootDir: string): PulseExecutionTrace | null {
  const tracePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_TRACE.json');
  if (!pathExists(tracePath)) {
    return null;
  }
  try {
    return readJsonFile<PulseExecutionTrace>(tracePath);
  } catch {
    return null;
  }
}

export function loadEffectGraphRecords(rootDir: string): Record<string, unknown>[] {
  return [
    ...loadArtifactRecords(rootDir, 'PULSE_BEHAVIOR_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_STRUCTURAL_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_EFFECT_GRAPH.json'),
    ...loadArtifactRecords(rootDir, 'PULSE_RUNTIME_FUSION.json'),
  ];
}

export function targetForDetectedDependency(
  dependency: ChaosProviderName,
  dependencyFiles: string[],
): ChaosTarget {
  if (dependency === dependencyId('target', 'postgres')) {
    return 'postgres';
  }
  if (dependency === dependencyId('target', 'redis')) {
    return 'redis';
  }
  if (dependencyFiles.some((file) => file.includes('webhook'))) {
    return 'webhook_receiver';
  }
  return 'external_http';
}

export function dependencyLabel(dependency: ChaosProviderName): string {
  const [, rawName = dependency] = dependency.split(/:(.*)/s);
  const name = rawName.replace(/[-_]+/g, ' ').trim();
  return name ? `external dependency ${name}` : 'external dependency';
}
