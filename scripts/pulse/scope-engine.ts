import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { safeJoin, assertWithinRoot } from './lib/safe-path';
import {
  ensureDir,
  pathExists,
  readDir,
  readTextFile,
  statPath,
  writeTextFile,
  writeFile,
} from './safe-fs';
import { IGNORED_DIRECTORIES } from './scope-state.constants';
import { detectSourceRoots } from './source-root-detector';
import type {
  ScopeEngineState,
  ScopeEngineSummary,
  ScopeFileEntry,
  ScopeFileRole,
  ScopeFileStatus,
  ScopeExecutionMode,
} from './types.scope-engine';

const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.less',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.mdx',
  '.html',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.sql',
  '.prisma',
  '.graphql',
  '.gql',
  '.env',
  '.env.example',
]);

const TEST_FILE_PATTERNS = [
  /\.spec\.(ts|tsx|js|jsx)$/,
  /\.test\.(ts|tsx|js|jsx)$/,
  /\/__tests__\//,
  /\/tests\//,
  /\/test\//,
];

const GENERATED_FILE_PATTERNS = [
  /\.generated\.(ts|tsx|js|jsx)$/,
  /\/generated\//,
  /\.prisma\/client/,
];

const PROTECTED_PATH_PATTERNS = [
  /\/ops\//,
  /\/\.github\/workflows\//,
  /\/scripts\/ops\//,
  /\/governance\//,
  /\/secrets\//,
  /\/cert(ification|s)?\//,
  /\/prisma\/migrations\//,
];

const ROLE_BY_PATH_PATTERNS: [RegExp, ScopeFileRole][] = [
  [/\/controllers?\//, 'controller'],
  [/\/services?\//, 'service'],
  [/\/middlewares?\//, 'middleware'],
  [/\/guards?\//, 'guard'],
  [/\/interceptors?\//, 'interceptor'],
  [/\/decorators?\//, 'decorator'],
  [/\/modules?\//, 'module'],
  [/\/providers?\//, 'provider'],
  [/\/resolvers?\//, 'resolver'],
  [/\/gateways?\//, 'gateway'],
  [/\/workers?\//, 'worker'],
  [/\/queues?\//, 'queue_processor'],
  [/\/cron[s]?\//, 'cron_job'],
  [/\/webhooks?\//, 'webhook_handler'],
  [/\/hooks?\//, 'hook'],
  [/\/components?\//, 'component'],
  [/\/pages?\//, 'page'],
  [/\/layouts?\//, 'layout'],
  [/\/utils?\//, 'util'],
  [/\/lib\/?/, 'lib'],
  [/\/seeds?\//, 'seed'],
  [/\/fixtures?\//, 'fixture'],
  [/\/config[s]?\//, 'config'],
  [/\/types?\//, 'type'],
  [/\/interfaces?\//, 'interface'],
  [/\/schemas?\//, 'schema'],
  [/\/migrations?\//, 'migration'],
  [/\/scripts?\//, 'script'],
  [/\/assets?\//, 'asset'],
  [/\/styles?\//, 'style'],
  [/\/docs?\//, 'doc'],
];

const ROLE_BY_CONTENT_PATTERNS: [RegExp, ScopeFileRole][] = [
  [/@Controller\(/, 'controller'],
  [/@Injectable\(\)/, 'provider'],
  [/@Component/, 'component'],
  [/@Module\(/, 'module'],
  [/@Resolver\(/, 'resolver'],
  [/@WebSocketGateway\(/, 'gateway'],
  [/@Cron\(/, 'cron_job'],
  [/@Processor\(/, 'queue_processor'],
  [/@WebhookHandler/, 'webhook_handler'],
  [/@Middleware\(/, 'middleware'],
  [/@Guard\(/, 'guard'],
  [/use client/, 'component'],
  [/"use client"/, 'component'],
  [/describe\(/, 'test'],
  [/it\(/, 'test'],
  [/test\(/, 'test'],
  [/expect\(/, 'test'],
  [/(?:export default function|export function)/, 'component'],
  [/model\s+\w+\s*{/, 'schema'],
  [/enum\s+\w+\s*{/, 'type'],
  [/interface\s+\w+/, 'interface'],
  [/type\s+\w+\s*=/, 'type'],
];

const IMPORT_REGEX =
  /(?:(?:import\s+(?:[\s\S]*?)\s+from\s+)|(?:import\s+))['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|(?:export\s+(?:[\s\S]*?)\s+from\s+)['"]([^'"]+)['"]/g;

const EXPORT_REGEX =
  /\bexport\s+(?:default\s+|const\s+|function\s+|class\s+|let\s+|var\s+|async\s+function\s+|type\s+|interface\s+|enum\s+|abstract\s+class\s+|\*)/g;

const RESOLVE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

function classifyFileExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext || '<none>';
}

function isTestFile(filePath: string): boolean {
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  return false;
}

function isGeneratedFile(filePath: string): boolean {
  for (const pattern of GENERATED_FILE_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  return false;
}

function isProtectedFile(filePath: string): boolean {
  for (const pattern of PROTECTED_PATH_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  return false;
}

function isSourceFile(filePath: string, extension: string): boolean {
  const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  return sourceExtensions.has(extension) && !isTestFile(filePath);
}

function classifyFileRole(filePath: string, content: string): ScopeFileRole {
  for (const [pattern, role] of ROLE_BY_PATH_PATTERNS) {
    if (pattern.test(filePath)) return role;
  }

  if (isTestFile(filePath)) return 'test';

  for (const [pattern, role] of ROLE_BY_CONTENT_PATTERNS) {
    if (pattern.test(content)) return role;
  }

  return 'unknown';
}

function computeExecutionMode(
  filePath: string,
  extension: string,
  isProtected: boolean,
): ScopeExecutionMode {
  if (isProtected) return 'human_required';

  const nonExecutableExtensions = new Set([
    '.md',
    '.mdx',
    '.html',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.webp',
    '.env',
    '.env.example',
  ]);
  if (nonExecutableExtensions.has(extension)) return 'not_executable';

  const observationExtensions = new Set([
    '.json',
    '.yml',
    '.yaml',
    '.css',
    '.scss',
    '.less',
    '.graphql',
    '.gql',
  ]);
  if (observationExtensions.has(extension)) return 'observation_only';

  if (isTestFile(filePath)) return 'ai_safe';

  return 'ai_safe';
}

function extractImports(filePath: string, content: string): string[] {
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(IMPORT_REGEX.source, 'g');

  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1] || match[2] || match[3];
    if (!importPath || importPath.startsWith('@types/')) continue;
    imports.push(importPath);
  }

  return imports;
}

function hasExports(content: string): boolean {
  EXPORT_REGEX.lastIndex = 0;
  return EXPORT_REGEX.test(content) || /module\.exports\b/.test(content);
}

function resolveImportPath(
  importSpec: string,
  importerDir: string,
  allKnownPaths: Set<string>,
): string | null {
  if (importSpec.startsWith('.')) {
    const rawCandidate = path.resolve(importerDir, importSpec);
    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = rawCandidate + ext;
      if (allKnownPaths.has(candidate)) return candidate;
    }
    if (allKnownPaths.has(rawCandidate)) return rawCandidate;
    return null;
  }
  return importSpec;
}

function walkFiles(dir: string, files: string[]): void {
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
      if (!entry.startsWith('.') && entry !== 'node_modules') {
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

function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function classifyFileRolePublic(filePath: string, content: string): ScopeFileRole {
  return classifyFileRole(filePath, content);
}

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
  const isTest = isTestFile(filePath);
  const isGenerated = isGeneratedFile(filePath);
  const isProtected = isProtectedFile(filePath);
  const executionMode = computeExecutionMode(filePath, extension, isProtected);
  const contentHash = computeContentHash(content);
  const now = new Date().toISOString();

  let status: ScopeFileStatus = 'classified';
  if (role === 'unknown') status = 'unknown';

  return {
    filePath,
    relativePath,
    extension,
    status,
    role,
    isSource: isSourceFile(filePath, extension),
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
    classificationConfidence: role !== 'unknown' ? 85 : 30,
  };
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
    const isTest = isTestFile(filePath);
    const isGenerated = isGeneratedFile(filePath);
    const isProtected = isProtectedFile(filePath);
    const executionMode = computeExecutionMode(filePath, extension, isProtected);
    const contentHash = computeContentHash(content);
    const now = new Date().toISOString();

    let status: ScopeFileStatus = 'classified';
    if (role === 'unknown' && isSourceFile(filePath, extension)) {
      status = 'unknown';
    }

    if (isSourceFile(filePath, extension)) sourceFiles++;
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
      isSource: isSourceFile(filePath, extension),
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

// ─── Real-time File Watcher (30s detection window) ────────────────────────

interface WatchEvent {
  eventType: 'rename' | 'change';
  filename: string;
  timestamp: number;
}

interface ScopeWatcherState {
  rootDir: string;
  lastScanAt: number;
  lastState: ScopeEngineState | null;
  pendingEvents: Map<string, WatchEvent>;
  scanTimer: ReturnType<typeof setTimeout> | null;
  watchers: fs.FSWatcher[];
  stopped: boolean;
}

const WATCHABLE_FALLBACK_DIRECTORIES = [
  'backend/src',
  'frontend/src',
  'frontend-admin/src',
  'worker/src',
  'scripts',
  'prisma',
  'docs',
];

function discoverPrismaRoots(rootDir: string): string[] {
  const roots = new Set<string>();
  try {
    for (const entry of readDir(rootDir, { recursive: true }) as string[]) {
      const normalized = String(entry).split(path.sep).join('/');
      if (normalized.split('/').some((part) => IGNORED_DIRECTORIES.has(part))) continue;
      if (path.basename(normalized) === 'schema.prisma') {
        roots.add(path.dirname(safeJoin(rootDir, normalized)));
      }
    }
  } catch {
    return [];
  }
  return [...roots];
}

function discoverWatchableDirectories(rootDir: string): string[] {
  const dynamicRoots = detectSourceRoots(rootDir)
    .filter((root) => root.availability === 'inferred')
    .map((root) => root.absolutePath);
  const prismaRoots = discoverPrismaRoots(rootDir);
  const inferred = [...new Set([...dynamicRoots, ...prismaRoots])];
  if (inferred.length > 0) return inferred;
  return WATCHABLE_FALLBACK_DIRECTORIES.map((d) => safeJoin(rootDir, d));
}

function watchableAbsolutePaths(rootDir: string): string[] {
  const candidates = discoverWatchableDirectories(rootDir);
  return candidates.filter((p) => {
    try {
      return statPath(p).isDirectory();
    } catch {
      return false;
    }
  });
}

function isWatchableFilePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!SCANNABLE_EXTENSIONS.has(ext)) return false;

  const segments = filePath.split(path.sep);
  const ignoreSet = IGNORED_DIRECTORIES;
  for (const segment of segments) {
    if (ignoreSet.has(segment)) return false;
  }

  return true;
}

function handleWatcherEvent(
  watcherState: ScopeWatcherState,
  eventType: 'rename' | 'change',
  filename: string,
): void {
  const fullPath = path.join(watcherState.rootDir, filename);

  if (!isWatchableFilePath(fullPath)) return;

  const now = Date.now();
  watcherState.pendingEvents.set(fullPath, {
    eventType,
    filename,
    timestamp: now,
  });

  if (process.env.PULSE_SCOPE_DEBUG === '1') {
    console.warn(`[scope-engine] watch event: ${eventType} ${filename}`);
  }

  scheduleScan(watcherState);
}

const SCAN_DEBOUNCE_MS = 5_000;

function scheduleScan(watcherState: ScopeWatcherState): void {
  if (watcherState.stopped) return;

  if (watcherState.scanTimer !== null) {
    clearTimeout(watcherState.scanTimer);
  }

  watcherState.scanTimer = setTimeout(() => {
    processPendingEvents(watcherState);
  }, SCAN_DEBOUNCE_MS);
}

function processPendingEvents(watcherState: ScopeWatcherState): void {
  if (watcherState.stopped || watcherState.pendingEvents.size === 0) return;

  const scanStart = Date.now();
  const events = new Map(watcherState.pendingEvents);
  watcherState.pendingEvents.clear();

  if (process.env.PULSE_SCOPE_DEBUG === '1') {
    console.warn(`[scope-engine] processing ${events.size} pending events`);
  }

  const state = buildScopeEngineState(watcherState.rootDir, watcherState.lastState ?? undefined);
  watcherState.lastState = state;
  watcherState.lastScanAt = Date.now();

  const detectedWithin = Date.now() - scanStart;
  const newlyDetected = state.newFilesSinceLastRun.length;
  const newlyModified = state.modifiedFilesSinceLastRun.length;
  const newlyDeleted = state.deletedFilesSinceLastRun.length;

  if (newlyDetected > 0 || newlyModified > 0 || newlyDeleted > 0) {
    if (process.env.PULSE_SCOPE_DEBUG === '1') {
      console.warn(
        `[scope-engine] scan completed in ${detectedWithin}ms: ` +
          `${newlyDetected} new, ${newlyModified} modified, ${newlyDeleted} deleted`,
      );
    }
  }

  const zeroUnknownReport = validateZeroUnknown(state);
  if (!zeroUnknownReport.passed) {
    if (process.env.PULSE_SCOPE_DEBUG === '1') {
      console.warn(
        `[scope-engine] zero-unknown: ${zeroUnknownReport.unknownFiles} unknown, ` +
          `${zeroUnknownReport.criticalOrphans} critical orphans`,
      );
    }
  }
}

export interface ScopeWatcherHandle {
  stop: () => void;
  getLastState: () => ScopeEngineState | null;
  runFullScan: () => ScopeEngineState;
}

export function startScopeWatcher(rootDir: string): ScopeWatcherHandle {
  if (process.env.PULSE_SCOPE_DEBUG === '1') {
    console.warn(`[scope-engine] starting watcher for ${rootDir}`);
  }

  const watcherState: ScopeWatcherState = {
    rootDir,
    lastScanAt: 0,
    lastState: null,
    pendingEvents: new Map(),
    scanTimer: null,
    watchers: [],
    stopped: false,
  };

  const initial = buildScopeEngineState(rootDir);
  watcherState.lastState = initial;
  watcherState.lastScanAt = Date.now();

  const watchDirs = watchableAbsolutePaths(rootDir);

  for (const watchDir of watchDirs) {
    try {
      const watcher = fs.watch(
        watchDir,
        { recursive: true, persistent: false },
        (eventType, filename) => {
          if (!filename) return;
          handleWatcherEvent(watcherState, eventType as 'rename' | 'change', filename);
        },
      );

      watcher.on('error', (err) => {
        if (process.env.PULSE_SCOPE_DEBUG === '1') {
          console.warn(`[scope-engine] watcher error on ${watchDir}: ${err.message}`);
        }
      });

      watcherState.watchers.push(watcher);

      if (process.env.PULSE_SCOPE_DEBUG === '1') {
        console.warn(`[scope-engine] watching directory: ${watchDir}`);
      }
    } catch {
      if (process.env.PULSE_SCOPE_DEBUG === '1') {
        console.warn(`[scope-engine] failed to watch directory: ${watchDir}`);
      }
    }
  }

  if (watcherState.watchers.length === 0) {
    if (process.env.PULSE_SCOPE_DEBUG === '1') {
      console.warn('[scope-engine] no directories to watch, falling back to polling');
    }
    startPollingWatcher(watcherState);
  }

  return {
    stop: () => {
      watcherState.stopped = true;
      if (watcherState.scanTimer) {
        clearTimeout(watcherState.scanTimer);
      }
      for (const w of watcherState.watchers) {
        try {
          w.close();
        } catch {
          // already closed
        }
      }
      watcherState.watchers = [];
    },
    getLastState: () => watcherState.lastState,
    runFullScan: () => {
      const state = buildScopeEngineState(rootDir, watcherState.lastState ?? undefined);
      watcherState.lastState = state;
      watcherState.lastScanAt = Date.now();
      return state;
    },
  };
}

const POLL_INTERVAL_MS = 10_000;

function startPollingWatcher(watcherState: ScopeWatcherState): void {
  const poll = () => {
    if (watcherState.stopped) return;

    try {
      const state = buildScopeEngineState(
        watcherState.rootDir,
        watcherState.lastState ?? undefined,
      );

      const changes =
        state.newFilesSinceLastRun.length +
        state.modifiedFilesSinceLastRun.length +
        state.deletedFilesSinceLastRun.length;

      if (changes > 0 || process.env.PULSE_SCOPE_DEBUG === '1') {
        watcherState.lastState = state;
        watcherState.lastScanAt = Date.now();

        const zeroUnknownReport = validateZeroUnknown(state);
        if (!zeroUnknownReport.passed && process.env.PULSE_SCOPE_DEBUG === '1') {
          console.warn(
            `[scope-engine] poll: ${zeroUnknownReport.unknownFiles} unknown, ` +
              `${zeroUnknownReport.criticalOrphans} critical orphans`,
          );
        }
      }
    } catch {
      // polling failure is non-fatal
    }

    watcherState.scanTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  watcherState.scanTimer = setTimeout(poll, POLL_INTERVAL_MS);
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
      `[scope-engine] ${state.summary.totalFiles} files | ` +
        `${state.summary.sourceFiles} source | ` +
        `${state.summary.testFiles} test | ` +
        `${state.summary.classifiedFiles} classified | ` +
        `${state.summary.unknownFiles} unknown | ` +
        `${state.summary.orphanFiles} orphans (${state.summary.criticalOrphanFiles} critical)`,
    );
  }
}
