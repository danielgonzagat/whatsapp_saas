import type { ScopeEngineState, ScopeFileEntry } from '../../types.scope-engine';

export function getOrphanFiles(state: ScopeEngineState): ScopeFileEntry[] {
  return state.files.filter((f) => f.connections.length === 0 && f.connectedFrom.length === 0);
}

export function getCriticalOrphans(state: ScopeEngineState): ScopeFileEntry[] {
  return state.files.filter(
    (f) =>
      f.isSource &&
      !f.isTest &&
      !f.isGenerated &&
      f.connections.length === 0 &&
      f.connectedFrom.length === 0,
  );
}
