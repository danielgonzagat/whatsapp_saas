import type { PulseCodebaseTruth } from '../types.truth';
import type { PulseManifest, PulseManifestModule } from '../types.manifest';
import type { PulseScopeModuleAggregate } from '../types.truth.scope';
import type { PulseResolvedModule } from '../types.resolved-manifest';
import {
  normalizeText,
  slugify,
  tokenize,
  unique,
  titleCase,
  matchesOverride,
} from '../resolved-manifest.builders';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

const RESOLVED_TYPE_FILE = 'scripts/pulse/types.resolved-manifest.ts';

export function getModuleResolutionLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    RESOLVED_TYPE_FILE,
    'PulseResolvedModuleResolution',
  );
}

export function getModuleKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(RESOLVED_TYPE_FILE, 'PulseResolvedModuleKind');
}

export function getCoverageStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    RESOLVED_TYPE_FILE,
    'PulseResolvedModuleCoverageStatus',
  );
}

export function getFlowResolutionLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    RESOLVED_TYPE_FILE,
    'PulseResolvedFlowResolution',
  );
}

export function getFlowKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(RESOLVED_TYPE_FILE, 'PulseResolvedFlowKind');
}

export function getActiveModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.modules || [];
}

export function getLegacyModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.legacyModules || [];
}

function findManifestModule(
  entries: PulseManifestModule[],
  candidates: string[],
): PulseManifestModule | null {
  const normalizedCandidates = candidates.map(normalizeText).filter(Boolean);
  for (const entry of entries) {
    const normalizedEntry = normalizeText(entry.name);
    if (normalizedCandidates.includes(normalizedEntry)) {
      return entry;
    }
  }
  return null;
}

function buildModuleCandidates(
  module: PulseCodebaseTruth['discoveredModules'][number],
  manifest: PulseManifest | null,
): string[] {
  const overrides = manifest?.overrides || {};
  const explicitAlias =
    overrides.moduleAliases?.[module.key] || overrides.moduleAliases?.[module.name] || null;
  return unique(
    [
      module.name,
      module.declaredModule || '',
      explicitAlias || '',
      titleCase(module.key),
      ...module.routeRoots.map(titleCase),
    ].filter(Boolean),
  );
}

export function buildModuleResolution(
  manifest: PulseManifest | null,
  module: PulseCodebaseTruth['discoveredModules'][number],
  scopeAggregate: PulseScopeModuleAggregate | null,
): PulseResolvedModule {
  const overrides = manifest?.overrides || {};
  const candidates = buildModuleCandidates(module, manifest);
  const manualModule = findManifestModule(getActiveModules(manifest), candidates);
  const legacyModule = findManifestModule(getLegacyModules(manifest), candidates);
  const excluded =
    matchesOverride(module.key, overrides.excludedModules || []) ||
    matchesOverride(module.name, overrides.excludedModules || []);
  const criticalOverride =
    matchesOverride(module.key, overrides.criticalModules || []) ||
    matchesOverride(module.name, overrides.criticalModules || []);
  const internalOverride =
    matchesOverride(module.key, overrides.internalModules || []) ||
    matchesOverride(module.name, overrides.internalModules || []);

  const moduleKind = internalOverride || !module.userFacing ? 'internal' : 'user_facing';
  const resolution = excluded ? 'excluded' : manualModule ? 'matched' : 'derived';
  const canonicalName = manualModule?.name || legacyModule?.name || module.name;
  const canonicalKey = slugify(canonicalName) || module.key;
  const coverageStatus = excluded
    ? 'excluded'
    : manualModule
      ? 'declared_and_discovered'
      : 'discovered_only';
  const critical =
    !excluded &&
    (criticalOverride ||
      Boolean(manualModule?.critical) ||
      ((scopeAggregate?.runtimeCriticalFileCount ?? deriveZeroValue()) > deriveZeroValue() &&
        ((scopeAggregate?.userFacingFileCount ?? deriveZeroValue()) > deriveZeroValue() ||
          moduleKind === 'user_facing')));
  const aliases = unique(
    [
      module.name,
      manualModule?.name || '',
      legacyModule?.name || '',
      ...module.routeRoots.map(titleCase),
    ].filter(Boolean),
  );

  let notes = module.notes;
  if (manualModule) {
    notes = `${notes}; source="${manualModule.name}".`;
  } else if (legacyModule) {
    notes = `${notes}; legacy source="${legacyModule.name}".`;
  } else if (resolution === 'derived') {
    notes = `${notes}; derived directly from codebase truth.`;
  }
  if (resolution === 'excluded') {
    notes = `${notes}; excluded by manifest override.`;
  }

  return {
    key: canonicalKey,
    name: canonicalName,
    canonicalName,
    aliases,
    routeRoots: module.routeRoots,
    groups: module.groups,
    moduleKind,
    userFacing: moduleKind === 'user_facing',
    shellComplexity: module.shellComplexity,
    state: moduleKind === 'internal' ? 'INTERNAL' : module.state,
    critical,
    resolution,
    sourceModule: manualModule?.name || null,
    legacySource: legacyModule?.name || null,
    coverageStatus,
    declaredByManifest: Boolean(manualModule),
    discoveredFileCount: scopeAggregate?.fileCount ?? deriveZeroValue(),
    codacyIssueCount: scopeAggregate?.observedCodacyIssueCount ?? deriveZeroValue(),
    highSeverityIssueCount: scopeAggregate?.highSeverityIssueCount ?? deriveZeroValue(),
    protectedByGovernance:
      (scopeAggregate?.humanRequiredFileCount ?? deriveZeroValue()) > deriveZeroValue(),
    surfaceKinds: scopeAggregate?.surfaces || [],
    pageCount: module.pageCount,
    totalInteractions: module.totalInteractions,
    backendBoundInteractions: module.backendBoundInteractions,
    persistedInteractions: module.persistedInteractions,
    backedDataSources: module.backedDataSources,
    notes,
  };
}

export function mergeResolvedModules(modules: PulseResolvedModule[]): PulseResolvedModule[] {
  const merged = new Map<string, PulseResolvedModule>();

  for (const module of modules) {
    const existing = merged.get(module.key);
    if (!existing) {
      merged.set(module.key, {
        ...module,
        aliases: unique(module.aliases),
        routeRoots: unique(module.routeRoots),
        groups: unique(module.groups),
        surfaceKinds: unique(module.surfaceKinds),
      });
      continue;
    }
    merged.set(module.key, {
      ...existing,
      name: existing.declaredByManifest ? existing.name : module.name,
      canonicalName: existing.declaredByManifest ? existing.canonicalName : module.canonicalName,
      aliases: unique([...existing.aliases, ...module.aliases]),
      routeRoots: unique([...existing.routeRoots, ...module.routeRoots]),
      groups: unique([...existing.groups, ...module.groups]),
      userFacing: existing.userFacing || module.userFacing,
      critical: existing.critical || module.critical,
      declaredByManifest: existing.declaredByManifest || module.declaredByManifest,
      protectedByGovernance: existing.protectedByGovernance || module.protectedByGovernance,
      resolution:
        existing.resolution === 'matched' || module.resolution === 'matched'
          ? 'matched'
          : existing.resolution,
      coverageStatus:
        existing.coverageStatus === 'declared_and_discovered' ||
        module.coverageStatus === 'declared_and_discovered'
          ? 'declared_and_discovered'
          : existing.coverageStatus === 'discovered_only' ||
              module.coverageStatus === 'discovered_only'
            ? 'discovered_only'
            : existing.coverageStatus,
      discoveredFileCount: existing.discoveredFileCount + module.discoveredFileCount,
      codacyIssueCount: existing.codacyIssueCount + module.codacyIssueCount,
      highSeverityIssueCount: existing.highSeverityIssueCount + module.highSeverityIssueCount,
      surfaceKinds: unique([...existing.surfaceKinds, ...module.surfaceKinds]),
      pageCount: existing.pageCount + module.pageCount,
      totalInteractions: existing.totalInteractions + module.totalInteractions,
      backendBoundInteractions: existing.backendBoundInteractions + module.backendBoundInteractions,
      persistedInteractions: existing.persistedInteractions + module.persistedInteractions,
      backedDataSources: existing.backedDataSources + module.backedDataSources,
      notes: unique([existing.notes, module.notes].filter(Boolean)).join(' | '),
    });
  }
  return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key));
}
