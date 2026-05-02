#!/usr/bin/env node
/**
 * Findings Watch — long-running daemon that detects file changes in the
 * workspace and keeps FINDINGS_AGGREGATE.json + Obsidian vault sidecars
 * up to date in near real time.
 *
 * CLI surface:
 *   node scripts/orchestration/findings-watch.mjs --start          # daemon (default)
 *   node scripts/orchestration/findings-watch.mjs --once           # one full pass, exit
 *   node scripts/orchestration/findings-watch.mjs --rescan-full    # signal running daemon
 *   node scripts/orchestration/findings-watch.mjs --quiet          # suppress non-error logs
 *   node scripts/orchestration/findings-watch.mjs --pause / --resume   # via PID file
 *
 * NOT constitution-locked.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  watch,
} from 'node:fs';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { SEVERITY_WEIGHT, assertFinding } from '../findings-engines/_schema.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..'));
const AGGREGATE_PATH = resolve(REPO_ROOT, 'FINDINGS_AGGREGATE.json');
const AGGREGATE_SCRIPT = resolve(REPO_ROOT, 'scripts', 'ops', 'aggregate-findings.mjs');
const EMIT_SCRIPT = resolve(REPO_ROOT, 'scripts', 'ops', 'emit-findings-sidecars.mjs');
const PID_FILE = '/tmp/kloel-findings-watch.pid';

const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

const SLOW_LANE_THROTTLE_MS = 30_000;
const FAST_LANE_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 1_000;

const FAST_LANE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx']);

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
const WORKSPACE_ROOTS = ['backend', 'frontend', 'frontend-admin', 'worker'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let quiet = false;
let startedAt = null;
let paused = false;

// Per-file debounce timers: absPath → Timeout
const fileTimers = new Map();

// Full-aggregate throttle
let lastSlowLaneRun = 0;
let slowLaneTimer = null;
let slowLanePending = false;

// PID file poll interval reference
let pollTimer = null;

// fs.watch handle
let watcher = null;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * @param {string} kind
 * @param {string} [detail]
 */
function log(kind, detail) {
  if (quiet && kind !== 'error') return;
  const ts = new Date().toISOString();
  const line = detail ? `[${ts}] ${kind} ${detail}\n` : `[${ts}] ${kind}\n`;
  process.stderr.write(line);
}

// ---------------------------------------------------------------------------
// PID / control file
// ---------------------------------------------------------------------------

function readPidFile() {
  try {
    const raw = readFileSync(PID_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writePidFile(state) {
  writeFileSync(PID_FILE, JSON.stringify(state, null, 2));
}

function pidIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  const existing = readPidFile();
  if (existing && existing.pid && pidIsLive(existing.pid)) {
    process.stderr.write(
      `findings-watch: another watcher is already running (pid=${existing.pid})\n`,
    );
    process.exit(2);
  }
  const state = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    paused: false,
    rescanRequested: false,
  };
  writePidFile(state);
}

function releaseLock() {
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
function shouldIgnore(absPath) {
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
function findWorkspaceRoot(absPath) {
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
function workspaceRelative(wsRoot, absPath) {
  return relative(wsRoot, absPath);
}

/**
 * Compute an ESLint severity → Severity mapping.
 * @param {number} severity
 * @returns {('critical' | 'high' | 'medium' | 'low')}
 */
function eslintSeverityToSeverity(severity) {
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
function sidecarPathFor(repoRelativeFile) {
  const rel = repoRelativeFile.replace(/\\/g, '/');
  return join(SOURCE_MIRROR_DIR, rel + '.findings.json');
}

/**
 * @param {string} path
 * @param {string} content
 */
function writeAtomic(path, content) {
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
function buildSidecar(fileEntry, generatedAt) {
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
// Aggregate patch helpers (fast lane)
// ---------------------------------------------------------------------------

/**
 * Compute dominant severity for an array of findings.
 * @param {any[]} findings
 * @returns {string|null}
 */
function dominantSeverity(findings) {
  let max = null;
  let maxW = -1;
  for (const f of findings) {
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
function readAggregate() {
  try {
    if (!existsSync(AGGREGATE_PATH)) return null;
    return JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Patch the aggregate: replace ESLint findings for a single file.
 * @param {string} repoRelative — repo-relative path (forward slashes)
 * @param {any[]} newFindings — new Finding[] from scoped ESLint run
 */
function patchAggregate(repoRelative, newFindings) {
  let agg = readAggregate();
  if (!agg || !Array.isArray(agg.files)) {
    agg = {
      generatedAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      engines: {},
      totals: {
        findings: 0,
        filesWithFindings: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
      files: [],
    };
  }

  const generatedAt = new Date().toISOString();
  agg.generatedAt = generatedAt;

  // Remove the file entry if it exists (we rebuild it)
  const idx = agg.files.findIndex((f) => f.file === repoRelative);

  let fileEntry;
  if (idx >= 0) {
    fileEntry = agg.files[idx];
    // Remove old ESLint findings
    fileEntry.findings = fileEntry.findings.filter((f) => f.engine !== 'eslint');
  }

  if (newFindings.length === 0 && idx < 0) {
    // No file entry and no new findings — nothing to do
    return;
  }

  if (newFindings.length === 0 && idx >= 0) {
    // No new findings, and we removed ESLint ones. If file has no findings left, remove it.
    if (fileEntry.findings.length === 0) {
      agg.files.splice(idx, 1);
    } else {
      // Recalculate stats
      fileEntry.count = fileEntry.findings.length;
      fileEntry.dominantSeverity = dominantSeverity(fileEntry.findings);
      fileEntry.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      fileEntry.categories = [];
      const catSet = new Set();
      for (const f of fileEntry.findings) {
        fileEntry.severityCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry.categories = Array.from(catSet).sort();
    }
  }

  if (newFindings.length > 0) {
    if (idx >= 0) {
      // Merge into existing entry
      fileEntry.findings.push(...newFindings);
      fileEntry.count = fileEntry.findings.length;
      fileEntry.dominantSeverity = dominantSeverity(fileEntry.findings);
      fileEntry.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const catSet = new Set();
      for (const f of fileEntry.findings) {
        fileEntry.severityCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry.categories = Array.from(catSet).sort();
    } else {
      // New file entry
      const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      const catSet = new Set();
      for (const f of newFindings) {
        sevCounts[f.severity]++;
        catSet.add(f.category);
      }
      fileEntry = {
        file: repoRelative,
        count: newFindings.length,
        dominantSeverity: dominantSeverity(newFindings),
        severityCounts: sevCounts,
        categories: Array.from(catSet).sort(),
        findings: newFindings,
      };
      agg.files.push(fileEntry);
    }
  }

  // Re-sort files
  agg.files.sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.dominantSeverity] ?? 0;
    const sb = SEVERITY_WEIGHT[b.dominantSeverity] ?? 0;
    if (sa !== sb) return sb - sa;
    if (a.count !== b.count) return b.count - a.count;
    return a.file.localeCompare(b.file);
  });

  // Recalculate totals
  let total = 0;
  const sevs = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of agg.files) {
    total += f.count;
    for (const s of ['critical', 'high', 'medium', 'low']) {
      sevs[s] += f.severityCounts[s];
    }
  }
  agg.totals = {
    findings: total,
    filesWithFindings: agg.files.length,
    bySeverity: sevs,
  };

  // Update eslint engine metadata
  if (agg.engines && agg.engines.eslint) {
    let eslintTotal = 0;
    for (const f of agg.files) {
      eslintTotal += f.findings.filter((x) => x.engine === 'eslint').length;
    }
    agg.engines.eslint.findingsCount = eslintTotal;
    agg.engines.eslint.ranAt = generatedAt;
  }

  try {
    writeFileSync(AGGREGATE_PATH, JSON.stringify(agg, null, 2));
  } catch (e) {
    log('error', `patchAggregate write failed: ${e.message}`);
  }
}

/**
 * Emit sidecar for a single file from the current aggregate.
 * @param {string} repoRelative
 */
/**
 * Remove the sidecar AND any aggregate entries for a deleted source file.
 * Called on `unlink` events so test 3 (delete file → sidecar gone) passes
 * without waiting for the slow-lane full re-aggregate.
 */
function removeSidecarFor(absPath) {
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

function emitSingleSidecar(repoRelative) {
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

// ---------------------------------------------------------------------------
// Scoped ESLint (fast lane)
// ---------------------------------------------------------------------------

/**
 * Run scoped ESLint for a single file and convert to Finding[].
 * @param {string} absPath — absolute path to the changed file
 * @returns {Promise<any[]>}
 */
function runScopedEslint(absPath) {
  return new Promise((resolvePromise) => {
    const wsRoot = findWorkspaceRoot(absPath);
    if (!wsRoot) {
      resolvePromise([]);
      return;
    }

    const relPath = workspaceRelative(wsRoot, absPath);
    const start = Date.now();

    const child = spawn(
      'npx',
      ['--no-install', 'eslint', '--format', 'json', '--no-error-on-unmatched-pattern', relPath],
      {
        cwd: wsRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      if (code === null) {
        log('error', `eslint-fast: killed for ${absPath}`);
        resolvePromise([]);
        return;
      }

      if (stderr.trim() && code !== 0) {
        // ESLint may write warnings to stderr even on success, only log if non-zero
        log('error', `eslint-fast stderr (exit ${code}): ${stderr.slice(0, 300)}`);
      }

      let results;
      try {
        results = JSON.parse(stdout);
      } catch {
        log('error', `eslint-fast: stdout not JSON for ${absPath}`);
        resolvePromise([]);
        return;
      }

      if (!Array.isArray(results) || results.length === 0) {
        resolvePromise([]);
        return;
      }

      const findings = [];
      const repoRel = relative(REPO_ROOT, absPath).split(sep).join('/');

      for (const fileResult of results) {
        if (!fileResult.messages) continue;
        for (const m of fileResult.messages) {
          if (
            m.ruleId === 'eslint' &&
            m.message === 'File ignored because no matching configuration was supplied.'
          ) {
            continue;
          }
          const sev = eslintSeverityToSeverity(m.severity);
          const line = m.line !== undefined && m.line > 0 ? m.line : undefined;
          const column = m.column !== undefined && m.column > 0 ? m.column : undefined;

          const fingerprint = crypto
            .createHash('sha1')
            .update(`${repoRel}:${line ?? 0}:${m.ruleId || 'unknown'}:${m.message}`)
            .digest('hex')
            .slice(0, 16);

          const finding = {
            file: repoRel,
            line,
            column,
            category: 'lint',
            severity: sev,
            engine: 'eslint',
            rule: m.ruleId || 'unknown',
            message: m.message,
            fingerprint,
          };

          try {
            assertFinding(finding);
            findings.push(finding);
          } catch {
            // Skip invalid finding
          }
        }
      }

      log('eslint-fast', `${repoRel} → ${findings.length} findings (${durationMs}ms)`);
      resolvePromise(findings);
    });

    child.on('error', (e) => {
      log('error', `eslint-fast spawn error for ${absPath}: ${e.message}`);
      resolvePromise([]);
    });
  });
}

// ---------------------------------------------------------------------------
// Full aggregate (slow lane)
// ---------------------------------------------------------------------------

/**
 * Run full aggregate + emit sidecars. Returns a promise that resolves
 * when both scripts have completed.
 * @returns {Promise<void>}
 */
function runFullAggregate() {
  return new Promise((resolveOverall) => {
    log('aggregate-trigger', 'full re-aggregate');

    const aggChild = spawn('node', [AGGREGATE_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: 'inherit',
    });

    aggChild.on('close', (aggCode) => {
      if (aggCode !== 0) {
        log('error', `aggregate-findings.mjs exited ${aggCode}`);
      }

      log('aggregate-done', `exit=${aggCode}`);

      // Emit sidecars after aggregate
      const emitChild = spawn('node', [EMIT_SCRIPT], {
        cwd: REPO_ROOT,
        env: { ...process.env },
        stdio: 'inherit',
      });

      emitChild.on('close', (emitCode) => {
        if (emitCode !== 0) {
          log('error', `emit-findings-sidecars.mjs exited ${emitCode}`);
        }
        resolveOverall();
      });

      emitChild.on('error', (e) => {
        log('error', `emit-findings-sidecars.mjs spawn error: ${e.message}`);
        resolveOverall();
      });
    });

    aggChild.on('error', (e) => {
      log('error', `aggregate-findings.mjs spawn error: ${e.message}`);
      resolveOverall();
    });
  });
}

/**
 * Schedule a full aggregate with 30s leading-edge throttle.
 * Called on every file change event.
 */
function scheduleSlowLane() {
  const now = Date.now();
  const elapsed = now - lastSlowLaneRun;

  if (elapsed >= SLOW_LANE_THROTTLE_MS || lastSlowLaneRun === 0) {
    // Leading edge: run immediately
    lastSlowLaneRun = now;
    slowLanePending = false;

    runFullAggregate().catch(() => {
      /* caught inside */
    });
    return;
  }

  // Schedule a trailing run
  if (slowLanePending) return; // already scheduled

  slowLanePending = true;
  const remaining = SLOW_LANE_THROTTLE_MS - elapsed;

  slowLaneTimer = setTimeout(() => {
    slowLaneTimer = null;
    lastSlowLaneRun = Date.now();
    slowLanePending = false;

    runFullAggregate().catch(() => {
      /* caught inside */
    });
  }, remaining);
}

// ---------------------------------------------------------------------------
// Fast lane handler
// ---------------------------------------------------------------------------

/**
 * Process a file change in the fast lane (scoped ESLint).
 * @param {string} absPath
 */
function handleFastLane(absPath) {
  // Get extension to verify it's a fast-lane eligible file
  const ext = absPath.includes('.') ? '.' + absPath.split('.').pop().toLowerCase() : '';

  if (!FAST_LANE_EXTENSIONS.has(ext)) return;

  // Verify the file still exists before spawning ESLint. MacOS fs.watch
  // may deliver rename events out of order, and the file might have
  // already been removed by the time the debounce fires.
  if (!existsSync(absPath)) return;

  const repoRel = relative(REPO_ROOT, absPath).split(sep).join('/');

  runScopedEslint(absPath)
    .then((findings) => {
      patchAggregate(repoRel, findings);

      // Write the sidecar directly from the scoped results so we are
      // not gated on the aggregate being in a consistent state (it may
      // not exist yet, or may have been pruned by a concurrent unlink
      // of a sibling path).
      const scPath = sidecarPathFor(repoRel);

      if (findings.length > 0) {
        const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
        const catSet = new Set();
        for (const f of findings) {
          sevCounts[f.severity]++;
          catSet.add(f.category);
        }
        const sc = {
          schema: 'kloel.findings.v1',
          file: repoRel,
          generatedAt: new Date().toISOString(),
          count: findings.length,
          dominantSeverity: dominantSeverity(findings),
          severityCounts: sevCounts,
          categories: Array.from(catSet).sort(),
          findings: findings.map((f) => ({
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
        writeAtomic(scPath, JSON.stringify(sc, null, 2));
      } else {
        // No ESLint findings — remove via emitSingleSidecar which
        // only removes if no other engines have findings for this file.
        emitSingleSidecar(repoRel);
      }
    })
    .catch((e) => {
      log('error', `fast lane handler error for ${repoRel}: ${e.message}`);
    });
}

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

/**
 * Called on each file-change event. Dedupes by path within the
 * debounce window.
 * @param {string} absPath
 */
function onFileChanged(absPath) {
  if (paused) return;
  if (shouldIgnore(absPath)) return;

  // Clear existing timer for this file (dedup)
  const existingTimer = fileTimers.get(absPath);
  if (existingTimer) clearTimeout(existingTimer);

  fileTimers.set(
    absPath,
    setTimeout(() => {
      fileTimers.delete(absPath);
      handleFastLane(absPath);
    }, FAST_LANE_DEBOUNCE_MS),
  );

  // Also schedule a full aggregate in the slow lane
  scheduleSlowLane();
}

// ---------------------------------------------------------------------------
// Control file polling
// ---------------------------------------------------------------------------

function pollControlFile() {
  const state = readPidFile();
  if (!state) return;

  // Handle rescan request
  if (state.rescanRequested) {
    log('aggregate-trigger', 'rescan via control file');
    state.rescanRequested = false;
    try {
      writePidFile(state);
    } catch {
      /* ok */
    }

    runFullAggregate().catch(() => {
      /* caught inside */
    });
  }

  // Handle pause/resume transitions
  if (state.paused !== paused) {
    paused = state.paused;
    if (paused) {
      log('paused');
      // Drain all pending per-file timers while paused
      for (const timer of fileTimers.values()) {
        clearTimeout(timer);
      }
      fileTimers.clear();
      if (slowLaneTimer) {
        clearTimeout(slowLaneTimer);
        slowLaneTimer = null;
        slowLanePending = false;
      }
    } else {
      log('resumed');
    }
  }
}

// ---------------------------------------------------------------------------
// Watcher lifecycle
// ---------------------------------------------------------------------------

function startWatcher() {
  try {
    watcher = watch(REPO_ROOT, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      // filename from fs.watch is relative to watched dir
      const absPath = resolve(REPO_ROOT, filename);
      // Skip ignored paths (.git/, node_modules/, vault, FINDINGS_AGGREGATE.json, ...)
      // BEFORE logging so the log stays signal-only.
      if (shouldIgnore(absPath)) return;
      try {
        const kind = eventType === 'rename' ? detectRenameKind(absPath) : eventType;
        if (kind === 'change' || kind === 'add' || kind === 'unlink') {
          log(kind, filename);
          if (kind === 'unlink') {
            // Source removed → drop its sidecar from the vault.
            removeSidecarFor(absPath);
          } else {
            onFileChanged(absPath);
          }
        }
      } catch {
        log(eventType, filename);
        if (eventType !== 'rename') {
          onFileChanged(absPath);
        }
      }
    });

    watcher.on('error', (e) => {
      log('error', `fs.watch error: ${e.message}`);
      // Don't crash — macOS may emit transient errors
    });

    log('change', `watching ${REPO_ROOT}`);
  } catch (e) {
    log('error', `failed to start fs.watch: ${e.message}`);
    gracefulShutdown(1);
  }
}

/**
 * Detect whether a rename event is an add or unlink.
 * @param {string} absPath
 * @returns {string}
 */
function detectRenameKind(absPath) {
  if (existsSync(absPath)) return 'add';
  return 'unlink';
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(code) {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* ok */
    }
  }

  // Clear all timers
  for (const timer of fileTimers.values()) clearTimeout(timer);
  fileTimers.clear();

  if (slowLaneTimer) {
    clearTimeout(slowLaneTimer);
    slowLaneTimer = null;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  releaseLock();
  log('change', `shutdown (exit ${code})`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// CLI: --once
// ---------------------------------------------------------------------------

async function onceMode() {
  // Run aggregate synchronously then emit
  const aggResult = spawnSync('node', [AGGREGATE_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  if (aggResult.status !== 0) {
    process.exit(1);
  }

  const emitResult = spawnSync('node', [EMIT_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: 'inherit',
  });

  process.exit(emitResult.status === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// CLI: --pause / --resume / --rescan-full
// ---------------------------------------------------------------------------

function signalPause(pauseFlag) {
  const state = readPidFile();
  if (!state || !state.pid || !pidIsLive(state.pid)) {
    process.stderr.write('findings-watch: no running watcher found\n');
    process.exit(2);
  }
  state.paused = pauseFlag;
  writePidFile(state);
  process.stderr.write(
    `findings-watch: ${pauseFlag ? 'paused' : 'resumed'} watcher (pid=${state.pid})\n`,
  );
  process.exit(0);
}

function signalRescan() {
  const state = readPidFile();
  if (!state || !state.pid || !pidIsLive(state.pid)) {
    process.stderr.write('findings-watch: no running watcher found\n');
    process.exit(2);
  }
  state.rescanRequested = true;
  writePidFile(state);
  process.stderr.write(`findings-watch: rescan requested (pid=${state.pid})\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = new Set(args);
  if (flags.has('--quiet')) quiet = true;

  // --pause / --resume are one-shot signals
  if (flags.has('--pause')) {
    signalPause(true);
    return; // unreachable
  }
  if (flags.has('--resume')) {
    signalPause(false);
    return; // unreachable
  }
  if (flags.has('--rescan-full')) {
    signalRescan();
    return; // unreachable
  }

  // --once
  if (flags.has('--once')) {
    await onceMode();
    return; // unreachable
  }

  // --start (default)
  log('change', `findings-watch starting, repo=${REPO_ROOT}`);

  acquireLock();
  startedAt = new Date().toISOString();

  // Register signal handlers BEFORE bootstrap (SIGTERM must clean up PID file)
  process.on('SIGINT', () => gracefulShutdown(0));
  process.on('SIGTERM', () => gracefulShutdown(0));

  // Prevent unhandled rejections from crashing the daemon
  process.on('unhandledRejection', (reason) => {
    log('error', `unhandled rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (err) => {
    log('error', `uncaught exception: ${err.message}`);
  });

  // Start watching FIRST so user-side changes during bootstrap are not lost.
  pollTimer = setInterval(pollControlFile, POLL_INTERVAL_MS);
  startWatcher();

  // Bootstrap aggregate runs in background; failures are logged but do not
  // prevent the watcher from honoring file changes via the fast lane.
  log('aggregate-trigger', 'bootstrap');
  runFullAggregate().catch((e) => {
    log('error', `bootstrap aggregate failed: ${e.message}`);
  });
}

main().catch((e) => {
  log('error', `fatal: ${e.message}`);
  process.exit(1);
});
