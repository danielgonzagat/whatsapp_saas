#!/usr/bin/env node
// Live mirror: graphify watch → regenerate Obsidian vault on graph.json change.
//
// Spawns `graphify watch .` as a child so it re-extracts on code changes,
// then polls graph.json mtime and re-runs the converter when it moves.
//
// Stop with Ctrl-C or `kill $(cat .claude/obsidian-mirror.pid)`.

import { spawn } from 'node:child_process';
import { statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const GRAPH = `${ROOT}/graphify-out/graph.json`;
const CONVERTER = `${ROOT}/tools/obsidian-from-graphify.mjs`;
const PID_FILE = `${ROOT}/.claude/obsidian-mirror.pid`;
const LOG = `${ROOT}/.claude/obsidian-mirror.log`;

mkdirSync(dirname(PID_FILE), { recursive: true });
writeFileSync(PID_FILE, String(process.pid));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG, line + '\n', { flag: 'a' }); } catch {}
}

log(`Starting obsidian-live-mirror (pid ${process.pid})`);
log(`  watching: ${GRAPH}`);
log(`  converter: ${CONVERTER}`);

// 1) Spawn graphify watch
log('Spawning `graphify watch .` ...');
const watcher = spawn('graphify', ['watch', '.'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
watcher.stdout.on('data', (b) => log(`[graphify] ${b.toString().trim()}`));
watcher.stderr.on('data', (b) => log(`[graphify err] ${b.toString().trim()}`));
watcher.on('exit', (code) => {
  log(`graphify watch exited code=${code}`);
  process.exit(code ?? 1);
});

// 2) Poll graph.json mtime, regenerate vault on change
let lastMtime = 0;
try { lastMtime = statSync(GRAPH).mtimeMs; } catch {}
log(`baseline graph.json mtime: ${new Date(lastMtime).toISOString()}`);

let regenInFlight = false;
let regenPending = false;

async function regen() {
  if (regenInFlight) { regenPending = true; return; }
  regenInFlight = true;
  log('graph.json changed → regenerating vault...');
  const t0 = Date.now();
  await new Promise((resolve) => {
    const p = spawn('node', [CONVERTER], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (b) => log(`[conv] ${b.toString().trim()}`));
    p.stderr.on('data', (b) => log(`[conv err] ${b.toString().trim()}`));
    p.on('exit', (code) => {
      log(`converter exit=${code} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
      resolve();
    });
  });
  regenInFlight = false;
  if (regenPending) { regenPending = false; setTimeout(regen, 100); }
}

setInterval(() => {
  try {
    const m = statSync(GRAPH).mtimeMs;
    if (m > lastMtime) {
      lastMtime = m;
      regen();
    }
  } catch {}
}, 2000);

function shutdown(signal) {
  log(`Received ${signal}, killing graphify watch...`);
  try { watcher.kill('SIGTERM'); } catch {}
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
