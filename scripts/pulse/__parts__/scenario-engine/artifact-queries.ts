import type { PulseProductFlow, PulseProductGraph, PulseProductSurface } from '../../types';
import type { DataflowState, EntityLifecycle } from '../../types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from '../../types.execution-harness';
import { tokenizeSurface } from './surface-queries';

function getHarnessTargetsForSurface(
  harnessEvidence: HarnessEvidence | null,
  surface: PulseProductSurface,
): HarnessTarget[] {
  if (!harnessEvidence) return [];
  const hints = tokenizeSurface(surface);
  return harnessEvidence.targets.filter((t) => {
    const lower = (t.filePath + (t.routePattern || '')).toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

function getHarnessFixtures(targets: HarnessTarget[]): string[] {
  const names = new Set<string>();
  for (const t of targets) {
    for (const f of t.fixtures) {
      names.add(f.name);
    }
  }
  return Array.from(names).slice(0, 5);
}

function getEntitiesForSurface(
  dataflowState: DataflowState | null,
  surface: PulseProductSurface,
): EntityLifecycle[] {
  if (!dataflowState) return [];
  const hints = tokenizeSurface(surface);
  return dataflowState.entities.filter((e) => {
    const lower = e.model.toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

function getPrimaryEntity(entities: EntityLifecycle[]): EntityLifecycle | null {
  if (entities.length === 0) return null;
  const critical = entities.filter((e) => e.critical || e.financial);
  return critical.length > 0 ? critical[0] : entities[0];
}

function getEntityOperations(entity: EntityLifecycle | null): string[] {
  if (!entity) return [];
  const ops: string[] = [];
  if (entity.createdBy.length > 0) ops.push('create');
  if (entity.readBy.length > 0) ops.push('read');
  if (entity.updatedBy.length > 0) ops.push('update');
  if (entity.deletedBy.length > 0) ops.push('delete');
  return ops;
}

export { getSurface, getCapabilitiesForSurface } from './constants';

function getFlowsForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductFlow[] {
  if (!productGraph) return [];
  const caps = new Set(
    productGraph.capabilities.filter((c) => c.surfaceId === surfaceId).map((c) => c.id),
  );
  return productGraph.flows.filter((f) => caps.has(f.entryCapability));
}

export {
  getHarnessTargetsForSurface,
  getHarnessFixtures,
  getEntitiesForSurface,
  getPrimaryEntity,
  getEntityOperations,
  getFlowsForSurface,
};
