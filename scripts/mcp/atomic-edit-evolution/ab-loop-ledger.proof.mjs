#!/usr/bin/env node
/**
 * ab-loop-ledger.proof.mjs — executable proof for the persistent A/B loop ledger.
 * The ledger records loop decisions; it does not launch workers or prove real
 * coding superiority.
 */
import { evaluateLoopState } from './ab-loop-admission-harness.mjs';
import { MODES } from './ab-round-harness.mjs';

const {
  appendLoopEvaluationJsonl,
  latestLoopEvaluation,
  runCli,
  verifyLoopLedgerJsonl,
} = await import('./ab-loop-ledger-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const factoryArm = (overrides = {}) => ({
  armId: 'factory-1',
  mode: MODES.FACTORY,
  status: 'DONE',
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
  task: 'loop ledger scoring',
  baselineCommit: 'abc123',
  arms,
});

const blockedEval = evaluateLoopState({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: false, atomicMcpAllowed: true, reason: 'Atomic-only policy' },
  rounds: [],
  requiredDominanceRounds: 2,
});

const speedLossEval = evaluateLoopState({
  complexity: 'L1',
  policy: { factoryNoAtomicAllowed: true, atomicMcpAllowed: true },
  rounds: [round('loss-speed', [factoryArm(), atomicArm()])],
  requiredDominanceRounds: 2,
});

let ledger = appendLoopEvaluationJsonl({ ledgerText: '', evaluation: blockedEval });
check('append-first-policy-block', ledger.ok === true && ledger.record.action === 'BLOCKED_POLICY', JSON.stringify(ledger));
check('verify-first-record', verifyLoopLedgerJsonl(ledger.ledgerText).ok === true && verifyLoopLedgerJsonl(ledger.ledgerText).recordCount === 1, JSON.stringify(verifyLoopLedgerJsonl(ledger.ledgerText)));
check('latest-first-record', latestLoopEvaluation({ ledgerText: ledger.ledgerText }).record.action === 'BLOCKED_POLICY', JSON.stringify(latestLoopEvaluation({ ledgerText: ledger.ledgerText })));

ledger = appendLoopEvaluationJsonl({ ledgerText: ledger.ledgerText, evaluation: speedLossEval });
const verified = verifyLoopLedgerJsonl(ledger.ledgerText);
check('append-second-improve-atomic', ledger.ok === true && ledger.record.action === 'IMPROVE_ATOMIC', JSON.stringify(ledger));
check('verify-chain-two-records', verified.ok === true && verified.recordCount === 2 && verified.actions.join(',') === 'BLOCKED_POLICY,IMPROVE_ATOMIC', JSON.stringify(verified));
check('latest-second-record', latestLoopEvaluation({ ledgerText: ledger.ledgerText }).record.action === 'IMPROVE_ATOMIC', JSON.stringify(latestLoopEvaluation({ ledgerText: ledger.ledgerText })));

const tampered = ledger.ledgerText.replace('IMPROVE_ATOMIC', 'ESCALATE_COMPLEXITY');
check('tamper-rejected', verifyLoopLedgerJsonl(tampered).ok === false, JSON.stringify(verifyLoopLedgerJsonl(tampered)));
check('append-refuses-tampered-existing-ledger', appendLoopEvaluationJsonl({ ledgerText: tampered, evaluation: blockedEval }).ok === false, JSON.stringify(appendLoopEvaluationJsonl({ ledgerText: tampered, evaluation: blockedEval })));

const cliAppend = runCli(['--append-loop-evaluation-jsonl'], JSON.stringify({ ledgerText: '', evaluation: blockedEval }));
check('runCli-append-ok', cliAppend.ok === true && cliAppend.record.action === 'BLOCKED_POLICY', JSON.stringify(cliAppend));
const cliVerify = runCli(['--verify-loop-ledger-jsonl'], JSON.stringify({ ledgerText: ledger.ledgerText }));
check('runCli-verify-ok', cliVerify.ok === true && cliVerify.recordCount === 2, JSON.stringify(cliVerify));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-loop-ledger',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Hash-chained loop decision ledger only. It records supplied evaluations and detects tampering; it does not run workers or prove real coding superiority.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
