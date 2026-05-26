#!/usr/bin/env node
// tools/graphify-plus/lsp-daemon.mjs — Wave 7 push-based diagnostics.
//
// Spawns `tsc --watch --noEmit --pretty false --incremental` per workspace
// and parses TypeScript's watch events to emit sub-second diagnostic deltas.
// Replaces the pull-based daemon.mjs for inner-loop feedback.
//
// Events emitted as JSONL to graphify-out/lsp-events.ndjson:
//   { ts, workspace, kind: "compile-start" | "compile-end", errors, warnings, files? }
//   { ts, workspace, kind: "diagnostic", file, line, col, severity, code, message }
//
// CLI:
//   node tools/graphify-plus/lsp-daemon.mjs                    # all 3 workspaces
//   node tools/graphify-plus/lsp-daemon.mjs --ws=backend       # one
//   node tools/graphify-plus/lsp-daemon.mjs --webhook=URL      # POST every event

import { argv } from 'node:process';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVENTS = join(ROOT, 'graphify-out', 'lsp-events.ndjson');
const PID_FILE = join(ROOT, '.claude', 'lsp-daemon.pid');

const ARGS = argv.slice(2);
const wsArg = ARGS.find((a) => a.startsWith('--ws='))?.split('=')[1];
const WEBHOOK = ARGS.find((a) => a.startsWith('--webhook='))?.split('=')[1];
const WORKSPACES = wsArg ? [wsArg] : ['backend', 'frontend', 'worker'];

// tsc --watch output line patterns
const FILE_DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;
const RECOMPILE_RE = /File change detected\. Starting incremental compilation/i;
const READY_RE = /Watching for file changes/i;
const FOUND_RE = /Found (\d+) errors?\. Watching/i;
const NO_ERRORS_RE = /Found 0 errors\. Watching/i;

async function main() {
  await mkdir(dirname(EVENTS), { recursive: true });
  await mkdir(dirname(PID_FILE), { recursive: true });
  await writeFile(PID_FILE, String(process.pid));
  log('info', 'lsp_daemon_started', { pid: process.pid, workspaces: WORKSPACES });

  // Truncate event log on start
  await writeFile(EVENTS, '');

  const children = [];
  for (const ws of WORKSPACES) {
    const tsconfig = join(ROOT, ws, 'tsconfig.json');
    log('info', 'spawning', { workspace: ws });
    const child = spawn(
      'npx',
      ['tsc', '--watch', '--noEmit', '--pretty', 'false', '--preserveWatchOutput', '-p', tsconfig],
      { cwd: join(ROOT, ws), env: process.env },
    );
    children.push({ ws, child });
    wireOutput(ws, child);
  }

  process.on('SIGINT', () => {
    log('info', 'shutting_down');
    for (const c of children) c.child.kill('SIGTERM');
    process.exit(0);
  });

  // Keep alive forever.
  process.stdin.resume?.();
}

function wireOutput(ws, child) {
  const t0Map = new Map();
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += d.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) processLine(ws, line, t0Map);
  });
  child.stderr.on('data', (d) => log('warn', 'tsc_stderr', { ws, line: d.toString().trim() }));
  child.on('exit', (code) => log('warn', 'tsc_exit', { ws, code }));
}

function processLine(ws, line, t0Map) {
  if (!line.trim()) return;
  if (RECOMPILE_RE.test(line)) {
    t0Map.set(ws, performance.now());
    emit({ ts: new Date().toISOString(), workspace: ws, kind: 'compile-start' });
    return;
  }
  const found = line.match(FOUND_RE);
  if (found) {
    const start = t0Map.get(ws) || performance.now();
    const elapsedMs = Math.round(performance.now() - start);
    emit({
      ts: new Date().toISOString(),
      workspace: ws,
      kind: 'compile-end',
      errors: Number(found[1]) || 0,
      elapsedMs,
    });
    t0Map.delete(ws);
    return;
  }
  if (READY_RE.test(line)) {
    emit({ ts: new Date().toISOString(), workspace: ws, kind: 'ready' });
    return;
  }
  const diag = line.match(FILE_DIAG_RE);
  if (diag) {
    const [, file, lineNo, col, severity, code, message] = diag;
    emit({
      ts: new Date().toISOString(),
      workspace: ws,
      kind: 'diagnostic',
      file,
      line: Number(lineNo),
      col: Number(col),
      severity,
      code,
      message,
    });
    return;
  }
}

async function emit(event) {
  await appendFile(EVENTS, JSON.stringify(event) + '\n').catch(() => {});
  process.stdout.write(`[lsp:${event.workspace}] ${event.kind}${event.errors != null ? ` errors=${event.errors}` : ''}${event.elapsedMs ? ` (${event.elapsedMs}ms)` : ''}${event.file ? ` ${event.file}:${event.line}` : ''}\n`);
  if (WEBHOOK) {
    fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {});
  }
}

function log(level, kind, data) {
  process.stdout.write(`[lsp-daemon][${level}] ${kind}${data ? ' ' + JSON.stringify(data) : ''}\n`);
}

await main();
