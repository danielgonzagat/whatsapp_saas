#!/usr/bin/env node
/**
 * ab-loop-coordinator.proof.mjs — executable proof for one pure A/B loop
 * iteration: evaluate policy/round history, formalize measured Atomic losses,
 * and append the hash-chained loop ledger without writing files by itself.
 */
import { MODES } from './ab-round-harness.mjs';
import { verifyLoopLedgerJsonl } from './ab-loop-ledger-harness.mjs';

const { runLoopIteration, runCli } = await import('./ab-loop-coordinator-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const factoryArm = (overrides = {}) => ({
  armId: 'factory-1',
  mode: MODES.FACTORY,
  status: 'DONE',
  workspaceRoot: '/tmp/atomic-ab/factory',
  startedAtMs: 1000,
  finishedAtMs: 1300,
  changedFiles: ['scripts/mcp/atomic-edit-evolution/a.mjs'],
  diffStats: { files: 1, insertions: 8, deletions: 2 },
  validation: [
    { command: 'node proof-a.mjs', ok: true },
    { command: 'node proof-b.mjs', ok: true },
  ],
  tooling: { atomicEditOperations: 0, forbiddenWrites: 0, shellWriteOperations: 1 },
  ...overrides,
});

const atomicArm = (overrides = {}) => ({
  armId: 'atomic-1',
  mode: MODES.ATOMIC,
  status: 'DONE',
  workspaceRoot: '/tmp/atomic-ab/atomic',
  startedAtMs: 1000,
  finishedAtMs: 1400,
  changedFiles: ['scripts/mcp/atomic-edit-evolution/a.mjs'],
  diffStats: { files: 1, insertions: 6, deletions: 1 },
  validation: [
    { command: 'node proof-a.mjs', ok: true },
    { command: 'node proof-b.mjs', ok: true },
  ],
  tooling: { atomicEditOperations: 4, forbiddenWrites: 0 },
  ...overrides,
});

const round = (roundId, arms) => ({
  roundId,
  task: 'loop coordinator scoring',
  baselineCommit: 'abc123',
  arms,
});

const workerManifest = (arm, workspaceRoot) => ({
  workspaceId: `${arm.mode}-workspace`,
  workspaceRoot,
  baselineCommit: 'abc123',
  ...arm,
});

const blocked = runLoopIteration({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: false, atomicMcpAllowed: true, reason: 'Atomic-only policy' },
  rounds: [],
  ledgerText: '',
  requiredDominanceRounds: 2,
});
check('policy-block-is-recorded', blocked.ok === true && blocked.action === 'BLOCKED_POLICY' && blocked.ledgerRecord?.action === 'BLOCKED_POLICY', JSON.stringify(blocked));
check('policy-block-does-not-start-round', blocked.canStartRound === false && blocked.evaluation?.canStartRound === false, JSON.stringify(blocked));
check('first-ledger-verifies', verifyLoopLedgerJsonl(blocked.ledgerText).ok === true && verifyLoopLedgerJsonl(blocked.ledgerText).recordCount === 1, JSON.stringify(verifyLoopLedgerJsonl(blocked.ledgerText)));

const speedLoss = runLoopIteration({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: true, atomicMcpAllowed: true },
  rounds: [round('loss-speed', [factoryArm(), atomicArm()])],
  ledgerText: blocked.ledgerText,
  requiredDominanceRounds: 2,
});
const verifiedSpeed = verifyLoopLedgerJsonl(speedLoss.ledgerText ?? '');
check('atomic-loss-is-formalized-and-recorded', speedLoss.ok === true && speedLoss.action === 'IMPROVE_ATOMIC' && speedLoss.lossBrief?.action === 'IMPROVE_ATOMIC', JSON.stringify(speedLoss));
check('atomic-loss-brief-remains-universal', speedLoss.lossBrief?.items?.[0]?.scope === 'universal' && speedLoss.lossBrief?.items?.[0]?.taskSpecific === false, JSON.stringify(speedLoss.lossBrief));
check('second-ledger-verifies', verifiedSpeed.ok === true && verifiedSpeed.recordCount === 2 && verifiedSpeed.actions.join(',') === 'BLOCKED_POLICY,IMPROVE_ATOMIC', JSON.stringify(verifiedSpeed));

const manifestSpeedLoss = runLoopIteration({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: true, atomicMcpAllowed: true },
  roundId: 'manifest-loss-speed',
  task: 'loop coordinator manifest ingest',
  baselineCommit: 'abc123',
  manifests: [
    workerManifest(factoryArm(), '/tmp/atomic-ab/factory'),
    workerManifest(atomicArm(), '/tmp/atomic-ab/atomic'),
  ],
  ledgerText: '',
  requiredDominanceRounds: 2,
});
check('manifest-input-is-ingested-before-admission', manifestSpeedLoss.ok === true && manifestSpeedLoss.action === 'IMPROVE_ATOMIC' && manifestSpeedLoss.ingestedRound?.scoredRound?.roundId === 'manifest-loss-speed' && manifestSpeedLoss.lossBrief?.action === 'IMPROVE_ATOMIC', JSON.stringify(manifestSpeedLoss));

const runRound = runLoopIteration({
  complexity: 'L2',
  policy: { factoryNoAtomicAllowed: true, atomicMcpAllowed: true },
  rounds: [],
  ledgerText: '',
  requiredDominanceRounds: 2,
});
check('allowed-empty-history-runs-round-without-loss-brief', runRound.ok === true && runRound.action === 'RUN_ROUND' && runRound.lossBrief === null, JSON.stringify(runRound));

const tampered = speedLoss.ledgerText.replace('IMPROVE_ATOMIC', 'ESCALATE_COMPLEXITY');
const rejected = runLoopIteration({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: false, atomicMcpAllowed: true },
  rounds: [],
  ledgerText: tampered,
  requiredDominanceRounds: 2,
});
check('tampered-ledger-refuses-new-iteration', rejected.ok === false && String(rejected.error).includes('existing ledger rejected'), JSON.stringify(rejected));

const cli = runCli(['--run-loop-iteration'], JSON.stringify({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: false, atomicMcpAllowed: true, reason: 'Atomic-only policy' },
  rounds: [],
  ledgerText: '',
  requiredDominanceRounds: 2,
}));
check('runCli-loop-iteration-ok', cli.ok === true && cli.action === 'BLOCKED_POLICY' && cli.ledgerRecord?.action === 'BLOCKED_POLICY', JSON.stringify(cli));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-loop-coordinator',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Coordinates one supplied loop state into a decision, optional universal loss brief, and hash-chained ledger text. It does not launch workers or prove real coding superiority.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
