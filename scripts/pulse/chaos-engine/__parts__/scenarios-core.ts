import type {
  ChaosEvidence,
  ChaosResult,
  ChaosScenario,
  ChaosScenarioKind,
  ChaosTarget,
} from '../../types.chaos-engine';
import type { PulseCapability } from '../../types.capabilities';
import {
  ChaosProviderName,
  ChaosOperationalConcern,
  lookupChaosTargetEvidence,
  detectProviders,
  detectCodebaseTargets,
  compactBlastRadius,
  compactProviderDependencies,
  unique,
} from './detection-core';
import {
  loadCapabilities,
  loadRuntimeEvidence,
  loadExecutionTrace,
  loadEffectGraphRecords,
} from './detection-loaders';
import {
  computeBlastRadius,
  computeProviderBlastRadius,
  targetForDetectedDependency,
  dependencyLabel,
  deriveOperationalConcerns,
} from './blast-radius';
import { buildChaosEvidenceContext, deriveChaosScenarioSeeds } from './injection-core';
import { generateInjectionConfig } from './injection-config';
import { buildDescription, buildExpectedBehavior } from './scenarios-descriptions';
import { ensureDir, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import { discoverChaosResultLabels } from '../../dynamic-reality-kernel/__parts__/type-contract-engines';

let __chaosResultNotTestedCache: ChaosResult | undefined;
function getChaosResultNotTested(): ChaosResult {
  if (__chaosResultNotTestedCache) return __chaosResultNotTestedCache;
  const labels = discoverChaosResultLabels();
  for (const label of labels)
    if (label === 'not_tested') return (__chaosResultNotTestedCache = label);
  throw new Error('ChaosResult type contract missing not_tested member');
}

function buildScenario(
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  params?: Record<string, number>,
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, { params });
  const description = buildDescription(kind, target, config, undefined);
  const expectedBehavior = buildExpectedBehavior(kind, target, config, undefined);
  return {
    id: `chaos:${target}:${kind}:${index}`,
    kind,
    target,
    description,
    injectionConfig: config,
    expectedBehavior,
    affectedCapabilities: blastRadius,
    result: getChaosResultNotTested(),
    recoveryTimeMs: null,
    blastRadius,
    errorsObserved: [],
  };
}

function buildProviderScenario(
  provider: ChaosProviderName,
  target: ChaosTarget,
  kind: ChaosScenarioKind,
  index: number,
  blastRadius: string[],
  operationalConcerns: Set<ChaosOperationalConcern>,
  params?: Record<string, number>,
): ChaosScenario {
  const config = generateInjectionConfig(kind, target, { params });
  const description = buildDescription(kind, target, config, provider);
  const expectedBehavior = buildExpectedBehavior(
    kind,
    target,
    config,
    provider,
    operationalConcerns,
  );
  return {
    id: `chaos:provider:${provider}:${kind}:${index}`,
    kind,
    target,
    description,
    injectionConfig: config,
    expectedBehavior,
    affectedCapabilities: blastRadius,
    result: getChaosResultNotTested(),
    recoveryTimeMs: null,
    blastRadius,
    errorsObserved: [],
  };
}

export function buildChaosCatalog(rootDir: string): ChaosEvidence {
  const targets = detectCodebaseTargets(rootDir);
  const providers = detectProviders(rootDir);
  const capabilities = loadCapabilities(rootDir);
  const scenarios: ChaosScenario[] = [];
  scenarios.push(...generateChaosScenarios(rootDir, targets, capabilities));
  scenarios.push(...generateProviderScenarios(rootDir, providers, capabilities));
  const _chaosResults = discoverChaosResultLabels();
  const _degradedGracefully = [..._chaosResults].find((r) => r === 'degraded_gracefully');
  if (!_degradedGracefully)
    throw new Error('ChaosResult type contract missing degraded_gracefully member');
  const _crashed = [..._chaosResults].find((r) => r === 'crashed');
  if (!_crashed) throw new Error('ChaosResult type contract missing crashed member');
  const _notTested = [..._chaosResults].find((r) => r === 'not_tested');
  if (!_notTested) throw new Error('ChaosResult type contract missing not_tested member');
  const degradedGracefully = scenarios.filter((s) => s.result === _degradedGracefully).length;
  const crashed = scenarios.filter((s) => s.result === _crashed).length;
  const testedScenarios = scenarios.filter((s) => s.result !== _notTested).length;
  const blastRadiusMap: Record<string, string[]> = {};
  for (const scenario of scenarios) blastRadiusMap[scenario.id] = scenario.blastRadius;
  for (const [provider, providerFiles] of providers) {
    const key = `chaos_provider:${provider}`;
    blastRadiusMap[key] = computeProviderBlastRadius(provider, providerFiles, capabilities);
  }
  const evidence: ChaosEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalScenarios: scenarios.length,
      testedScenarios,
      degradedGracefully,
      crashed,
      blastRadiusMap,
    },
    scenarios,
  };
  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(
    safeJoin(outputDir, discoverAllObservedArtifactFilenames().chaosEvidence),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}

export function generateChaosScenarios(
  rootDir: string,
  targets?: Set<ChaosTarget>,
  capabilities?: PulseCapability[],
): ChaosScenario[] {
  const detectedTargets = targets ?? detectCodebaseTargets(rootDir);
  const loadedCapabilities = capabilities ?? loadCapabilities(rootDir);
  const runtimeEvidence = loadRuntimeEvidence(rootDir);
  const executionTrace = loadExecutionTrace(rootDir);
  const effectRecords = loadEffectGraphRecords(rootDir);
  const scenarios: ChaosScenario[] = [];
  let index = 0;
  for (const target of detectedTargets) {
    const blastRadius = compactBlastRadius(computeBlastRadius(target, loadedCapabilities));
    const targetCapabilities = loadedCapabilities.filter((capability) =>
      blastRadius.includes(capability.id),
    );
    const targetFiles = unique(targetCapabilities.flatMap((capability) => capability.filePaths));
    const context = buildChaosEvidenceContext(
      `target:${target}`,
      target,
      targetFiles,
      loadedCapabilities,
      runtimeEvidence,
      executionTrace,
      effectRecords,
    );
    for (const seed of deriveChaosScenarioSeeds(context)) {
      scenarios.push(buildScenario(target, seed.kind, index++, blastRadius, seed.params));
    }
  }
  return scenarios;
}

export function generateProviderScenarios(
  rootDir: string,
  providers?: Map<ChaosProviderName, string[]>,
  capabilities?: PulseCapability[],
): ChaosScenario[] {
  const detectedProviders = providers ?? detectProviders(rootDir);
  const loadedCapabilities = capabilities ?? loadCapabilities(rootDir);
  const runtimeEvidence = loadRuntimeEvidence(rootDir);
  const executionTrace = loadExecutionTrace(rootDir);
  const effectRecords = loadEffectGraphRecords(rootDir);
  const scenarios: ChaosScenario[] = [];
  let index = 0;
  for (const [provider, providerFiles] of compactProviderDependencies(detectedProviders)) {
    const target = targetForDetectedDependency(provider, providerFiles);
    if (
      target === lookupChaosTargetEvidence('postgres') ||
      target === lookupChaosTargetEvidence('redis')
    )
      continue;
    const blastRadius = computeProviderBlastRadius(provider, providerFiles, loadedCapabilities);
    const operationalConcerns = deriveOperationalConcerns(
      provider,
      providerFiles,
      loadedCapabilities,
    );
    const context = buildChaosEvidenceContext(
      provider,
      target,
      providerFiles,
      loadedCapabilities,
      runtimeEvidence,
      executionTrace,
      effectRecords,
    );
    for (const seed of deriveChaosScenarioSeeds(context)) {
      scenarios.push(
        buildProviderScenario(
          provider,
          target,
          seed.kind,
          index++,
          blastRadius,
          operationalConcerns,
          seed.params,
        ),
      );
    }
  }
  return scenarios;
}
