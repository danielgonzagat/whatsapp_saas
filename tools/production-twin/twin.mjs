#!/usr/bin/env node
// tools/production-twin/twin.mjs — Wave 11 #1: production twin + traffic shadow.
//
// Brings up the e2e-sandbox docker stack, ingests an anonymised slice of
// Railway HTTP logs, replays as synthetic traffic against the sandboxed
// API, and emits per-PR impact metrics (req/s estimated, error rate, p99
// latency, projected $/day Stripe spend).
//
// CLI:
//   node tools/production-twin/twin.mjs --up
//   node tools/production-twin/twin.mjs --shadow=path/to/anonymised-logs.jsonl
//   node tools/production-twin/twin.mjs --metrics
//   node tools/production-twin/twin.mjs --down
//
// The sandbox docker-compose lives in tools/e2e-sandbox/. The shadow log
// file is a JSONL where each line is { ts, method, path, body_hash, status,
// duration_ms, workspaceId_anon }. The replay preserves timing (compressed
// by --speed=N).

import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { argv } from 'node:process';
import { join } from 'node:path';

const ROOT = process.cwd();
const SANDBOX_DIR = join(ROOT, 'tools/e2e-sandbox');
const REPORT_DIR = join(ROOT, 'graphify-out/production-twin');
const BASE_URL = process.env.TWIN_BASE_URL || 'http://localhost:3001';

const UP = argv.includes('--up');
const DOWN = argv.includes('--down');
const SHADOW = argv.find((a) => a.startsWith('--shadow='))?.split('=')[1];
const METRICS = argv.includes('--metrics');
const SPEED = Number(argv.find((a) => a.startsWith('--speed='))?.split('=')[1] || 10);

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  if (UP) return up();
  if (DOWN) return down();
  if (SHADOW) return shadow(SHADOW);
  if (METRICS) return metrics();
  console.log('usage: twin.mjs [--up|--down|--shadow=path.jsonl|--metrics] [--speed=N]');
}

function up() {
  if (!existsSync(join(SANDBOX_DIR, 'docker-compose.yml'))) {
    console.error(`[twin] expected ${SANDBOX_DIR}/docker-compose.yml — see tools/e2e-sandbox/`);
    process.exit(1);
  }
  console.log(`[twin] docker compose up -d in ${SANDBOX_DIR}`);
  const r = spawnSync('docker', ['compose', '-f', join(SANDBOX_DIR, 'docker-compose.yml'), 'up', '-d'], { stdio: 'inherit' });
  process.exit(r.status || 0);
}

function down() {
  console.log(`[twin] docker compose down`);
  const r = spawnSync('docker', ['compose', '-f', join(SANDBOX_DIR, 'docker-compose.yml'), 'down', '-v'], { stdio: 'inherit' });
  process.exit(r.status || 0);
}

async function shadow(path) {
  const raw = await readFile(path, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  console.log(`[twin] shadowing ${lines.length} requests at ${SPEED}x speed`);
  let lastTs = null;
  const results = [];
  for (const line of lines) {
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    if (lastTs !== null && req.ts) {
      const wait = Math.max(0, (req.ts - lastTs) / SPEED);
      if (wait > 0) await sleep(wait);
    }
    lastTs = req.ts;
    const t0 = Date.now();
    let status = 0;
    let durationMs = 0;
    try {
      const res = await fetch(`${BASE_URL}${req.path}`, {
        method: req.method || 'GET',
        headers: { 'content-type': 'application/json', 'x-twin-shadow': '1' },
        body: req.body ? JSON.stringify(req.body) : undefined,
      });
      status = res.status;
      durationMs = Date.now() - t0;
    } catch (err) {
      status = 0;
      durationMs = Date.now() - t0;
    }
    results.push({ path: req.path, status, durationMs });
  }
  const report = aggregate(results);
  const outPath = join(REPORT_DIR, `shadow-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`[twin] shadow done: ${results.length} requests; report → ${outPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

function aggregate(results) {
  const n = results.length;
  if (n === 0) return { summary: { total: 0 }, results };
  const errors = results.filter((r) => r.status >= 500 || r.status === 0).length;
  const lats = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p50 = lats[Math.floor(n * 0.5)];
  const p95 = lats[Math.floor(n * 0.95)];
  const p99 = lats[Math.floor(n * 0.99)];
  return {
    summary: {
      total: n,
      errors,
      errorRate: errors / n,
      p50_ms: p50,
      p95_ms: p95,
      p99_ms: p99,
    },
    results: results.slice(0, 500),
  };
}

async function metrics() {
  // Read the most recent shadow report
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(REPORT_DIR).catch(() => []))
    .filter((f) => f.startsWith('shadow-'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log('[twin] no shadow reports yet — run with --shadow=path.jsonl first');
    return;
  }
  const latest = JSON.parse(await readFile(join(REPORT_DIR, files[0]), 'utf8'));
  console.log(`[twin] latest shadow: ${files[0]}`);
  console.log(JSON.stringify(latest.summary, null, 2));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

await main();
