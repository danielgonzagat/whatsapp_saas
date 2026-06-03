import type { PulseCapability } from '../types.capabilities/03-capability';
import type { PulseFlowProjectionItem } from '../types.capabilities/04-flow-projection';
import type { PulseResolvedManifest } from '../types.resolved-manifest';
import {
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
} from '../structural-family';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function moduleFamilies(entry: PulseResolvedManifest['modules'][number]): string[] {
  return deriveStructuralFamilies([
    entry.key,
    entry.name,
    entry.canonicalName,
    ...entry.aliases,
    ...entry.routeRoots,
  ]);
}

function capabilityFamilies(capability: PulseCapability): string[] {
  return deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]);
}

function flowFamilies(flow: PulseFlowProjectionItem): string[] {
  return deriveStructuralFamilies([flow.id, flow.name, ...flow.routePatterns]);
}

export function mergeModules(
  modules: PulseResolvedManifest['modules'],
): PulseResolvedManifest['modules'] {
  const merged = new Map<string, PulseResolvedManifest['modules'][number]>();
  for (const entry of modules) {
    const key = slugifyStructural(entry.key || entry.canonicalName || entry.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...entry,
        key,
        aliases: unique(entry.aliases),
        routeRoots: unique(entry.routeRoots),
        groups: unique(entry.groups),
        surfaceKinds: unique(entry.surfaceKinds),
      });
      continue;
    }
    merged.set(key, {
      ...existing,
      name: existing.declaredByManifest ? existing.name : entry.name,
      canonicalName: existing.declaredByManifest ? existing.canonicalName : entry.canonicalName,
      aliases: unique([...existing.aliases, ...entry.aliases]),
      routeRoots: unique([...existing.routeRoots, ...entry.routeRoots]),
      groups: unique([...existing.groups, ...entry.groups]),
      userFacing: existing.userFacing || entry.userFacing,
      critical: existing.critical || entry.critical,
      declaredByManifest: existing.declaredByManifest || entry.declaredByManifest,
      protectedByGovernance: existing.protectedByGovernance || entry.protectedByGovernance,
      coverageStatus: preferredCoverageStatus(existing.coverageStatus, entry.coverageStatus),
      discoveredFileCount: existing.discoveredFileCount + entry.discoveredFileCount,
      codacyIssueCount: existing.codacyIssueCount + entry.codacyIssueCount,
      highSeverityIssueCount: existing.highSeverityIssueCount + entry.highSeverityIssueCount,
      surfaceKinds: unique([...existing.surfaceKinds, ...entry.surfaceKinds]),
      pageCount: existing.pageCount + entry.pageCount,
      totalInteractions: existing.totalInteractions + entry.totalInteractions,
      backendBoundInteractions: existing.backendBoundInteractions + entry.backendBoundInteractions,
      persistedInteractions: existing.persistedInteractions + entry.persistedInteractions,
      backedDataSources: existing.backedDataSources + entry.backedDataSources,
      notes: unique([existing.notes, entry.notes].filter(Boolean)).join(' | '),
    });
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function unitHitsModule(
  capability: PulseCapability,
  entry: PulseResolvedManifest['modules'][number],
): boolean {
  return familiesOverlap(capabilityFamilies(capability), moduleFamilies(entry));
}

export function runHitsModule(
  flow: PulseFlowProjectionItem,
  entry: PulseResolvedManifest['modules'][number],
  capIds: string[],
): boolean {
  if (flow.capabilityIds.some((capabilityId) => capIds.includes(capabilityId))) {
    return true;
  }
  return familiesOverlap(flowFamilies(flow), moduleFamilies(entry));
}

function preferredCoverageStatus(
  left: PulseResolvedManifest['modules'][number]['coverageStatus'],
  right: PulseResolvedManifest['modules'][number]['coverageStatus'],
): PulseResolvedManifest['modules'][number]['coverageStatus'] {
  const statusPriority = [
    ...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.resolved-manifest.ts',
      'PulseResolvedModuleCoverageStatus',
    ),
  ];
  for (const candidate of statusPriority) {
    if (left === candidate || right === candidate) {
      return candidate as PulseResolvedManifest['modules'][number]['coverageStatus'];
    }
  }
  return left;
}
