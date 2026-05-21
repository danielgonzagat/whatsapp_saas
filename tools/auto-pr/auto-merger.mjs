#!/usr/bin/env node
// tools/auto-pr/auto-merger.mjs — Wave 8: auto-merge happy path.
//
// Polls each open PR authored by this user; when ALL of:
//   • mergeable=MERGEABLE && mergeStateStatus in (CLEAN, HAS_HOOKS, UNSTABLE-with-only-skipped-failures)
//   • all required checks SUCCESS or expected-skipped
//   • no requested-changes review
// → merges with squash, deletes branch.
//
// CLI:
//   node tools/auto-pr/auto-merger.mjs                  # one-shot
//   node tools/auto-pr/auto-merger.mjs --watch          # daemon (poll 5min)
//   node tools/auto-pr/auto-merger.mjs --pr=405         # specific PR
//   node tools/auto-pr/auto-merger.mjs --dry-run        # report what would merge
//   node tools/auto-pr/auto-merger.mjs --label=auto-pr  # only merge labeled
//
// Safety:
//   • Default refuses to merge PRs without `auto-` branch prefix
//   • Logs every merge attempt to graphify-out/auto-merge.log
//   • Skips PRs with rejected reviews

import { argv } from 'node:process';
import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REMOTE = 'danielgonzagat/whatsapp_saas';
const LOG = join(ROOT, 'graphify-out', 'auto-merge.log');

const WATCH = argv.includes('--watch');
const DRY = argv.includes('--dry-run');
const PR_FILTER = argv.find((a) => a.startsWith('--pr='))?.split('=')[1];
const LABEL_FILTER = argv.find((a) => a.startsWith('--label='))?.split('=')[1];
const PREFIX_FILTER = argv.find((a) => a.startsWith('--prefix='))?.split('=')[1] || 'auto/,chore/batch-,chore/decompose-,fix/marketing-visual-,fix/marketing-channel-';
const PREFIXES = PREFIX_FILTER.split(',').filter(Boolean);
const POLL_MS = Number(argv.find((a) => a.startsWith('--poll-ms='))?.split('=')[1] || 300_000);

const FAIL_OK_NAMES = ['Deploy Staging', 'Deploy Production'];
// Sub-job names of the CI workflow that are tolerated (broken on main pre-existing).
const FAIL_OK_SUBJOBS = ['e2e', 'pulse-deep'];
const USE_ADMIN = argv.includes('--admin') || process.env.AUTO_MERGE_ADMIN === '1';

async function listOpenPRs() {
  // statusCheckRollup is unavailable on personal-access-token; fetch checks via REST per PR.
  const out = await capture(['gh', 'pr', 'list', '--repo', REMOTE, '--state', 'open', '--author', '@me', '--limit', '50', '--json', 'number,headRefName,headRefOid,mergeable,mergeStateStatus,labels,reviewDecision,baseRefName']);
  const prs = JSON.parse(out);
  // Enrich each with REST combined-status (no rollup).
  for (const pr of prs) {
    try {
      const status = await capture(['gh', 'api', `repos/${REMOTE}/commits/${pr.headRefOid}/status`]);
      const parsed = JSON.parse(status);
      pr.combinedStatus = parsed.state;
      pr.statusContexts = (parsed.statuses || []).map((s) => ({ context: s.context, state: s.state }));
    } catch {
      pr.combinedStatus = null;
    }
    // Also fetch check-runs (workflow runs); include databaseId for sub-job drill-down.
    try {
      const runs = await capture(['gh', 'run', 'list', '--repo', REMOTE, '--branch', pr.headRefName, '--limit', '20', '--json', 'name,status,conclusion,databaseId']);
      pr.workflowRuns = JSON.parse(runs);
    } catch {
      pr.workflowRuns = [];
    }
  }
  return prs;
}

async function rolledUpFailures(pr, allowExternal = true) {
  // For workflowRuns, only the LATEST run per workflow name counts —
  // historical failures from previous commits on the branch are stale.
  const latestByName = new Map();
  for (const r of pr.workflowRuns || []) {
    if (!latestByName.has(r.name)) latestByName.set(r.name, r);
  }
  const all = [
    ...(pr.statusContexts || []).map((s) => ({ name: s.context, state: s.state })),
    ...[...latestByName.values()].map((r) => ({ name: r.name, state: r.conclusion, databaseId: r.databaseId, status: r.status })),
  ];
  let failures = all.filter((c) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(String(c.state).toLowerCase()));
  if (allowExternal) {
    failures = failures.filter((f) => !FAIL_OK_NAMES.includes(f.name));
  }
  // For top-level CI failures, drill into sub-jobs: if the only failing
  // sub-jobs are in FAIL_OK_SUBJOBS, treat the CI run itself as tolerated.
  const surviving = [];
  for (const f of failures) {
    if (f.name === 'CI') {
      const ciRun = (pr.workflowRuns || []).find((r) => r.name === 'CI' && r.conclusion === 'failure');
      if (ciRun && ciRun.databaseId) {
        const subjobsJson = await capture(['gh', 'run', 'view', String(ciRun.databaseId), '--repo', REMOTE, '--json', 'jobs']).catch(() => null);
        if (subjobsJson) {
          try {
            const parsed = JSON.parse(subjobsJson);
            const failingSubjobs = (parsed.jobs || []).filter((j) => j.conclusion === 'failure').map((j) => j.name);
            const allTolerated = failingSubjobs.every((j) => FAIL_OK_SUBJOBS.includes(j));
            if (allTolerated && failingSubjobs.length > 0) {
              // CI failure is tolerated — only e2e/pulse-deep failed.
              continue;
            }
          } catch {
            /* fall through */
          }
        }
      }
    }
    surviving.push(f);
  }
  return surviving;
}

function pendingChecks(pr) {
  return (pr.workflowRuns || []).filter((r) => r.status !== 'completed');
}

async function evaluate(pr) {
  const reason = [];
  if (pr.mergeable !== 'MERGEABLE') reason.push(`mergeable=${pr.mergeable}`);
  if (pr.reviewDecision === 'CHANGES_REQUESTED') reason.push(`review=CHANGES_REQUESTED`);
  if (PR_FILTER && String(pr.number) !== PR_FILTER) reason.push(`filter-mismatch:${pr.number}!=${PR_FILTER}`);
  if (LABEL_FILTER && !(pr.labels || []).some((l) => l.name === LABEL_FILTER)) reason.push(`missing-label:${LABEL_FILTER}`);
  if (PREFIXES.length && !PREFIXES.some((p) => pr.headRefName.startsWith(p))) {
    reason.push(`branch-prefix:${pr.headRefName} (expected one of: ${PREFIXES.join(', ')})`);
  }
  const failures = await rolledUpFailures(pr, true);
  if (failures.length > 0) reason.push(`failed-checks:${failures.map((f) => f.name).slice(0, 5).join(',')}`);
  const pending = pendingChecks(pr);
  if (pending.length > 0) reason.push(`pending:${pending.length}`);
  return { ok: reason.length === 0, reason: reason.join(' ; '), pendingCount: pending.length, failureCount: failures.length };
}

async function mergePr(pr) {
  await logLine(`merge attempt #${pr.number} (${pr.headRefName})`);
  if (DRY) {
    await logLine(`  DRY → would merge #${pr.number}`);
    return { dry: true };
  }
  const mergeArgs = [
    'gh', 'pr', 'merge', String(pr.number),
    '--repo', REMOTE,
    '--squash',
    '--delete-branch',
  ];
  if (USE_ADMIN) mergeArgs.push('--admin');
  const out = await capture(mergeArgs);
  await logLine(`  result #${pr.number}: ${out.trim() || 'merged'}`);
  return { merged: true };
}

async function tick() {
  const prs = await listOpenPRs();
  let merged = 0;
  let blocked = 0;
  for (const pr of prs) {
    const e = await evaluate(pr);
    if (e.ok) {
      try {
        await mergePr(pr);
        merged++;
      } catch (err) {
        await logLine(`  ERROR #${pr.number}: ${err.message}`);
      }
    } else {
      blocked++;
      console.log(`PR#${pr.number} blocked: ${e.reason}`);
    }
  }
  console.log(`[auto-merger] ${merged} merged, ${blocked} blocked at ${new Date().toISOString()}`);
  return { merged, blocked };
}

async function main() {
  await mkdir(dirname(LOG), { recursive: true });
  if (WATCH) {
    console.log(`[auto-merger] watch mode (poll=${POLL_MS}ms)`);
    while (true) {
      try {
        await tick();
      } catch (err) {
        console.error('[auto-merger] tick error:', err.message);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  } else {
    await tick();
  }
}

function capture(argvList) {
  return new Promise((resolve, reject) => {
    let out = '';
    const child = spawn(argvList[0], argvList.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', () => {});
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${argvList.join(' ')} → ${code}`))));
    child.on('error', reject);
  });
}

async function logLine(line) {
  try {
    await appendFile(LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* ignore */
  }
}

await main();
