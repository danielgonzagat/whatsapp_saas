import * as fs from 'fs';
import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { readDir, statPath } from '../../safe-fs';
import { detectSourceRoots } from '../../source-root-detector';
import { IGNORED_DIRECTORIES } from '../../scope-state.constants';
import type { ScopeEngineState } from '../../types.scope-engine';
import { SCANNABLE_EXTENSIONS } from './constants';
import { buildScopeEngineState } from './engine';
import { validateZeroUnknown } from './validation';

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
