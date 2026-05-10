import * as crypto from 'crypto';
import * as path from 'path';
import { safeJoin } from '../lib/safe-path';
import {
  ensureDir,
  readDir,
  readTextFile,
  statPath,
  writeTextFile,
} from '../safe-fs';
import { IGNORED_DIRECTORIES } from '../scope-state.constants/main';
import { loadGovernanceBoundary } from '../scope-state-classify';
import {
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
} from '../dynamic-reality-kernel/token-evidence';
import type {
  ScopeEngineState,
  ScopeEngineSummary,
  ScopeFileEntry,
} from '../types.scope-engine';
import {
  classifyFileExtension,
  classifyFileRole,
  isTestFile,
  isGeneratedFile,
  isProtectedFile,
  isSourceFile,
  computeExecutionMode,
  extractImports,
  resolveImportPath,
  UNKNOWN_STATUS,
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
  SCANNABLE_EXTENSIONS,
} from './classify';

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function walkFiles(dir: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readDir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    let stats;
    try {
      stats = statPath(fullPath);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (!entry.startsWith('.') && !discoverDirectorySkipHintsFromEvidence().has(entry)) {
        walkFiles(fullPath, files);
      }
    } else if (stats.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
}

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

  const rawImportsMap = new Map<string, string[]>();

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
    const rawImports = extractImports(filePath, content);
    rawImportsMap.set(filePath, rawImports);
    const now = new Date().toISOString();

    let status: ScopeFileEntry['status'] = 'classified';
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
      classificationConfidence: role !== UNKNOWN_STATUS ? HIGH_CONFIDENCE : LOW_CONFIDENCE,
    });
  }

  const entryMap = new Map<string, ScopeFileEntry>();
  for (const entry of entries) {
    entryMap.set(entry.filePath, entry);
  }

  for (const entry of entries) {
    const rawImports = rawImportsMap.get(entry.filePath);
    if (!rawImports || rawImports.length === 0) continue;
    const importerDir = path.dirname(entry.filePath);

    for (const importSpec of rawImports) {
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
  const outPath = safeJoin(outDir, discoverAllObservedArtifactFilenames().scopeState);
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

export interface ZeroUnknownReport {
  passed: boolean;
  generatedAt: string;
  totalFiles: number;
  unknownFiles: number;
  unknownFilePaths: string[];
  criticalOrphans: number;
  criticalOrphanPaths: string[];
}

export function validateZeroUnknown(state: ScopeEngineState): ZeroUnknownReport {
  const unknownEntries = state.files.filter((f) => f.status === 'unknown');
  const criticalOrphans = getCriticalOrphans(state);

  return {
    passed: unknownEntries.length === 0 && criticalOrphans.length === 0,
    generatedAt: new Date().toISOString(),
    totalFiles: state.summary.totalFiles,
    unknownFiles: unknownEntries.length,
    unknownFilePaths: unknownEntries.map((f) => f.filePath),
    criticalOrphans: criticalOrphans.length,
    criticalOrphanPaths: criticalOrphans.map((f) => f.filePath),
  };
}
