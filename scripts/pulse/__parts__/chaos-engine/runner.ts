import { writeTextFile, ensureDir } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import type { PulseCapability } from '../../types';
import type { ChaosEvidence, ChaosScenario, ChaosTarget } from '../../types.chaos-engine';
import type { ChaosProviderName } from './types';
import { compactBlastRadius, unique, compactProviderDependencies } from './helpers';
import {
  detectProviders,
  detectCodebaseTargets,
  loadCapabilities,
  loadRuntimeEvidence,
  loadExecutionTrace,
  loadEffectGraphRecords,
  targetForDetectedDependency,
} from './detection';
import { computeBlastRadius, computeProviderBlastRadius } from './blast-radius';
import {
  buildChaosEvidenceContext,
  deriveChaosScenarioSeeds,
  deriveOperationalConcerns,
} from './scenario-engine';
import { buildScenario, buildProviderScenario } from './scenario-descriptions';

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
    if (target === 'postgres' || target === 'redis') {
      continue;
    }
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

export function buildChaosCatalog(rootDir: string): ChaosEvidence {
  const targets = detectCodebaseTargets(rootDir);
  const providers = detectProviders(rootDir);
  const capabilities = loadCapabilities(rootDir);

  const scenarios: ChaosScenario[] = [];

  scenarios.push(...generateChaosScenarios(rootDir, targets, capabilities));

  scenarios.push(...generateProviderScenarios(rootDir, providers, capabilities));

  const degradedGracefully = scenarios.filter((s) => s.result === 'degraded_gracefully').length;
  const crashed = scenarios.filter((s) => s.result === 'crashed').length;
  const testedScenarios = scenarios.filter((s) => s.result !== 'not_tested').length;

  const blastRadiusMap: Record<string, string[]> = {};
  for (const scenario of scenarios) {
    blastRadiusMap[scenario.id] = scenario.blastRadius;
  }

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
    safeJoin(outputDir, 'PULSE_CHAOS_EVIDENCE.json'),
    JSON.stringify(evidence, null, 2),
  );

  return evidence;
}
