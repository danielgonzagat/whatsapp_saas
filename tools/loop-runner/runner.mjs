#!/usr/bin/env node
// tools/loop-runner/runner.mjs — Wave 4: self-driving loop.
//
// Watches graphify-out/auto-pr-jobs/ for new job.json files and processes them
// via tools/auto-pr/runner.mjs. Idempotent: tracks processed jobs in
// graphify-out/loop-state.json so a restart doesn't re-run.
//
// CLI:
//   node tools/loop-runner/runner.mjs                # daemon mode (loops forever)
//   node tools/loop-runner/runner.mjs --once         # process current queue then exit
//   node tools/loop-runner/runner.mjs --max-prs=N    # cap PRs per run (default 5)
//   node tools/loop-runner/runner.mjs --dry-run      # commit but don't push

import { argv } from 'node:process';
import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const JOBS_DIR = join(ROOT, 'graphify-out', 'auto-pr-jobs');
const DONE_DIR = join(ROOT, 'graphify-out', 'auto-pr-jobs', '.done');
const FAILED_DIR = join(ROOT, 'graphify-out', 'auto-pr-jobs', '.failed');
const STATE = join(ROOT, 'graphify-out', 'loop-state.json');
const RUNNER = join(ROOT, 'tools', 'auto-pr', 'runner.mjs');

const ONCE = argv.includes('--once');
const DRY_RUN = argv.includes('--dry-run');
const MAX_PRS = Number(argv.find((a) => a.startsWith('--max-prs='))?.split('=')[1] || 5);
const POLL_MS = Number(argv.find((a) => a.startsWith('--poll-ms='))?.split('=')[1] || 30_000);

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE, 'utf8'));
  } catch {
    return { processed: [], failed: [], lastTick: null };
  }
}

async function saveState(s) {
  await mkdir(dirname(STATE), { recursive: true });
  await writeFile(STATE, JSON.stringify(s, null, 2));
}

async function listJobs() {
  try {
    const entries = await readdir(JOBS_DIR);
    return entries.filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort();
  } catch {
    return [];
  }
}

async function tick() {
  const state = await loadState();
  state.lastTick = new Date().toISOString();
  const jobs = await listJobs();
  const pending = jobs.filter((j) => !state.processed.includes(j) && !state.failed.includes(j));
  if (pending.length === 0) {
    console.log(`[loop] no pending jobs (${state.processed.length} processed, ${state.failed.length} failed)`);
    await saveState(state);
    return { processed: 0, opened: 0 };
  }

  const slice = pending.slice(0, MAX_PRS);
  console.log(`[loop] processing ${slice.length} of ${pending.length} pending jobs (cap=${MAX_PRS})`);

  let opened = 0;
  for (const job of slice) {
    const jobPath = join(JOBS_DIR, job);
    console.log(`[loop] → ${job}`);
    const result = await processJob(jobPath);
    if (result.ok) {
      state.processed.push(job);
      opened++;
      await mkdir(DONE_DIR, { recursive: true });
      await rename(jobPath, join(DONE_DIR, job));
    } else {
      state.failed.push(job);
      await mkdir(FAILED_DIR, { recursive: true });
      await rename(jobPath, join(FAILED_DIR, job));
      console.log(`[loop] ✗ ${job}: ${result.error}`);
    }
    await saveState(state);
  }
  return { processed: slice.length, opened };
}

function processJob(jobPath) {
  return new Promise((resolve) => {
    const args = [RUNNER, jobPath];
    if (DRY_RUN) args.push('--dry-run');
    const child = spawn('node', args, { cwd: ROOT, env: process.env });
    let combined = '';
    child.stdout?.on('data', (d) => {
      const s = d.toString();
      process.stdout.write(s);
      combined += s;
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      process.stderr.write(s);
      combined += s;
    });
    child.on('exit', (code) => {
      if (code === 0 && /opened:/.test(combined)) {
        resolve({ ok: true });
      } else if (code === 0) {
        resolve({ ok: true, note: 'no opened URL detected' });
      } else {
        resolve({ ok: false, error: `exit ${code}` });
      }
    });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

async function main() {
  if (ONCE) {
    const r = await tick();
    console.log(`[loop] one-shot done: ${r.processed} jobs, ${r.opened} PRs opened`);
    return;
  }
  console.log(`[loop] daemon starting (poll=${POLL_MS}ms max-prs=${MAX_PRS})`);
  // SIGINT graceful stop
  let stopped = false;
  process.on('SIGINT', () => {
    console.log('[loop] SIGINT received — finishing tick then exiting');
    stopped = true;
  });
  while (!stopped) {
    try {
      await tick();
    } catch (err) {
      console.error(`[loop] tick error: ${err.message}`);
    }
    if (stopped) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log('[loop] exited');
}

await main();
