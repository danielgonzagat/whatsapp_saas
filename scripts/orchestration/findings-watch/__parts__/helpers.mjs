/**
 * Findings Watch — helpers: constants, state, logging, PID helpers,
 * path helpers, and sidecar utilities shared across all parts.
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEVERITY_WEIGHT } from '../../../findings-engines/_schema.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(
  process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..', '..', '..'),
);
export const AGGREGATE_PATH = resolve(REPO_ROOT, 'FINDINGS_AGGREGATE.json');
export const AGGREGATE_SCRIPT = resolve(REPO_ROOT, 'scripts', 'ops', 'aggregate-findings.mjs');
export const EMIT_SCRIPT = resolve(REPO_ROOT, 'scripts', 'ops', 'emit-findings-sidecars.mjs');
export const PID_FILE = '/tmp/kloel-findings-watch.pid';

const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
export const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

export const SLOW_LANE_THROTTLE_MS = 30_000;
export const FAST_LANE_DEBOUNCE_MS = 300;
export const POLL_INTERVAL_MS = 1_000;

export const FAST_LANE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']);

const IGNORE_SEGMENTS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'artifacts',
  '.next',
  '.turbo',
  '.vercel',
  '.railway',
];

const IGNORE_CONTAINING = ['Obsidian Vault', '99 - Espelho do Codigo'];

const IGNORE_EXTENSIONS = new Set(['log', 'tmp', 'lock']);

const IGNORE_NAMES = new Set(['.DS_Store', 'FINDINGS_AGGREGATE.json']);

// Workspace roots (directories containing eslint.config.mjs)
export const WORKSPACE_ROOTS = ['backend', 'frontend', 'frontend-admin', 'worker'];

// ---------------------------------------------------------------------------
// Mutable state (shared across all parts via this exported object)
// ---------------------------------------------------------------------------

export const state = {
  quiet: false,
  startedAt: null,
  paused: false,
  fileTimers: new Map(),
  lastSlowLaneRun: 0,
  slowLaneTimer: null,
  slowLanePending: false,
  pollTimer: null,
  watcher: null,
};

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * @param {string} kind
 * @param {string} [detail]
 */
export function log(kind, detail) {
  if (state.quiet && kind !== 'error') return;
  const ts = new Date().toISOString();
  const line = detail ? `[${ts}] ${kind} ${detail}\n` : `[${ts}] ${kind}\n`;
  process.stderr.write(line);
}

// ---------------------------------------------------------------------------
// PID / control file
// ---------------------------------------------------------------------------

export function readPidFile() {
  try {
    const raw = readFileSync(PID_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writePidFile(pidState) {
  writeFileSync(PID_FILE, JSON.stringify(pidState, null, 2));
}

export function pidIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock() {
  const existing = readPidFile();
  if (existing && existing.pid && pidIsLive(existing.pid)) {
    process.stderr.write(
      `findings-watch: another watcher is already running (pid=${existing.pid})\n`,
    );
    process.exit(2);
  }
  const pidState = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    paused: false,
    rescanRequested: false,
  };
  writePidFile(pidState);
}

export function releaseLock() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ok */
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a path should be ignored by the watcher.
 * @param {string} absPath
 * @returns {boolean}
 */
export function shouldIgnore(absPath) {
  const name = absPath.split(sep).pop() || '';
  if (IGNORE_NAMES.has(name)) return true;

  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (ext && IGNORE_EXTENSIONS.has(ext)) return true;

  const normalized = absPath.split(sep).join('/');
  if (normalized.endsWith('FINDINGS_AGGREGATE.json')) return true;

  for (const seg of IGNORE_SEGMENTS) {
    if (normalized.includes('/' + seg + '/') || normalized.endsWith('/' + seg)) {
      return true;
    }
  }

  for (const needle of IGNORE_CONTAINING) {
    if (normalized.includes(needle)) return true;
  }

  return false;
}

/**
 * Find the workspace root that contains this file, or null.
 * @param {string} absPath
 * @returns {string|null}
 */
export function findWorkspaceRoot(absPath) {
  const rel = relative(REPO_ROOT, absPath).split(sep).join('/');
  for (const ws of WORKSPACE_ROOTS) {
    if (rel === ws || rel.startsWith(ws + '/')) {
      return join(REPO_ROOT, ws);
    }
  }
  return null;
}

/**
 * Get the workspace-relative path for a file.
 * @param {string} absPath
 * @param {string} wsRoot
 * @returns {string}
 */
export function workspaceRelative(wsRoot, absPath) {
  return relative(wsRoot, absPath);
}

/**
 * Compute an ESLint severity → Severity mapping.
 * @param {number} severity
 * @returns {('critical' | 'high' | 'medium' | 'low')}
 */
export function eslintSeverityToSeverity(severity) {
  // eslint: 1=warning, 2=error. fatal → critical.
  if (severity === 2) return 'high';
  if (severity === 1) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Sidecar helpers (replicating emit-findings-sidecars patterns)
// ---------------------------------------------------------------------------

/**
 * @param {string} repoRelativeFile
 * @returns {string}
 */
export function sidecarPathFor(repoRelativeFile) {
  const rel = repoRelativeFile.replace(/\\/g, '/');
  return join(SOURCE_MIRROR_DIR, rel + '.findings.json');
}

/**
 * @param {string} path
 * @param {string} content
 */
export function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  // Use a unique tmp suffix per call to avoid races when multiple emitters
  // (fast lane + slow lane) write the same path concurrently.
  const tmp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, content);
  try {
    renameSync(tmp, path);
  } catch (e) {
    // Best-effort cleanup if rename fails for any reason.
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
}

/**
 * Build a sidecar object for a single file entry.
 * @param {object} fileEntry
 * @param {string} generatedAt
 * @returns {object}
 */
export function buildSidecar(fileEntry, generatedAt) {
  return {
    schema: 'kloel.findings.v1',
    file: fileEntry.file,
    generatedAt,
    count: fileEntry.count,
    dominantSeverity: fileEntry.dominantSeverity,
    severityCounts: fileEntry.severityCounts,
    categories: fileEntry.categories,
    findings: fileEntry.findings.map((f) => ({
      line: f.line,
      column: f.column,
      category: f.category,
      severity: f.severity,
      engine: f.engine,
      rule: f.rule,
      message: f.message,
      fingerprint: f.fingerprint,
    })),
  };
}

// ---------------------------------------------------------------------------
// Aggregate read / severity helpers
// ---------------------------------------------------------------------------

/**
 * Compute dominant severity for an array of findings.
 * @param {any[]} findings
 * @returns {string|null}
 */
export function dominantSeverity(findings) {
  let max = null;
  let maxW = -1;
  for (const f of findings) {
    // SEVERITY_WEIGHT is imported by engine.mjs which needs it for
    // the same calculation; re-export for callers that want to keep imports
    // minimal.
    const w = SEVERITY_WEIGHT[f.severity] ?? 0;
    if (w > maxW) {
      maxW = w;
      max = f.severity;
    }
  }
  return max;
}

/**
 * Read the current aggregate. Returns null if file is missing or unparseable.
 * @returns {object|null}
 */
export function readAggregate() {
  try {
    if (!existsSync(AGGREGATE_PATH)) return null;
    return JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rename detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a rename event is an add or unlink.
 * @param {string} absPath
 * @returns {string}
 */
export function detectRenameKind(absPath) {
  if (existsSync(absPath)) return 'add';
  return 'unlink';
}

// ---------------------------------------------------------------------------
// Sidecar removal (unlink events)
// ---------------------------------------------------------------------------

/**
 * Remove the sidecar AND any aggregate entries for a deleted source file.
 * Called on `unlink` events so test 3 (delete file → sidecar gone) passes
 * without waiting for the slow-lane full re-aggregate.
 */
export function removeSidecarFor(absPath) {
  const repoRel = relative(REPO_ROOT, absPath).split(sep).join('/');
  const scPath = sidecarPathFor(repoRel);
  try {
    if (existsSync(scPath)) unlinkSync(scPath);
  } catch (e) {
    log('error', `sidecar unlink failed for ${repoRel}: ${e.message}`);
  }
  // Also drop from the aggregate so the next emit doesn't recreate it.
  try {
    const agg = readAggregate();
    if (!agg) return;
    const before = agg.files.length;
    agg.files = agg.files.filter((f) => f.file !== repoRel);
    if (agg.files.length !== before) {
      writeAtomic(AGGREGATE_PATH, JSON.stringify(agg, null, 2));
    }
  } catch (e) {
    log('error', `aggregate prune failed for ${repoRel}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Single-file sidecar emission
// ---------------------------------------------------------------------------

export function emitSingleSidecar(repoRelative) {
  const agg = readAggregate();
  if (!agg) return;
  const fe = agg.files.find((f) => f.file === repoRelative);
  const scPath = sidecarPathFor(repoRelative);

  if (!fe) {
    // No findings — remove sidecar if it exists
    try {
      const p = scPath;
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ok */
    }
    return;
  }

  const sc = buildSidecar(fe, agg.generatedAt);
  try {
    writeAtomic(scPath, JSON.stringify(sc, null, 2));
  } catch (e) {
    log('error', `sidecar write failed for ${repoRelative}: ${e.message}`);
  }
}
