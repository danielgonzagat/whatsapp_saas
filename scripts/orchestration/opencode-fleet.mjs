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

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function killZombiesBeforeFleet() {
  try {
    const out = execFileSync('node', [join(__dirname, 'kill-opencode-zombies.mjs')], {
      encoding: 'utf8',
      timeout: 15000,
    });
    const summary = JSON.parse(out);
    if (summary.zombies > 0) {
      process.stderr.write(
        `fleet: pre-flight reaped ${summary.zombies} zombie(s) from prior runs\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`fleet: pre-flight zombie sweep skipped (${err.message})\n`);
  }
}

const REQUIRED_MODEL = 'deepseek/deepseek-v4-pro';
const DEFAULT_TIMEOUT_SEC = 600;
const ARTIFACTS_ROOT = join(REPO_ROOT, 'artifacts', 'opencode-fleet');

/**
 * Active-PID registry — written to <runDir>/pids.json so the zombie killer
 * (kill-opencode-zombies.mjs) can exempt our live children from age-based
 * reaping. Without this, any subagent running > maxAgeSec gets SIGKILLed
 * mid-task by the Stop hook.
 */
const activePids = new Set();
let pidsFile = null;

function persistActivePids() {
  if (!pidsFile) {return;}
  try {
    writeFileSync(
      pidsFile,
      JSON.stringify(
        { writtenAt: new Date().toISOString(), parentPid: process.pid, pids: [...activePids] },
        null,
        2,
      ),
    );
  } catch {
    /* best-effort; do not crash the runner over a registry write */
  }
}

function registerActivePid(pid) {
  if (!Number.isFinite(pid)) {return;}
  activePids.add(pid);
  persistActivePids();
}

function unregisterActivePid(pid) {
  if (!Number.isFinite(pid)) {return;}
  activePids.delete(pid);
  persistActivePids();
}

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

    const args = ['run', '-m', REQUIRED_MODEL, '--variant', 'max', '--format', 'default'];
    if (task.title) {args.push('--title', task.title);}
    if (opts.dir) {args.push('--dir', opts.dir);}
    if (opts.skipPermissions !== false) {args.push('--dangerously-skip-permissions');}
    args.push(prompt);

    const start = nowMs();
    const out = createWriteStream(outPath);
    const err = createWriteStream(errPath);

    const child = spawn('opencode', args, {
      cwd: opts.dir || REPO_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    registerActivePid(child.pid);

    child.stdout.pipe(out);
    child.stderr.pipe(err);

    // Reap the process group only on TIMEOUT — never on natural exit. On a
    // clean exit, the OS reaps the pgroup as part of normal shutdown; the
    // previous SIGKILL-after-100ms behavior was killing in-flight Write tool
    // calls and MCP helpers that were still flushing to disk.
    const reapTree = (sig) => {
      try {
        process.kill(-child.pid, sig);
      } catch {
        try {
          child.kill(sig);
        } catch {
          /* already gone */
        }
      }
    };

    const timeoutSec = opts.timeoutSec === undefined ? DEFAULT_TIMEOUT_SEC : opts.timeoutSec;
    const timeout =
      timeoutSec > 0
        ? setTimeout(() => {
            reapTree('SIGKILL');
          }, timeoutSec * 1000)
        : null;

    child.on('exit', (code, signal) => {
      if (timeout) {clearTimeout(timeout);}
      unregisterActivePid(child.pid);
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
      unregisterActivePid(child.pid);
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

  // OpenCode session SQLite locks during the boot window (~2s per session).
  // Spawning N subagents at once causes ~25% to fail at conc 8-10, ~70% at
  // 2 overlapping fleets. Stagger gaps each spawn by `staggerMs` (default
  // 8000ms — matches commit 3eede36ca on chore/ai-constitution-obsidian-graph-lock,
  // empirically validated safe). Override via manifest.staggerMs.
  // See: feedback_opencode_sqlite_boot_window memory.
  const staggerMs = Number.isFinite(opts.staggerMs) ? opts.staggerMs : 8000;

  async function dispatch() {
    while (queue.length && inflight.size < concurrency) {
      const t = queue.shift();
      const p = runOne(t, runDir, opts).then((r) => {
        inflight.delete(p);
        results.push(r);
      });
      inflight.add(p);
      if (queue.length && inflight.size < concurrency && staggerMs > 0) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }
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
  killZombiesBeforeFleet();
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

  pidsFile = join(runDir, 'pids.json');
  persistActivePids();

  // Graceful shutdown — when the parent (Claude wrapper, terminal, CI) is
  // signaled, terminate live children with SIGTERM, write a partial summary,
  // and exit. Without this, detached:true children become silent orphans and
  // no summary.json is ever written ("morre sem entregar").
  const shutdown = (sig) => {
    process.stderr.write(`fleet: received ${sig}, terminating ${activePids.size} live children\n`);
    for (const pid of activePids) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
    try {
      writeFileSync(
        join(runDir, 'shutdown.json'),
        JSON.stringify(
          { signal: sig, at: new Date().toISOString(), terminatedPids: [...activePids] },
          null,
          2,
        ),
      );
    } catch {
      /* best-effort */
    }
    process.exit(130);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  const opts = {
    dir: manifest.dir || REPO_ROOT,
    timeoutSec: manifest.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
    skipPermissions: manifest.skipPermissions !== false,
    staggerMs: manifest.staggerMs ?? 8000,
  };

  const start = nowMs();
  process.stderr.write(
    `fleet: runId=${runId} tasks=${manifest.tasks.length} concurrency=${concurrency} timeout=${opts.timeoutSec}s stagger=${opts.staggerMs}ms dir=${opts.dir}\n`,
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
  // Mark fleet inactive — kills the killer's exemption window for these PIDs
  // so future runs don't see stale entries blocking real zombie cleanup.
  activePids.clear();
  persistActivePids();
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(summary.error === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('fleet: fatal', e);
  process.exit(1);
});
