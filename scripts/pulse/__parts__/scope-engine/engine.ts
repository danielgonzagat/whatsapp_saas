import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { ensureDir, readTextFile, writeTextFile } from '../../safe-fs';
import { loadGovernanceBoundary } from '../../scope-state-classify';
import type {
  ScopeEngineState,
  ScopeEngineSummary,
  ScopeFileEntry,
  ScopeFileStatus,
} from '../../types.scope-engine';
import { classifyFileExtension, extractImports } from './constants';
import {
  isTestFile,
  isGeneratedFile,
  isProtectedFile,
  isSourceFile,
  classifyFileRole,
  computeExecutionMode,
} from './classifiers';
import { hasExports, resolveImportPath } from './import-utils';
import { walkFiles, computeContentHash } from './walker';
import { getOrphanFiles, getCriticalOrphans } from './orphans';

export function buildScopeEngineState(
  rootDir: string,
  previousState?: ScopeEngineState,
): ScopeEngineState {
  const allFilePaths: string[] = [];
  walkFiles(rootDir, allFilePaths);

  const governanceBoundary = loadGovernanceBoundary(rootDir);
  const knownPaths = new Set(allFilePaths);
  const entries: ScopeFileEntry[] = [];
  const previousMap = new Map<string, ScopeFileEntry>();

  if (previousState) {
    for (const prev of previousState.files) {
      previousMap.set(prev.filePath, prev);
    }
  }

  let sourceFiles = 0;
  let testFiles = 0;
  let classifiedFiles = 0;
  let unknownFiles = 0;
  let protectedFileCount = 0;
  let aiSafeFiles = 0;
  let humanRequiredFiles = 0;
  let observationOnlyFiles = 0;
  let notExecutableFiles = 0;

  for (const filePath of allFilePaths) {
    let content: string;
    try {
      content = readTextFile(filePath);
    } catch {
      continue;
    }

    const extension = classifyFileExtension(filePath);
    const role = classifyFileRole(filePath, content);
    const isTest = isTestFile(filePath, content);
    const isGenerated = isGeneratedFile(filePath, content);
    const isProtected = isProtectedFile(rootDir, filePath, governanceBoundary);
    const executionMode = computeExecutionMode(filePath, extension, isProtected, content);
    const contentHash = computeContentHash(content);
    const now = new Date().toISOString();

    let status: ScopeFileStatus = 'classified';
    if (role === 'unknown' && isSourceFile(filePath, extension, content)) {
      status = 'unknown';
    }

    if (isSourceFile(filePath, extension, content)) sourceFiles++;
    if (isTest) testFiles++;
    if (role !== 'unknown') classifiedFiles++;
    else unknownFiles++;
    if (isProtected) protectedFileCount++;

    switch (executionMode) {
      case 'ai_safe':
        aiSafeFiles++;
        break;
      case 'human_required':
        humanRequiredFiles++;
        break;
      case 'observation_only':
        observationOnlyFiles++;
        break;
      case 'not_executable':
        notExecutableFiles++;
        break;
    }

    const relativePath = path.relative(rootDir, filePath);
    const prev = previousMap.get(filePath);

    const imports = extractImports(filePath, content);
    const exports = hasExports(content);

    entries.push({
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
      firstSeen: prev?.firstSeen ?? now,
      lastModified: contentHash !== prev?.contentHash ? now : (prev?.lastModified ?? now),
      contentHash,
      classificationConfidence: role !== 'unknown' ? 85 : 30,
    });
  }

  const entryMap = new Map<string, ScopeFileEntry>();
  for (const entry of entries) {
    entryMap.set(entry.filePath, entry);
  }

  for (const entry of entries) {
    const content = readTextFile(entry.filePath);
    const imports = extractImports(entry.filePath, content);
    const importerDir = path.dirname(entry.filePath);

    for (const importSpec of imports) {
      const resolved = resolveImportPath(importSpec, importerDir, knownPaths);
      if (resolved) {
        entry.connections.push(resolved);
      }
    }
  }

  for (const entry of entries) {
    for (const conn of entry.connections) {
      const target = entryMap.get(conn);
      if (target) {
        target.connectedFrom.push(entry.filePath);
      }
    }
  }

  let orphanCount = 0;
  let criticalOrphanCount = 0;
  let filesWithConnections = 0;
  let filesWithoutConnections = 0;

  for (const entry of entries) {
    const hasConnection = entry.connections.length > 0 || entry.connectedFrom.length > 0;
    if (!hasConnection) {
      orphanCount++;
      filesWithoutConnections++;
      if (entry.isSource && !entry.isTest && !entry.isGenerated) {
        criticalOrphanCount++;
      }
    } else {
      filesWithConnections++;
    }
  }

  for (const entry of entries) {
    if (entry.connections.length === 0 && entry.connectedFrom.length === 0) {
      entry.status = 'orphan';
    }
  }

  const newFiles: string[] = [];
  const deletedFiles: string[] = [];
  const modifiedFiles: string[] = [];

  if (previousState) {
    const currentPaths = new Set(allFilePaths);
    const prevPaths = new Set(previousState.files.map((f) => f.filePath));

    for (const p of currentPaths) {
      if (!prevPaths.has(p)) newFiles.push(p);
    }

    for (const p of prevPaths) {
      if (!currentPaths.has(p)) deletedFiles.push(p);
    }

    const prevHashMap = new Map(previousState.files.map((f) => [f.filePath, f.contentHash]));

    for (const entry of entries) {
      const prevHash = prevHashMap.get(entry.filePath);
      if (prevHash !== undefined && prevHash !== entry.contentHash) {
        modifiedFiles.push(entry.filePath);
      }
    }
  }

  const summary: ScopeEngineSummary = {
    totalFiles: entries.length,
    sourceFiles,
    testFiles,
    classifiedFiles,
    unknownFiles,
    orphanFiles: orphanCount,
    criticalOrphanFiles: criticalOrphanCount,
    protectedFiles: protectedFileCount,
    aiSafeFiles,
    humanRequiredFiles,
    observationOnlyFiles,
    notExecutableFiles,
    filesWithConnections,
    filesWithoutConnections,
  };

  const state: ScopeEngineState = {
    generatedAt: new Date().toISOString(),
    rootDir,
    summary,
    files: entries,
    newFilesSinceLastRun: newFiles,
    deletedFilesSinceLastRun: deletedFiles,
    modifiedFilesSinceLastRun: modifiedFiles,
  };

  const outDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outDir, { recursive: true });
  const outPath = safeJoin(outDir, 'PULSE_SCOPE_STATE.json');
  const json = JSON.stringify(state, null, 2);
  writeTextFile(outPath, json);

  const orphanPath = safeJoin(outDir, 'PULSE_SCOPE_ORPHANS.json');
  const orphans = getOrphanFiles(state);
  const criticalOrphans = getCriticalOrphans(state);
  writeTextFile(
    orphanPath,
    JSON.stringify(
      {
        generatedAt: state.generatedAt,
        totalOrphans: orphans.length,
        criticalOrphans: criticalOrphans.length,
        orphanFiles: orphans.map((f) => ({
          filePath: f.filePath,
          relativePath: f.relativePath,
          role: f.role,
          status: f.status,
        })),
        criticalOrphanFiles: criticalOrphans.map((f) => ({
          filePath: f.filePath,
          relativePath: f.relativePath,
          role: f.role,
          status: f.status,
        })),
      },
      null,
      2,
    ),
  );

  return state;
}
