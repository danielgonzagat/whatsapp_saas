#!/usr/bin/env node
/**
 * OpenCode Fleet Runner — parallel subagent dispatcher.
 *
 * Reads a manifest (JSON file or stdin) describing N tasks, fans them out via
 * `opencode run -m deepseek/deepseek-v4-pro`, captures per-agent stdout/stderr
 * to artifacts/opencode-fleet/<runId>/<task-id>.{out,err,exit}, waits for all,
 * and prints a JSON summary.
 *
 * RULES (constitution: feedback_no_claude_subagents_only_opencode):
 *   - Model is HARD-LOCKED to deepseek/deepseek-v4-pro.
 *   - No flash, no chat, no reasoner.
 *   - Override at the manifest level is rejected.
 *
 * Manifest shape:
 *   {
 *     "runId": "phase1-engines-2026-05-02T17-00",     // optional; auto-generated if omitted
 *     "concurrency": 8,                                // optional; default = tasks.length
 *     "timeoutSec": 300,                               // optional; default 600
 *     "dir": "/Users/danielpenin/whatsapp_saas",       // optional; default = cwd
 *     "skipPermissions": true,                         // default true (subagents need to write)
 *     "tasks": [
 *       {
 *         "id": "engine-tsc",
 *         "prompt": "...",                             // sent as positional arg to opencode run
 *         "promptFile": "path/to/prompt.md",           // alternative to inline prompt
 *         "title": "Build TSC engine wrapper"          // optional; sent via --title
 *       },
 *       ...
 *     ]
 *   }
 *
 * Usage:
 *   node scripts/orchestration/opencode-fleet.mjs <manifest.json>
 *   echo '...' | node scripts/orchestration/opencode-fleet.mjs -
 *
 * Output:
 *   stdout = JSON summary { runId, total, ok, error, durationMs, perTask: [...] }
 *   artifacts/opencode-fleet/<runId>/ has full logs
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const REQUIRED_MODEL = 'deepseek/deepseek-v4-pro';
const DEFAULT_TIMEOUT_SEC = 600;
const ARTIFACTS_ROOT = join(REPO_ROOT, 'artifacts', 'opencode-fleet');

function readManifest(arg) {
  if (!arg || arg === '-') {
    return JSON.parse(readFileSync(0, 'utf8'));
  }
  return JSON.parse(readFileSync(resolve(arg), 'utf8'));
}

function genRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

function nowMs() {
  return Date.now();
}

/**
 * Run a single OpenCode subagent.
 * @returns {Promise<{ id: string; ok: boolean; exit: number|null; signal: string|null;
 *                     durationMs: number; outPath: string; errPath: string; promptBytes: number }>}
 */
function runOne(task, runDir, opts) {
  return new Promise((resolvePromise) => {
    const id = task.id;
    const outPath = join(runDir, `${id}.out`);
    const errPath = join(runDir, `${id}.err`);
    const exitPath = join(runDir, `${id}.exit`);
    const promptPath = join(runDir, `${id}.prompt`);

    let prompt = task.prompt;
    if (!prompt && task.promptFile) {
      prompt = readFileSync(resolve(task.promptFile), 'utf8');
    }
    if (typeof prompt !== 'string' || !prompt.length) {
      writeFileSync(errPath, `task ${id}: empty prompt`);
      writeFileSync(exitPath, '255');
      resolvePromise({
        id,
        ok: false,
        exit: 255,
        signal: null,
        durationMs: 0,
        outPath,
        errPath,
        promptBytes: 0,
      });
      return;
    }
    writeFileSync(promptPath, prompt);

    const args = ['run', '-m', REQUIRED_MODEL, '--format', 'default'];
    if (task.title) args.push('--title', task.title);
    if (opts.dir) args.push('--dir', opts.dir);
    if (opts.skipPermissions !== false) args.push('--dangerously-skip-permissions');
    args.push(prompt);

    const start = nowMs();
    const out = createWriteStream(outPath);
    const err = createWriteStream(errPath);

    const child = spawn('opencode', args, {
      cwd: opts.dir || REPO_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(out);
    child.stderr.pipe(err);

    const timeout = setTimeout(
      () => {
        child.kill('SIGKILL');
      },
      (opts.timeoutSec || DEFAULT_TIMEOUT_SEC) * 1000,
    );

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      const durationMs = nowMs() - start;
      writeFileSync(exitPath, String(code ?? -1));
      out.end();
      err.end();
      resolvePromise({
        id,
        ok: code === 0,
        exit: code,
        signal,
        durationMs,
        outPath,
        errPath,
        promptBytes: Buffer.byteLength(prompt, 'utf8'),
      });
    });

    child.on('error', (e) => {
      clearTimeout(timeout);
      err.write(`\nspawn error: ${e.message}\n`);
      const durationMs = nowMs() - start;
      writeFileSync(exitPath, '254');
      out.end();
      err.end();
      resolvePromise({
        id,
        ok: false,
        exit: 254,
        signal: null,
        durationMs,
        outPath,
        errPath,
        promptBytes: Buffer.byteLength(prompt, 'utf8'),
      });
    });
  });
}

async function runWithConcurrency(tasks, concurrency, runDir, opts) {
  const results = [];
  const queue = [...tasks];
  const inflight = new Set();

  async function dispatch() {
    while (queue.length && inflight.size < concurrency) {
      const t = queue.shift();
      const p = runOne(t, runDir, opts).then((r) => {
        inflight.delete(p);
        results.push(r);
      });
      inflight.add(p);
    }
  }

  await dispatch();
  while (inflight.size) {
    await Promise.race(inflight);
    await dispatch();
  }
  return results;
}

async function main() {
  const arg = process.argv[2];
  const manifest = readManifest(arg);

  if (!Array.isArray(manifest.tasks) || !manifest.tasks.length) {
    console.error('fleet: manifest.tasks must be non-empty array');
    process.exit(2);
  }
  // Hard-lock model: reject any attempt to override.
  for (const t of manifest.tasks) {
    if (t.model && t.model !== REQUIRED_MODEL) {
      console.error(`fleet: task ${t.id} sets model=${t.model}; only ${REQUIRED_MODEL} is allowed`);
      process.exit(3);
    }
    if (!t.id || typeof t.id !== 'string') {
      console.error('fleet: every task needs string id');
      process.exit(3);
    }
  }

  const runId = manifest.runId || genRunId();
  const concurrency = manifest.concurrency || manifest.tasks.length;
  const runDir = join(ARTIFACTS_ROOT, runId);
  mkdirSync(runDir, { recursive: true });

  const opts = {
    dir: manifest.dir || REPO_ROOT,
    timeoutSec: manifest.timeoutSec || DEFAULT_TIMEOUT_SEC,
    skipPermissions: manifest.skipPermissions !== false,
  };

  const start = nowMs();
  process.stderr.write(
    `fleet: runId=${runId} tasks=${manifest.tasks.length} concurrency=${concurrency} timeout=${opts.timeoutSec}s dir=${opts.dir}\n`,
  );

  const results = await runWithConcurrency(manifest.tasks, concurrency, runDir, opts);
  const durationMs = nowMs() - start;

  const summary = {
    runId,
    runDir,
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    error: results.filter((r) => !r.ok).length,
    durationMs,
    perTask: results
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({
        id: r.id,
        ok: r.ok,
        exit: r.exit,
        signal: r.signal,
        durationMs: r.durationMs,
        out: r.outPath,
        err: r.errPath,
        promptBytes: r.promptBytes,
      })),
  };

  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(summary.error === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('fleet: fatal', e);
  process.exit(1);
});
