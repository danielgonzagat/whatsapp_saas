import type { PulseCodebaseTruth } from '../types.truth';
import type { PulseManifest } from '../types.manifest';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import { buildFlowGroups, synthesizeScenarioFlowGroups } from '../resolved-manifest.flow-groups';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  buildModuleResolution,
  getActiveModules,
  getLegacyModules,
  mergeResolvedModules,
} from './helpers';

/** Build resolved manifest. */
export function buildResolvedManifest(
  manifest: PulseManifest | null,
  manifestPath: string | null,
  codebaseTruth: PulseCodebaseTruth,
  scopeState?: PulseScopeState | null,
): PulseResolvedManifest {
  const scopeAggregateMap = new Map(
    (scopeState?.moduleAggregates || []).map(
      (aggregate) => [aggregate.moduleKey, aggregate] as const,
    ),
  );
  const modules = mergeResolvedModules(
    codebaseTruth.discoveredModules.map((module) =>
      buildModuleResolution(manifest, module, scopeAggregateMap.get(module.key) || null),
    ),
  );
  const criticalModuleKeys = new Set(
    modules.filter((module) => module.critical).map((module) => module.key),
  );
  const resolvedFlowGroups = buildFlowGroups(
    manifest,
    codebaseTruth.discoveredFlows,
    criticalModuleKeys,
  );
  const flowGroups = [
    ...resolvedFlowGroups,
    ...synthesizeScenarioFlowGroups(manifest, codebaseTruth, resolvedFlowGroups),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const matchedModuleNames = new Set(
    modules.map((module) => module.sourceModule).filter((value): value is string => Boolean(value)),
  );
  const orphanManualModules = getActiveModules(manifest)
    .filter((entry) => !matchedModuleNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const legacyManualModules = getLegacyModules(manifest)
    .map((entry) => entry.name)
    .sort();

  const matchedFlowSpecs = new Set(
    flowGroups
      .map((group) => group.matchedFlowSpec)
      .filter((value): value is string => Boolean(value)),
  );
  const orphanFlowSpecs = (manifest?.flowSpecs || [])
    .filter((spec) => !matchedFlowSpecs.has(spec.id))
    .map((spec) => spec.id)
    .sort();

  const unresolvedModules: string[] = [];
  const resolvedModuleKeys = new Set(modules.map((module) => module.key));
  const scopeOnlyModuleCandidates = (scopeState?.moduleAggregates || [])
    .filter(
      (aggregate) =>
        aggregate.userFacingFileCount > deriveZeroValue() &&
        !resolvedModuleKeys.has(aggregate.moduleKey),
    )
    .map((aggregate) => aggregate.moduleKey)
    .sort();
  const humanRequiredModules = modules
    .filter((module) => module.protectedByGovernance)
    .map((module) => module.key)
    .sort();

  const unresolvedFlowGroups = flowGroups
    .filter(
      (group) =>
        group.resolution === 'candidate' &&
        group.flowKind !== 'ops_internal' &&
        group.flowKind !== 'legacy_noise',
    )
    .map((group) => group.id)
    .sort();

  const excludedModules = modules
    .filter((module) => module.resolution === 'excluded')
    .map((module) => module.name)
    .sort();
  const excludedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'excluded')
    .map((group) => group.id)
    .sort();
  const groupedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'grouped')
    .map((group) => group.id)
    .sort();
  const sharedCapabilityGroups = flowGroups
    .filter((group) => group.flowKind === 'shared_capability')
    .map((group) => group.id)
    .sort();
  const opsInternalFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'ops_internal')
    .map((group) => group.id)
    .sort();
  const legacyNoiseFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'legacy_noise')
    .map((group) => group.id)
    .sort();

  const blockerCount =
    unresolvedModules.length + orphanFlowSpecs.length + unresolvedFlowGroups.length;
  const warningCount =
    excludedModules.length +
    excludedFlowGroups.length +
    humanRequiredModules.length +
    scopeOnlyModuleCandidates.length +
    orphanManualModules.length +
    legacyManualModules.length +
    opsInternalFlowGroups.length +
    legacyNoiseFlowGroups.length;

  return {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: manifestPath,
    projectId: manifest?.projectId || 'unknown',
    projectName: manifest?.projectName || 'unknown',
    systemType: manifest?.systemType || 'unknown',
    supportedStacks: manifest?.supportedStacks || [],
    surfaces: manifest?.surfaces || [],
    criticalDomains: modules
      .filter((module) => module.critical && module.moduleKind === 'user_facing')
      .map((module) => module.key)
      .sort(),
    modules,
    flowGroups,
    actorProfiles: manifest?.actorProfiles || [],
    scenarioSpecs: manifest?.scenarioSpecs || [],
    flowSpecs: manifest?.flowSpecs || [],
    invariantSpecs: manifest?.invariantSpecs || [],
    temporaryAcceptances: manifest?.temporaryAcceptances || [],
    certificationTiers: manifest?.certificationTiers || [],
    finalReadinessCriteria: manifest?.finalReadinessCriteria || {
      requireAllTiersPass: true,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: true,
      requireWorldStateConvergence: true,
    },
    securityRequirements: manifest?.securityRequirements || [],
    recoveryRequirements: manifest?.recoveryRequirements || [],
    slos: manifest?.slos || {},
    summary: {
      totalModules: modules.length,
      resolvedModules: modules.filter((module) => module.resolution !== 'excluded').length,
      unresolvedModules: unresolvedModules.length,
      scopeOnlyModuleCandidates: scopeOnlyModuleCandidates.length,
      humanRequiredModules: humanRequiredModules.length,
      totalFlowGroups: flowGroups.length,
      resolvedFlowGroups: flowGroups.filter((group) => group.resolution !== 'candidate').length,
      unresolvedFlowGroups: unresolvedFlowGroups.length,
      orphanManualModules: orphanManualModules.length,
      orphanFlowSpecs: orphanFlowSpecs.length,
      excludedModules: excludedModules.length,
      excludedFlowGroups: excludedFlowGroups.length,
      groupedFlowGroups: groupedFlowGroups.length,
      sharedCapabilityGroups: sharedCapabilityGroups.length,
      opsInternalFlowGroups: opsInternalFlowGroups.length,
      legacyNoiseFlowGroups: legacyNoiseFlowGroups.length,
      legacyManualModules: legacyManualModules.length,
    },
    diagnostics: {
      unresolvedModules,
      orphanManualModules,
      scopeOnlyModuleCandidates,
      humanRequiredModules,
      unresolvedFlowGroups,
      orphanFlowSpecs,
      excludedModules,
      excludedFlowGroups,
      legacyManualModules,
      groupedFlowGroups,
      sharedCapabilityGroups,
      opsInternalFlowGroups,
      legacyNoiseFlowGroups,
      blockerCount,
      warningCount,
    },
  };
}
