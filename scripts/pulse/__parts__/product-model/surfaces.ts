import type {
  PulseStructuralGraph,
  PulseScopeState,
  PulseResolvedManifest,
  PulseProductSurface,
} from '../../types';
import {
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
  titleCaseStructural,
} from '../../structural-family';
import {
  buildScopeFileCountBySurface,
  calculateSurfaceCompleteness,
  classifyTruthModeFromScore,
  describeSurface,
  deriveSurfaceId,
  limitSorted,
  nodeFamilies,
  unique,
} from './helpers';
import { MAX_PRODUCT_SURFACES, MAX_SURFACE_ARTIFACT_IDS } from './types';

export function discoverSurfaces(
  graph: PulseStructuralGraph,
  scopeState: PulseScopeState,
  manifest: PulseResolvedManifest,
): PulseProductSurface[] {
  const surfacesById = new Map<string, PulseProductSurface>();
  const scopeFileCountBySurface = buildScopeFileCountBySurface(scopeState);

  for (const moduleEntry of manifest.modules.filter((item) => item.coverageStatus !== 'excluded')) {
    const families = deriveStructuralFamilies([
      moduleEntry.key,
      moduleEntry.name,
      moduleEntry.canonicalName,
      ...moduleEntry.aliases,
      ...moduleEntry.routeRoots,
    ]);
    const artifactIds = limitSorted(
      graph.nodes
        .filter((node) => familiesOverlap(nodeFamilies(node), families))
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    if (artifactIds.length === 0 && !moduleEntry.declaredByManifest) {
      continue;
    }
    const surfaceId = slugifyStructural(
      moduleEntry.key || moduleEntry.canonicalName || moduleEntry.name,
    );
    if (!surfaceId) {
      continue;
    }
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: moduleEntry.name || titleCaseStructural(surfaceId),
      description: describeSurface(
        artifactIds.length,
        moduleEntry.routeRoots.length,
        scopeFileCountBySurface.get(surfaceId) || 0,
      ),
      artifactIds,
      capabilities: [],
      completeness,
      truthMode: artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : 'aspirational',
    });
  }

  for (const aggregate of scopeState.moduleAggregates) {
    const surfaceId = slugifyStructural(aggregate.moduleKey);
    if (!surfaceId || surfacesById.has(surfaceId)) {
      continue;
    }
    const artifactIds = limitSorted(
      graph.nodes
        .filter((node) => familiesOverlap(nodeFamilies(node), surfaceId))
        .map((node) => node.id),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: titleCaseStructural(surfaceId),
      description: describeSurface(artifactIds.length, 0, aggregate.fileCount),
      artifactIds,
      capabilities: [],
      completeness,
      truthMode: artifactIds.length > 0 ? classifyTruthModeFromScore(completeness) : 'aspirational',
    });
  }

  const groupedArtifactIds = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const surfaceId = deriveSurfaceId(node);
    if (!surfaceId) {
      continue;
    }
    if (!groupedArtifactIds.has(surfaceId)) {
      groupedArtifactIds.set(surfaceId, new Set<string>());
    }
    groupedArtifactIds.get(surfaceId)!.add(node.id);
  }

  for (const [surfaceId, ids] of groupedArtifactIds) {
    const existing = surfacesById.get(surfaceId);
    const artifactIds = limitSorted(
      unique([...(existing?.artifactIds || []), ...ids]),
      MAX_SURFACE_ARTIFACT_IDS,
    );
    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    surfacesById.set(surfaceId, {
      id: surfaceId,
      name: existing?.name || titleCaseStructural(surfaceId),
      description:
        existing?.description ||
        describeSurface(artifactIds.length, 0, scopeFileCountBySurface.get(surfaceId) || 0),
      artifactIds,
      capabilities: existing?.capabilities || [],
      completeness,
      truthMode: classifyTruthModeFromScore(completeness),
    });
  }

  return limitSorted(
    [...surfacesById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    MAX_PRODUCT_SURFACES,
  );
}
