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

  let status: ScopeFileStatus = 'classified';
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

function hasScannableDescendant(dir: string, depthRemaining = 4): boolean {
  let entries: string[];
  try {
    entries = readDir(dir);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith('.')) continue;
    const fullPath = safeJoin(dir, entry);
    let stats;
    try {
      stats = statPath(fullPath);
    } catch {
      continue;
    }
    if (stats.isFile() && SCANNABLE_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
      return true;
    }
    if (
      stats.isDirectory() &&
      depthRemaining > 0 &&
      hasScannableDescendant(fullPath, depthRemaining - 1)
    ) {
      return true;
    }
  }

  return false;
}

function discoverFallbackWatchRoots(rootDir: string): string[] {
  let entries: string[];
  try {
    entries = readDir(rootDir);
  } catch {
    return [];
  }

  const roots: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry) || entry.startsWith('.')) continue;
    const candidate = safeJoin(rootDir, entry);
    try {
      if (statPath(candidate).isDirectory() && hasScannableDescendant(candidate)) {
        roots.push(candidate);
      }
    } catch {
      continue;
    }
  }
  return roots;
}

export function discoverWatchableDirectories(rootDir: string): string[] {
  const dynamicRoots = detectSourceRoots(rootDir)
    .filter((root) => root.availability === 'inferred')
    .map((root) => root.absolutePath);
  const prismaRoots = discoverPrismaRoots(rootDir);
  const inferred = [...new Set([...dynamicRoots, ...prismaRoots])];
  if (inferred.length > 0) return inferred;
  return discoverFallbackWatchRoots(rootDir);
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

