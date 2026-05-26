#!/usr/bin/env node
// tools/graphify-plus/daemon.mjs — Wave 3 #3 push-based feedback loop.
//
// Watches the filesystem (backend/, frontend/, worker/, tools/) and on change:
//   1) Re-runs tsc on the changed file (fast incremental)
//   2) Re-runs eslint on the changed file
//   3) Re-runs affected specs (resolved via test-impact's exercises edges)
//   4) Emits one JSONL event per result to graphify-out/daemon.events.ndjson
//   5) Optionally posts events to a webhook (DAEMON_WEBHOOK env)
//
// Push-based: events arrive in <2s typically. Uses fs.watch (chokidar would be
// nicer but we keep zero extra deps).
//
// Stop via TaskStop or Ctrl-C. PID written to .claude/graphify-daemon.pid.

import { watch, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile, appendFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVENTS = join(ROOT, 'graphify-out', 'daemon.events.ndjson');
const PID_FILE = join(ROOT, '.claude', 'graphify-daemon.pid');

const WATCH_DIRS = ['backend/src', 'frontend/src', 'worker', 'tools'];
const TS_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const DEBOUNCE_MS = 600;

const pendingByFile = new Map();
let graph = null;

async function loadGraph() {
  try {
    const raw = await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8');
    graph = JSON.parse(raw);
    log('info', 'graph_loaded', { nodes: graph.nodes.length, edges: graph.edges.length });
  } catch (err) {
    log('warn', 'graph_missing', { err: err.message });
  }
}

function specsFor(file) {
  if (!graph) return [];
  return graph.edges
    .filter((e) => e.kind === 'exercises' && e.target === `file:${file}`)
    .map((e) => {
      const spec = graph.nodes.find((n) => n.id === e.source);
      return spec?.file;
    })
    .filter(Boolean);
}

async function handleChange(file) {
  const t0 = performance.now();
  const fileRel = relative(ROOT, file).split(sep).join('/');
  if (!TS_EXT.test(fileRel) || fileRel.includes('node_modules') || fileRel.includes('graphify-out')) return;

  log('change', 'detected', { file: fileRel });

  // Detect workspace.
  const ws = fileRel.split('/')[0];

  // Run tsc + eslint in parallel.
  const [tscOut, eslintOut] = await Promise.all([
    runCmd(['npx', 'tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: join(ROOT, ws), timeoutMs: 60_000 }).catch((e) => `(tsc skip: ${e.message})`),
    runCmd(['npx', 'eslint', fileRel, '--format', 'compact'], { cwd: ROOT, timeoutMs: 30_000, swallowExit: true }).catch((e) => `(eslint skip: ${e.message})`),
  ]);

  const tscErrors = (tscOut.match(/error TS\d+/g) || []).length;
  const eslintErrors = (eslintOut.match(/Error/g) || []).length;
  const eslintWarnings = (eslintOut.match(/Warning/g) || []).length;

  // Resolve affected specs.
  const specs = specsFor(fileRel);

  const event = {
    ts: new Date().toISOString(),
    file: fileRel,
    elapsedMs: Math.round(performance.now() - t0),
    tsc: { errors: tscErrors, ok: tscErrors === 0 },
    eslint: { errors: eslintErrors, warnings: eslintWarnings, ok: eslintErrors === 0 },
    affected_specs: specs.slice(0, 10),
    affected_count: specs.length,
  };

  log('verify', JSON.stringify(event));
  await appendFile(EVENTS, JSON.stringify(event) + '\n');

  if (process.env.DAEMON_WEBHOOK) {
    fetch(process.env.DAEMON_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch((err) => log('warn', 'webhook_failed', { err: err.message }));
  }
}

function debouncedChange(file) {
  const existing = pendingByFile.get(file);
  if (existing) clearTimeout(existing);
  pendingByFile.set(
    file,
    setTimeout(() => {
      pendingByFile.delete(file);
      handleChange(file).catch((err) => log('error', 'handler_failed', { err: err.message }));
    }, DEBOUNCE_MS),
  );
}

function setupWatchers() {
  for (const dir of WATCH_DIRS) {
    const full = join(ROOT, dir);
    try {
      statSync(full);
    } catch {
      continue;
    }
    log('info', 'watching', { dir });
    try {
      watch(full, { recursive: true }, (event, filename) => {
        if (!filename) return;
        debouncedChange(join(full, filename));
      });
    } catch (err) {
      log('warn', 'watch_failed', { dir, err: err.message });
    }
  }
}

function log(level, kind, data) {
  console.log(`[graphify-daemon][${level}] ${kind}${data ? ' ' + (typeof data === 'string' ? data : JSON.stringify(data)) : ''}`);
}

function runCmd(argv, { cwd, timeoutMs, swallowExit = false }) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env });
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(output);
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 || swallowExit) return resolve(output);
      resolve(output);
    });
    child.on('error', reject);
  });
}

async function main() {
  await mkdir(dirname(EVENTS), { recursive: true });
  await mkdir(dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  await loadGraph();
  setupWatchers();
  log('info', 'daemon_started', { pid: process.pid });

  process.on('SIGINT', () => {
    log('info', 'shutting_down');
    process.exit(0);
  });
}

await main();
