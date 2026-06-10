#!/usr/bin/env node
// Gate: swarm_exec_batch — fail-closed without a broker; governed fan-out with one.
// The fail-closed half always runs (isolated fixture root, dead socket path).
// The live half runs only when a real broker endpoint is reachable; its absence
// is reported honestly as skipped, never as a fake pass.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, `.proof-swarm-batch-${process.pid}`);
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });

const realBrokerSocket = process.env.ATOMIC_EXEC_BROKER_SOCKET;
const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

// ---- fail-closed half: isolated root, no broker anywhere ----
process.env.ATOMIC_SWARM_REPO_ROOT = fixtureRoot;
process.env.ATOMIC_EXEC_BROKER_SOCKET = path.join(fixtureRoot, 'no-such-broker.sock');
const isolated = await import(`../swarm-batch.mjs?proof=isolated-${Date.now()}`);

record(
  'brokerEndpoint resolves to null when no broker exists',
  isolated.brokerEndpoint() === null,
  {},
);

let refused = false;
let refusalMessage = '';
try {
  await isolated.swarmExecBatch({ jobs: [{ command: 'ls' }] });
} catch (error) {
  refused = error?.swarmRefusal === true;
  refusalMessage = String(error?.message ?? error);
}
record(
  'batch without broker is a fail-closed refusal (never unsandboxed spawn)',
  refused && refusalMessage.includes('fail-closed'),
  { refusalMessage },
);

let badJobsRefused = false;
try {
  await isolated.swarmExecBatch({ jobs: [] });
} catch (error) {
  badJobsRefused = error?.swarmRefusal === true;
}
record('empty jobs[] is refused before any broker contact', badJobsRefused, {});

// ---- live half: only when the session has a real broker ----
if (realBrokerSocket && fs.existsSync(realBrokerSocket)) {
  process.env.ATOMIC_EXEC_BROKER_SOCKET = realBrokerSocket;
  const repoRoot = path.resolve(here, '..', '..', '..', '..');
  process.env.ATOMIC_SWARM_REPO_ROOT = repoRoot;
  const live = await import(`../swarm-batch.mjs?proof=live-${Date.now()}`);
  try {
    const batch = await live.swarmExecBatch({
      jobs: [
        { label: 'ls-scripts', command: 'ls scripts' },
        { label: 'ls-root', command: 'ls .' },
        { label: 'git-status', command: 'git status --porcelain=v1 --no-renames' },
      ],
      maxParallel: 3,
      timeoutMs: 30000,
    });
    record(
      'live parallel batch returns real exit codes + sha256 receipts per job',
      batch.results.length === 3 &&
        batch.results.every(
          (job) => typeof job.exitCode === 'number' && /^[0-9a-f]{64}$/.test(job.stdoutSha256),
        ),
      {
        aggregate: { jobs: batch.aggregate.jobs, passed: batch.aggregate.passed, failed: batch.aggregate.failed, wallMs: batch.aggregate.wallMs },
      },
    );
    const ledgerFile = path.join(repoRoot, '.atomic', 'swarm-batch-ledger.jsonl');
    const lastLine = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').at(-1);
    const lastEntry = JSON.parse(lastLine);
    record(
      'aggregate receipt landed in the batch ledger',
      lastEntry.tool === 'swarm_exec_batch' && lastEntry.jobs === 3 && Array.isArray(lastEntry.receipts),
      { ledgerEntry: { jobs: lastEntry.jobs, passed: lastEntry.passed, failed: lastEntry.failed } },
    );
  } catch (error) {
    record('live parallel batch through the real broker', false, {
      error: String(error?.message ?? error),
    });
  }
} else {
  record('live broker half SKIPPED (no reachable broker in this run)', true, { skipped: true });
}

fs.rmSync(fixtureRoot, { recursive: true, force: true });

const failed = results.filter((result) => !result.ok);
if (jsonMode) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed, results }, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
process.exit(failed.length > 0 ? 1 : 0);
