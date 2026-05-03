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
