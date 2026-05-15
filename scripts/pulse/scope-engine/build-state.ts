import * as crypto from 'crypto';
import * as path from 'path';
import { safeJoin } from '../lib/safe-path';
import { ensureDir, readDir, readTextFile, statPath, writeTextFile } from '../safe-fs';
import { IGNORED_DIRECTORIES, ROOT_CONFIG_FILES } from '../scope-state.constants/main';
import { loadGovernanceBoundary, type GovernanceBoundary } from '../scope-state-classify';
import { discoverDirectorySkipHintsFromEvidence } from '../dynamic-reality-kernel/token-evidence';
import type { ScopeEngineState, ScopeEngineSummary, ScopeFileEntry } from '../types.scope-engine';
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

interface WalkFilesOptions {
  rootDir: string;
  observableHiddenDirectories: ReadonlySet<string>;
}

export function walkFiles(dir: string, files: string[], options?: WalkFilesOptions): void {
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
      if (shouldDescendDirectory(entry, options) && !discoverDirectorySkipHintsFromEvidence().has(entry)) {
        walkFiles(fullPath, files, options);
      }
    } else if (stats.isFile()) {
      if (isScannableScopeEngineFile(fullPath, entry, options)) {
        files.push(fullPath);
      }
    }
  }
}

function shouldDescendDirectory(entry: string, options?: WalkFilesOptions): boolean {
  if (IGNORED_DIRECTORIES.has(entry)) return false;
  if (!entry.startsWith('.')) return true;
  return Boolean(options?.observableHiddenDirectories.has(entry));
}

function isScannableScopeEngineFile(
  filePath: string,
  basename: string,
  options?: WalkFilesOptions,
): boolean {
  const ext = path.extname(basename).toLowerCase();
  if (SCANNABLE_EXTENSIONS.has(ext)) return true;
  if (ROOT_CONFIG_FILES.has(basename)) return true;
  if (basename === 'Dockerfile' || basename.startsWith('Dockerfile.')) return true;
  if (!options) return false;
  const relativePath = normalizeRelativePath(options.rootDir, filePath);
  const firstSegment = relativePath.split('/')[0] ?? '';
  return options.observableHiddenDirectories.has(firstSegment);
}

export function getOrphanFiles(state: ScopeEngineState): ScopeFileEntry[] {
  return state.files.filter((f) => !hasScopeGraphEvidence(f));
}

export function getCriticalOrphans(state: ScopeEngineState): ScopeFileEntry[] {
  return state.files.filter(
    (f) => f.isSource && !f.isTest && !f.isGenerated && !hasScopeGraphEvidence(f),
  );
}

interface TsconfigPathAlias {
  configDir: string;
  baseDir: string;
  importPattern: string;
  targetPatterns: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTsconfigPathAliases(filePaths: string[]): TsconfigPathAlias[] {
  const aliases: TsconfigPathAlias[] = [];

  for (const filePath of filePaths) {
    if (!path.basename(filePath).startsWith('tsconfig') || path.extname(filePath) !== '.json') {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readTextFile(filePath));
    } catch {
      continue;
    }

    if (!isRecord(parsed) || !isRecord(parsed.compilerOptions)) {
      continue;
    }

    const compilerOptions = parsed.compilerOptions;
    if (!isRecord(compilerOptions.paths)) {
      continue;
    }

    const configDir = path.dirname(filePath);
    const baseUrl = typeof compilerOptions.baseUrl === 'string' ? compilerOptions.baseUrl : '.';
    const baseDir = path.resolve(configDir, baseUrl);

    for (const [importPattern, targetValue] of Object.entries(compilerOptions.paths)) {
      if (!Array.isArray(targetValue)) {
        continue;
      }

      const targetPatterns = targetValue.filter(
        (target): target is string => typeof target === 'string',
      );
      if (targetPatterns.length === 0) {
        continue;
      }

      aliases.push({
        configDir,
        baseDir,
        importPattern,
        targetPatterns,
      });
    }
  }

  return aliases;
}

function isWithinDirectory(candidatePath: string, directoryPath: string): boolean {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function matchImportPattern(importSpec: string, pattern: string): string | null {
  const wildcardIndex = pattern.indexOf('*');
  if (wildcardIndex === -1) {
    return importSpec === pattern ? '' : null;
  }

  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  if (!importSpec.startsWith(prefix) || !importSpec.endsWith(suffix)) {
    return null;
  }

  return importSpec.slice(prefix.length, importSpec.length - suffix.length);
}

function applyTargetPattern(targetPattern: string, wildcardValue: string): string {
  return targetPattern.includes('*') ? targetPattern.replace('*', wildcardValue) : targetPattern;
}

function resolveTsconfigAliasCandidates(
  importSpec: string,
  importerDir: string,
  aliases: ReadonlyArray<TsconfigPathAlias>,
): string[] {
  const candidates: string[] = [];

  for (const alias of aliases) {
    if (!isWithinDirectory(importerDir, alias.configDir)) {
      continue;
    }

    const wildcardValue = matchImportPattern(importSpec, alias.importPattern);
    if (wildcardValue === null) {
      continue;
    }

    for (const targetPattern of alias.targetPatterns) {
      candidates.push(
        path.resolve(alias.baseDir, applyTargetPattern(targetPattern, wildcardValue)),
      );
    }
  }

  return candidates;
}

function discoverObservableHiddenDirectories(boundary: GovernanceBoundary): Set<string> {
  const directories = new Set<string>();
  for (const protectedPath of [...boundary.protectedExact, ...boundary.protectedPrefixes]) {
    const firstSegment = protectedPath.split('/')[0] ?? '';
    if (firstSegment.startsWith('.') && !IGNORED_DIRECTORIES.has(firstSegment)) {
      directories.add(firstSegment);
    }
  }
  return directories;
}

function hasScopeGraphEvidence(entry: ScopeFileEntry): boolean {
  return (
    entry.connections.length > 0 ||
    entry.connectedFrom.length > 0 ||
    entry.capabilityIds.length > 0 ||
    entry.flowIds.length > 0 ||
    entry.nodeIds.length > 0
  );
}

function normalizeRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function basenameWithoutKnownSourceSuffix(relativePath: string): string {
  return path
    .basename(relativePath)
    .replace(/\.(d\.)?(ts|tsx|js|jsx|mjs|cjs)$/u, '')
    .toLowerCase();
}

function isNextAppRouterEntrypoint(relativePath: string): boolean {
  if (!relativePath.includes('/src/app/') && !relativePath.includes('/app/')) {
    return false;
  }

  return new Set([
    'page',
    'route',
    'layout',
    'loading',
    'error',
    'global-error',
    'not-found',
    'template',
    'default',
  ]).has(basenameWithoutKnownSourceSuffix(relativePath));
}

function isNextRuntimeConventionEntrypoint(relativePath: string): boolean {
  return new Set([
    'next.config',
    'next-env',
    'instrumentation',
    'instrumentation-client',
    'middleware',
    'proxy',
  ]).has(basenameWithoutKnownSourceSuffix(relativePath));
}

function isPrismaRuntimeEntrypoint(relativePath: string): boolean {
  const basename = basenameWithoutKnownSourceSuffix(relativePath);
  return (
    basename === 'prisma.config' ||
    relativePath.includes('/prisma/') ||
    relativePath.startsWith('prisma/') ||
    basename.startsWith('seed') ||
    basename.includes('migration')
  );
}

function isTestSupportEntrypoint(relativePath: string): boolean {
  const segments = relativePath.split('/');
  return segments.includes('test') || segments.includes('tests') || segments.includes('__mocks__');
}

function isTypeDeclarationEntrypoint(relativePath: string): boolean {
  const basename = path.basename(relativePath).toLowerCase();
  return basename.endsWith('.d.ts') || basename === 'types.ts' || basename.startsWith('types.');
}

function isRuntimeConfigEntrypoint(relativePath: string): boolean {
  const basename = path.basename(relativePath);
  const lowerBasename = basename.toLowerCase();
  return (
    ROOT_CONFIG_FILES.has(basename) ||
    lowerBasename.startsWith('tsconfig') ||
    lowerBasename === 'nest-cli.json' ||
    lowerBasename === 'package.json' ||
    lowerBasename === 'package-lock.json'
  );
}

function isPublicRuntimeAsset(relativePath: string, content: string): boolean {
  return (
    relativePath.includes('/public/') &&
    /\.(js|mjs|cjs)$/u.test(relativePath) &&
    /\b(window|document|navigator|localStorage|sessionStorage)\b/u.test(content)
  );
}

function isOperationalScriptEntrypoint(relativePath: string, content: string): boolean {
  if (!/(\.ts|\.js|\.mjs|\.cjs)$/u.test(relativePath)) {
    return false;
  }

  const segments = relativePath.split('/');
  const isScriptPath =
    segments[0] === 'scripts' ||
    (segments.length > 1 && segments[0] === 'backend' && segments[1] === 'scripts');
  if (!isScriptPath) {
    return false;
  }

  const basename = basenameWithoutKnownSourceSuffix(relativePath);
  return (
    content.startsWith('#!') ||
    /^(run|smoke|agent|create|generate|validate|check|audit|seed|backup|sync|emit|build|watch|start|stop|deploy|repair|reconcile|ensure|collect|scan|inspect|publish|test|verify|orchestrate|bootstrap)(-|$)/u.test(
      basename,
    ) ||
    basename.endsWith('-orchestrator')
  );
}

function deriveEntrypointNodeIds(rootDir: string, filePath: string, content: string): string[] {
  const relativePath = normalizeRelativePath(rootDir, filePath);
  const nodeIds: string[] = [];

  if (isNextAppRouterEntrypoint(relativePath)) nodeIds.push('framework:next-app-router');
  if (isNextRuntimeConventionEntrypoint(relativePath)) {
    nodeIds.push('framework:next-runtime-convention');
  }
  if (isPrismaRuntimeEntrypoint(relativePath)) nodeIds.push('runtime:prisma-entrypoint');
  if (isTestSupportEntrypoint(relativePath)) nodeIds.push('test:test-support-surface');
  if (isTypeDeclarationEntrypoint(relativePath)) nodeIds.push('contract:type-declaration');
  if (isRuntimeConfigEntrypoint(relativePath)) nodeIds.push('runtime:config-entrypoint');
  if (isPublicRuntimeAsset(relativePath, content)) nodeIds.push('runtime:public-browser-asset');
  if (relativePath.includes('/vendor/')) nodeIds.push('runtime:vendored-shim');
  if (isOperationalScriptEntrypoint(relativePath, content)) {
    nodeIds.push('runtime:operational-script');
  }

  return nodeIds;
}

export function buildScopeEngineState(
  rootDir: string,
  previousState?: ScopeEngineState,
): ScopeEngineState {
  const allFilePaths: string[] = [];
  const governanceBoundary = loadGovernanceBoundary(rootDir);
  walkFiles(rootDir, allFilePaths, {
    rootDir,
    observableHiddenDirectories: discoverObservableHiddenDirectories(governanceBoundary),
  });

  const knownPaths = new Set(allFilePaths);
  const tsconfigAliases = readTsconfigPathAliases(allFilePaths);
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
    const nodeIds = deriveEntrypointNodeIds(rootDir, filePath, content);
    if (isTest) {
      nodeIds.push('test:test-runner-entrypoint');
    }

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
      nodeIds,
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
      const aliasCandidates = resolveTsconfigAliasCandidates(
        importSpec,
        importerDir,
        tsconfigAliases,
      );
      const resolved = resolveImportPath(importSpec, importerDir, knownPaths, aliasCandidates);
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
    if (!hasScopeGraphEvidence(entry)) {
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
    if (!hasScopeGraphEvidence(entry)) {
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
  const outPath = safeJoin(outDir, 'PULSE_SCOPE_ENGINE_STATE.json');
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
