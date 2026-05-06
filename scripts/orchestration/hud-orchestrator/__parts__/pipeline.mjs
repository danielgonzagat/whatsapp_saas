import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  REPO_ROOT,
  REFRESH_LOG_PATH,
  STEP_TIMEOUT_MS,
  OPS_DIR,
  ORCH_DIR,
  OBSIDIAN_DIR,
} from './constants.mjs';

export function isFindingsStale() {
  try {
    const agg = JSON.parse(readFileSync(join(REPO_ROOT, 'FINDINGS_AGGREGATE.json'), 'utf8'));
    const lastRun = new Date(agg.generatedAt || agg.lastRun || 0).getTime();
    return Date.now() - lastRun > 5 * 60 * 1000;
  } catch {
    return true;
  }
}

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

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function runStep(step, dry) {
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

export function runOnce(dry) {
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

export function readLastRefresh() {
  try {
    return JSON.parse(readFileSync(REFRESH_LOG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function printStatus(report) {
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
    const summary = (step.summary || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').slice(0, 80);
    process.stdout.write(
      `| ${report.steps.indexOf(step) + 1} | ${step.step} | ${formatDuration(step.durationMs)} | ${s} | ${summary} |\n`,
    );
  }
  process.stdout.write('\n');
}

export function writeJsonAtomic(path, obj) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  renameSync(tmp, path);
}
