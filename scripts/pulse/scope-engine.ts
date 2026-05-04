import {
  discoverScopeFileStatusLabels,
  discoverScopeFileRoleLabels,
  discoverScopeExecutionModeLabels,
  discoverAllObservedArtifactFilenames,
} from './dynamic-reality-kernel';

let _scopeStatusLabels: Set<string> | null = null;
function scopeStatusCatalog(): Set<string> {
  return _scopeStatusLabels ?? (_scopeStatusLabels = discoverScopeFileStatusLabels());
}

let _scopeRoleLabels: Set<string> | null = null;
function scopeRoleCatalog(): Set<string> {
  return _scopeRoleLabels ?? (_scopeRoleLabels = discoverScopeFileRoleLabels());
}

let _scopeModeLabels: Set<string> | null = null;
function scopeModeCatalog(): Set<string> {
  return _scopeModeLabels ?? (_scopeModeLabels = discoverScopeExecutionModeLabels());
}

let _scopeArtifactNames: Record<string, string> | null = null;
function scopeArtifactCatalog(): Record<string, string> {
  return _scopeArtifactNames ?? (_scopeArtifactNames = discoverAllObservedArtifactFilenames());
}

export {
  classifyFileRolePublic,
  detectNewFile,
  getOrphanFiles,
  getCriticalOrphans,
  buildScopeEngineState,
  validateZeroUnknown,
  enforceZeroUnknown,
  discoverWatchableDirectories,
  startScopeWatcher,
} from './__parts__/scope-engine/engine';
export type { ScopeWatcherHandle, ZeroUnknownReport } from './__parts__/scope-engine/engine';
