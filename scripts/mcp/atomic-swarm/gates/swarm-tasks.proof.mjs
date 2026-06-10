#!/usr/bin/env node
// Gate: swarm_task_* — verifiable completion semantics (TodoWrite parity, honest receipts).
// Runs against an isolated fixture root (no real store/ledger touched).
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, `.proof-swarm-tasks-${process.pid}`);
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });
process.env.ATOMIC_SWARM_REPO_ROOT = fixtureRoot;

const { taskCreate, taskList, taskUpdate } = await import(
  `../swarm-tasks.mjs?proof=${Date.now()}`
);

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function readLedgerEntries() {
  const ledgerFile = path.join(fixtureRoot, '.atomic', 'swarm-tasks-ledger.jsonl');
  if (!fs.existsSync(ledgerFile)) return [];
  return fs
    .readFileSync(ledgerFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

try {
  // 1. subject is required; tasks get incremental ids and start pending.
  let missingSubjectRefused = false;
  try {
    taskCreate({});
  } catch (error) {
    missingSubjectRefused = error?.swarmRefusal === true;
  }
  const free = taskCreate({ subject: 'free task (no acceptance gate)' });
  const gated = taskCreate({
    subject: 'gated task',
    acceptanceCommand: 'node -e "process.exit(0)"',
  });
  record(
    'create requires subject; ids increment; status starts pending',
    missingSubjectRefused &&
      free.ok === true &&
      free.task.id === 1 &&
      free.task.status === 'pending' &&
      gated.ok === true &&
      gated.task.id === 2 &&
      gated.task.acceptanceCommand !== null,
    { freeTask: free.task, gatedTask: gated.task },
  );

  // 2. ungated task completes freely, but the receipt is honest: verified === false.
  const freeDone = await taskUpdate({ id: free.task.id, status: 'completed' });
  record(
    'ungated task completes freely with completion.verified === false',
    freeDone.ok === true &&
      freeDone.task.status === 'completed' &&
      freeDone.task.completion?.verified === false,
    { completion: freeDone.task.completion },
  );

  // 3. gated task without a governed runner is a fail-closed refusal; store untouched.
  let noRunnerRefused = false;
  try {
    await taskUpdate({ id: gated.task.id, status: 'completed' });
  } catch (error) {
    noRunnerRefused = error?.swarmRefusal === true;
  }
  const afterNoRunner = taskList().tasks.find((task) => task.id === gated.task.id);
  record(
    'gated completion without runAcceptance is refused and status stays pending',
    noRunnerRefused && afterNoRunner?.status === 'pending' && afterNoRunner?.completion === null,
    { storedTask: afterNoRunner },
  );

  // 4. red acceptance verdict refuses completion and the ledger records refusedCompletion.
  let redRefused = false;
  let redCompletion = null;
  try {
    await taskUpdate(
      { id: gated.task.id, status: 'completed' },
      { runAcceptance: async () => ({ ok: true, exitCode: 1, stdout: '', stderr: 'red' }) },
    );
  } catch (error) {
    redRefused = error?.swarmRefusal === true;
    redCompletion = error?.completion ?? null;
  }
  const refusalEntries = readLedgerEntries().filter((entry) => entry.refusedCompletion);
  const afterRed = taskList().tasks.find((task) => task.id === gated.task.id);
  record(
    'red acceptance verdict refused; ledger has refusedCompletion entry; status unchanged',
    redRefused &&
      redCompletion?.verified === false &&
      refusalEntries.length === 1 &&
      refusalEntries[0].refusedCompletion?.exitCode === 1 &&
      afterRed?.status === 'pending',
    { refusalEntries, errorCompletion: redCompletion },
  );

  // 5. green acceptance verdict completes with verified === true and hashed stdout.
  const greenDone = await taskUpdate(
    { id: gated.task.id, status: 'completed' },
    { runAcceptance: async () => ({ ok: true, exitCode: 0, stdout: 'green', stderr: '' }) },
  );
  record(
    'green acceptance verdict completes with verified === true and 64-hex stdoutSha256',
    greenDone.ok === true &&
      greenDone.task.status === 'completed' &&
      greenDone.task.completion?.verified === true &&
      /^[0-9a-f]{64}$/.test(greenDone.task.completion?.stdoutSha256 ?? ''),
    { completion: greenDone.task.completion },
  );

  // 6. persistence: a fresh module instance re-reads the store from disk.
  const fresh = await import(`../swarm-tasks.mjs?proofReload=${Date.now()}`);
  const persisted = fresh.taskList().tasks.find((task) => task.id === gated.task.id);
  record(
    'fresh import re-reads persisted store with the verified completion intact',
    persisted?.status === 'completed' && persisted?.completion?.verified === true,
    { persistedTask: persisted },
  );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
if (jsonMode) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed, results }, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
process.exit(failed.length > 0 ? 1 : 0);
