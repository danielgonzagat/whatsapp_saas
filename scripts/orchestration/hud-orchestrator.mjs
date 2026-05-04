#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..'));
const OPS_DIR = join(REPO_ROOT, 'scripts', 'ops');
const ORCH_DIR = join(REPO_ROOT, 'scripts', 'orchestration');
const OBSIDIAN_DIR = join(REPO_ROOT, 'scripts');
const REFRESH_LOG_PATH = join(REPO_ROOT, 'HUD_LAST_REFRESH.json');
const PID_FILE = '/tmp/kloel-hud-orchestrator.pid';
const DEFAULT_WATCH_MINUTES = 5;

const STEP_TIMEOUT_MS = 180_000;

const POLL_INTERVAL_MS = 60_000;
const WATCH_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
  '.json',
  '.prisma',
  '.yml',
  '.yaml',
  '.md',
  '.css',
  '.scss',
  '.html',
]);

const IGNORE_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.obsidian',
]);

const PIPELINE = [
  {
    name: 'aggregate-findings',
    script: join(OPS_DIR, 'aggregate-findings.mjs'),
    condition: () => isFindingsStale(),
    optional: false,
  },
  {
    name: 'emit-findings-sidecars',
    script: join(OPS_DIR, 'emit-findings-sidecars.mjs'),
    optional: false,
  },
  {
    name: 'severity-tags-emitter',
    script: join(ORCH_DIR, 'severity-tags-emitter.mjs'),
    optional: false,
  },
  {
    name: 'tier-tags-emitter',
    script: join(ORCH_DIR, 'tier-tags-emitter.mjs'),
    optional: false,
  },
  {
    name: 'phase-tags-emitter',
    script: join(ORCH_DIR, 'phase-tags-emitter.mjs'),
    optional: false,
  },
  {
    name: 'coverage-sidecar-emitter',
    script: join(ORCH_DIR, 'coverage-sidecar-emitter.mjs'),
    optional: false,
  },
  {
    name: 'ci-state-emitter',
    script: join(ORCH_DIR, 'ci-state-emitter.mjs'),
    optional: false,
  },
  {
    name: 'provider-state-emitter',
    script: join(ORCH_DIR, 'provider-state-emitter.mjs'),
    optional: false,
  },
  {
    name: 'pulse-bridge-emitter',
    script: join(ORCH_DIR, 'pulse-bridge-emitter.mjs'),
    optional: true,
  },
  {
    name: 'blocker-rank',
    script: join(ORCH_DIR, 'blocker-rank.mjs'),
    optional: true,
  },
  {
    name: 'hubs-generator',
    script: join(ORCH_DIR, 'hubs-generator.mjs'),
    optional: true,
  },
  {
    name: 'graph-lens-factory',
    script: join(OBSIDIAN_DIR, 'obsidian-graph-lens.mjs'),
    args: ['--factory'],
    optional: false,
  },
  {
    name: 'extend-graph-lens',
    script: join(ORCH_DIR, 'extend-graph-lens.mjs'),
    optional: false,
  },
];

function isFindingsStale() {
  try {
    const agg = JSON.parse(readFileSync(join(REPO_ROOT, 'FINDINGS_AGGREGATE.json'), 'utf8'));
    const lastRun = new Date(agg.generatedAt || agg.lastRun || 0).getTime();
    return Date.now() - lastRun > 5 * 60 * 1000;
  } catch {
    return true;
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function runStep(step, dry) {
  const startedAt = Date.now();
  const script = step.script;
  const name = step.name;

  if (!existsSync(script)) {
    if (step.optional) {
      return {
        step: name,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        summary: 'skipped (script not found — optional)',
        softError: false,
      };
    }
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `FATAL: required script not found: ${script}`,
      softError: false,
    };
  }

  if (step.condition && !step.condition()) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      summary: 'skipped (condition false — findings fresh)',
      softError: false,
    };
  }

  const args = step.args ? [...step.args] : [];
  if (dry) args.push('--dry');

  let result;
  try {
    result = spawnSync('node', [script, ...args], {
      timeout: STEP_TIMEOUT_MS,
      encoding: 'utf8',
      env: { ...process.env },
      stdio: 'pipe',
    });
  } catch (err) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `FATAL: spawn error: ${err.message}`,
      softError: false,
    };
  }

  const exitCode = (result.status ?? result.error) ? 1 : 0;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  let summary = '';
  if (exitCode === 0) {
    summary = 'ok';
    if (stderr) {
      try {
        const parsed = JSON.parse(stderr.startsWith('{') ? stderr : '');
        summary = JSON.stringify(parsed);
      } catch {
        if (stderr.length < 120) summary = stderr;
        else summary = stderr.slice(0, 120) + '...';
      }
    }
  } else if (result.signal === 'SIGTERM' || stderr.includes('ETIMEDOUT')) {
    return {
      step: name,
      durationMs: Date.now() - startedAt,
      exitCode: 1,
      summary: `TIMEOUT after ${STEP_TIMEOUT_MS}ms`,
      softError: false,
    };
  } else {
    summary = stderr || stdout || `exit code ${exitCode}`;
    if (summary.length > 200) summary = summary.slice(0, 200) + '...';
  }

  return {
    step: name,
    durationMs: Date.now() - startedAt,
    exitCode,
    summary,
    softError: false,
  };
}

function runOnce(dry) {
  const totalStartedAt = Date.now();
  const results = [];
  let hardFail = false;

  for (const step of PIPELINE) {
    const result = runStep(step, dry);
    results.push(result);

    if (result.exitCode !== null && result.exitCode !== 0 && !step.optional) {
      hardFail = true;
      break;
    }
  }

  const totalDurationMs = Date.now() - totalStartedAt;
  const report = {
    ranAt: new Date().toISOString(),
    dry,
    totalDurationMs,
    totalDuration: formatDuration(totalDurationMs),
    stepsTotal: PIPELINE.length,
    stepsRun: results.length,
    stepsSucceeded: results.filter((r) => r.exitCode === 0).length,
    stepsSkipped: results.filter((r) => r.exitCode === null).length,
    stepsFailed: results.filter((r) => r.exitCode !== null && r.exitCode !== 0).length,
    hardFail,
    steps: results,
  };

  writeJsonAtomic(REFRESH_LOG_PATH, report);
  return report;
}

function readLastRefresh() {
  try {
    return JSON.parse(readFileSync(REFRESH_LOG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function printStatus(report) {
  if (!report || !report.steps) {
    process.stderr.write('HUD orchestrator: no refresh data found. Run --once first.\n');
    process.exit(1);
  }

  process.stdout.write(`## HUD Refresh Status\n\n`);
  process.stdout.write(`- **Last run**: ${report.ranAt}\n`);
  process.stdout.write(`- **Total duration**: ${report.totalDuration}\n`);
  process.stdout.write(`- **Dry run**: ${report.dry ? 'Yes' : 'No'}\n`);
  process.stdout.write(`- **Hard failure**: ${report.hardFail ? 'YES' : 'No'}\n`);
  process.stdout.write(
    `- **Steps**: ${report.stepsSucceeded} succeeded, ${report.stepsSkipped} skipped, ${report.stepsFailed} failed (${report.stepsRun}/${report.stepsTotal})\n\n`,
  );

  process.stdout.write(`| # | Step | Duration | Status | Summary |\n`);
  process.stdout.write(`|---|------|----------|--------|----------|\n`);
  for (const step of report.steps) {
    const s = step.exitCode === 0 ? 'OK' : step.exitCode === null ? 'SKIP' : 'FAIL';
    const summary = (step.summary || '').replace(/\|/g, '\\|').slice(0, 80);
    process.stdout.write(
      `| ${report.steps.indexOf(step) + 1} | ${step.step} | ${formatDuration(step.durationMs)} | ${s} | ${summary} |\n`,
    );
  }
  process.stdout.write('\n');
}

function writeJsonAtomic(path, obj) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  renameSync(tmp, path);
}

function hashSourceTree() {
  const hash = createHash('sha256');
  const files = [];
  const stack = [REPO_ROOT];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_SEGMENTS.has(e.name)) {
          stack.push(p);
        }
        continue;
      }
      if (e.isFile()) {
        const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
        if (WATCH_FILE_EXTENSIONS.has(ext)) {
          const rel = relative(REPO_ROOT, p);
          files.push(rel);
        }
      }
    }
  }

  files.sort();

  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    try {
      const s = statSync(abs);
      hash.update(`${rel}:${s.mtimeMs}:${s.size}\n`);
    } catch {
      hash.update(`${rel}:missing\n`);
    }
  }

  return hash.digest('hex');
}

function writePid() {
  writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

function handleExit() {
  removePid();
}

function runWatch(minutes) {
  if (existsSync(PID_FILE)) {
    const existing = readFileSync(PID_FILE, 'utf8').trim();
    try {
      process.kill(Number(existing), 0);
      process.stderr.write(`HUD orchestrator: already running (PID ${existing})\n`);
      process.exit(1);
    } catch {
      removePid();
    }
  }

  writePid();
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  const intervalMs = minutes * 60_000;
  let lastHash = '';

  process.stderr.write(`HUD orchestrator: watching every ${minutes}m (PID ${process.pid})\n`);

  function tick() {
    const currentHash = hashSourceTree();
    if (currentHash === lastHash && lastHash !== '') {
      process.stderr.write(`  [${new Date().toISOString()}] no changes detected\n`);
      return;
    }

    lastHash = currentHash;
    process.stderr.write(`  [${new Date().toISOString()}] changes detected, running --once...\n`);
    const report = runOnce(false);
    printStatus(report);

    if (report.hardFail) {
      process.stderr.write(`  HUD orchestrator: hard failure, continuing watch loop\n`);
    }
  }

  tick();
  setInterval(tick, intervalMs);
}

function printUsage() {
  process.stderr.write(`Usage: node hud-orchestrator.mjs [--once|--watch|--status|--dry]

  --once     Run the full HUD refresh pipeline once (default).
  --watch    Poll loop: re-run --once every N minutes on file changes.
             Use --interval <minutes> to override default (${DEFAULT_WATCH_MINUTES}m).
  --status   Print a markdown summary of the last HUD refresh.
  --dry      Dry-run mode: pass --dry to each emitter step.
             Can be combined with --once.

Examples:
  node scripts/orchestration/hud-orchestrator.mjs --once
  node scripts/orchestration/hud-orchestrator.mjs --once --dry
  node scripts/orchestration/hud-orchestrator.mjs --status
  node scripts/orchestration/hud-orchestrator.mjs --watch
  node scripts/orchestration/hud-orchestrator.mjs --watch --interval 10
`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  if (args.includes('--status')) {
    const report = readLastRefresh();
    printStatus(report);
    return;
  }

  if (args.includes('--watch')) {
    const intervalIdx = args.indexOf('--interval');
    let minutes = DEFAULT_WATCH_MINUTES;
    if (intervalIdx !== -1 && intervalIdx + 1 < args.length) {
      minutes = Number(args[intervalIdx + 1]) || DEFAULT_WATCH_MINUTES;
    }
    runWatch(minutes);
    return;
  }

  const dry = args.includes('--dry');
  const report = runOnce(dry);

  if (dry) {
    process.stderr.write(
      `DRY RUN COMPLETE — ${report.stepsSucceeded} steps would succeed, ${report.stepsSkipped} skipped\n`,
    );
  }

  printStatus(report);

  if (report.hardFail) {
    process.exit(1);
  }
}

main();
