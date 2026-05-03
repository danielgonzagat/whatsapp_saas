export { classifyFileRolePublic, detectNewFile } from './__parts__/scope-engine/single-file';
export { getOrphanFiles, getCriticalOrphans } from './__parts__/scope-engine/orphans';
export { buildScopeEngineState } from './__parts__/scope-engine/engine';
export type { ZeroUnknownReport } from './__parts__/scope-engine/validation';
export { validateZeroUnknown, enforceZeroUnknown } from './__parts__/scope-engine/validation';
export { discoverWatchableDirectories } from './__parts__/scope-engine/watcher';
export type { ScopeWatcherHandle } from './__parts__/scope-engine/watcher';
export { startScopeWatcher } from './__parts__/scope-engine/watcher';

if (typeof require !== 'undefined' && require.main === module) {
  const path = require('path');
  const { buildScopeEngineState } = require('./__parts__/scope-engine/engine');
  const { enforceZeroUnknown } = require('./__parts__/scope-engine/validation');
  const { startScopeWatcher } = require('./__parts__/scope-engine/watcher');
  const args = process.argv.slice(2);
  let rootDir = '';
  let watch = false;
  let enforce = false;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--root' || args[i] === '--rootDir') && args[i + 1]) {
      rootDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--watch') {
      watch = true;
    } else if (args[i] === '--enforce') {
      enforce = true;
    }
  }
  if (!rootDir) {
    rootDir = path.resolve(__dirname, '..', '..');
  }
  if (enforce) {
    const report = enforceZeroUnknown(rootDir);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.passed ? 0 : 1);
  }
  if (watch) {
    console.log(`[scope-engine] Watching ${rootDir}...`);
    startScopeWatcher(rootDir);
    process.stdin.resume();
  } else {
    console.log(`[scope-engine] Scanning ${rootDir}...`);
    const state = buildScopeEngineState(rootDir);
    console.log(
      `[scope-engine] ${state.summary.totalFiles} files | ${state.summary.sourceFiles} source | ${state.summary.testFiles} test | ${state.summary.classifiedFiles} classified | ${state.summary.unknownFiles} unknown | ${state.summary.orphanFiles} orphans (${state.summary.criticalOrphanFiles} critical)`,
    );
  }
}
