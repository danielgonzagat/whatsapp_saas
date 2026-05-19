import * as path from 'path';
import { assertWithinRoot, safeJoin } from '../lib/safe-path';
import {
  ensureDir,
  pathExists,
  readTextFile,
  writeTextFile,
} from '../safe-fs';
import { loadGovernanceBoundary } from '../scope-state-classify';
import type { ScopeFileEntry } from '../types.scope-engine';
import {
  classifyFileExtension,
  classifyFileRole,
  isTestFile,
  isGeneratedFile,
  isProtectedFile,
  isSourceFile,
  computeExecutionMode,
  UNKNOWN_STATUS,
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
} from './classify';
import {
  computeContentHash,
  walkFiles,
  buildScopeEngineState,
  validateZeroUnknown,
  getOrphanFiles,
  getCriticalOrphans,
} from './build-state';
import type { ZeroUnknownReport } from './build-state';

import { startScopeWatcher } from './watcher';

// Re-exports for backward compatibility
export { classifyFileRolePublic } from './classify';
export type { ScopeWatcherHandle } from './watcher';
export { discoverWatchableDirectories } from './watcher';
export { startScopeWatcher };
export {
  computeContentHash,
  walkFiles,
  buildScopeEngineState,
  validateZeroUnknown,
  getOrphanFiles,
  getCriticalOrphans,
};
export type { ZeroUnknownReport };
export type { ScopeEngineState } from '../types.scope-engine';

export function detectNewFile(rootDir: string, filePath: string): ScopeFileEntry | null {
  const relativePath = assertWithinRoot(filePath, rootDir);

  if (!pathExists(filePath)) return null;

  let content: string;
  try {
    content = readTextFile(filePath);
  } catch {
    return null;
  }

  const extension = classifyFileExtension(filePath);
  const role = classifyFileRole(filePath, content);
  const isTest = isTestFile(filePath, content);
  const isGenerated = isGeneratedFile(filePath, content);
  const governanceBoundary = loadGovernanceBoundary(rootDir);
  const isProtected = isProtectedFile(rootDir, filePath, governanceBoundary);
  const executionMode = computeExecutionMode(filePath, extension, isProtected, content);
  const contentHash = computeContentHash(content);
  const now = new Date().toISOString();

  let status: ScopeFileEntry['status'] = 'classified';
  if (role === 'unknown') status = 'unknown';

  return {
    filePath,
    relativePath,
    extension,
    status,
    role,
    isSource: isSourceFile(filePath, extension, content),
    isTest,
    isGenerated,
    isProtected,
    executionMode,
    connections: [],
    connectedFrom: [],
    capabilityIds: [],
    flowIds: [],
    nodeIds: [],
    firstSeen: now,
    lastModified: now,
    contentHash,
    classificationConfidence: role !== UNKNOWN_STATUS ? HIGH_CONFIDENCE : LOW_CONFIDENCE,
  };
}

export function enforceZeroUnknown(rootDir: string): ZeroUnknownReport {
  const state = buildScopeEngineState(rootDir);
  const report = validateZeroUnknown(state);

  const outDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outDir, { recursive: true });
  const outPath = safeJoin(outDir, 'PULSE_SCOPE_ZERO_UNKNOWN.json');
  writeTextFile(outPath, JSON.stringify(report, null, 2));

  if (!report.passed) {
    if (process.env.PULSE_SCOPE_DEBUG === '1') {
      console.warn(
        `[scope-engine] zero-unknown FAIL: ${report.unknownFiles} unknown, ${report.criticalOrphans} critical orphans`,
      );
    }
  }

  return report;
}

// ─── Script entry point ────────────────────────────────────────────────────

if (typeof require !== 'undefined' && require.main === module) {
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
    rootDir = path.resolve(__dirname, '..', '..', '..');
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
      `[scope-engine] ${state.summary.totalFiles} files | ` +
        `${state.summary.sourceFiles} source | ` +
        `${state.summary.testFiles} test | ` +
        `${state.summary.classifiedFiles} classified | ` +
        `${state.summary.unknownFiles} unknown | ` +
        `${state.summary.orphanFiles} orphans (${state.summary.criticalOrphanFiles} critical)`,
    );
  }
}
