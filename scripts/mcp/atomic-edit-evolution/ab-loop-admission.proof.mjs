#!/usr/bin/env node
/**
 * ab-loop-admission.proof.mjs — executable proof for A/B loop admission and escalation.
 * Synthetic rounds prove loop control behavior only; they are not evidence that
 * either arm is better in real coding work.
 */
const {
  evaluateLoopState,
  runCli,
} = await import('./ab-loop-admission-harness.mjs');
const { MODES } = await import('./ab-round-harness.mjs');

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
  task: 'loop admission scoring',
  baselineCommit: 'abc123',
  arms,
});

const escalatableRound = (roundId) => round(roundId, [
  factoryArm({ startedAtMs: 1000, finishedAtMs: 5000, diffStats: { files: 5, insertions: 120, deletions: 80 } }),
  atomicArm({ startedAtMs: 1000, finishedAtMs: 1100, diffStats: { files: 1, insertions: 3, deletions: 1 }, tooling: { atomicEditOperations: 3, forbiddenWrites: 0 } }),
]);

const atomicSpeedLossRound = round('loss-speed', [factoryArm(), atomicArm()]);
const noDeliveryRound = round('no-delivery', [
  factoryArm({
    status: 'TIMEOUT_NO_DELIVERY',
    finishedAtMs: 999999,
    changedFiles: [],
    diffStats: { files: 0, insertions: 0, deletions: 0 },
    validation: [],
  }),
  atomicArm(),
]);

const allowedPolicy = { factoryNoAtomicAllowed: true, atomicMcpAllowed: true };
const atomicOnlyPolicy = { factoryNoAtomicAllowed: false, atomicMcpAllowed: true, reason: 'user forbids non-atomic/TUI work' };

const blocked = evaluateLoopState({ complexity: 'L1', policy: atomicOnlyPolicy, rounds: [] });
check(
  'policy-blocks-factory-without-faking-round',
  blocked.ok === true
    && blocked.action === 'BLOCKED_POLICY'
    && blocked.canStartRound === false
    && blocked.blockers.some((blocker) => blocker.includes('FACTORY_BLOCK_ATOMIC')),
  JSON.stringify(blocked),
);

const start = evaluateLoopState({ complexity: 'L1', policy: allowedPolicy, rounds: [] });
check('allowed-policy-starts-first-round', start.ok === true && start.action === 'RUN_ROUND' && start.canStartRound === true, JSON.stringify(start));

const repeat = evaluateLoopState({ complexity: 'L1', policy: allowedPolicy, rounds: [escalatableRound('dominance-1')], requiredDominanceRounds: 2 });
check(
  'single-dominance-round-repeats-before-escalation',
  repeat.ok === true
    && repeat.action === 'REPEAT_SAME_COMPLEXITY'
    && repeat.dominanceStreak === 1
    && repeat.requiredDominanceRounds === 2,
  JSON.stringify(repeat),
);

const escalate = evaluateLoopState({ complexity: 'L1', policy: allowedPolicy, rounds: [escalatableRound('dominance-1'), escalatableRound('dominance-2')], requiredDominanceRounds: 2 });
check(
  'repeat-dominance-escalates-complexity',
  escalate.ok === true
    && escalate.action === 'ESCALATE_COMPLEXITY'
    && escalate.dominanceStreak === 2
    && escalate.latestDecision?.escalateComplexity === true,
  JSON.stringify(escalate),
);

const incomplete = evaluateLoopState({ complexity: 'L1', policy: allowedPolicy, rounds: [noDeliveryRound], requiredDominanceRounds: 2 });
check(
  'no-delivery-repeats-same-complexity-not-escalate',
  incomplete.ok === true
    && incomplete.action === 'REPEAT_SAME_COMPLEXITY'
    && incomplete.latestDecision?.headToHeadComplete === false
    && incomplete.latestDecision?.escalateComplexity === false,
  JSON.stringify(incomplete),
);

const atomicLoss = evaluateLoopState({ complexity: 'L1', policy: allowedPolicy, rounds: [atomicSpeedLossRound], requiredDominanceRounds: 2 });
check(
  'atomic-loss-routes-to-improvement-loop',
  atomicLoss.ok === true
    && atomicLoss.action === 'IMPROVE_ATOMIC'
    && atomicLoss.atomicLosses.some((loss) => loss.category === 'speed'),
  JSON.stringify(atomicLoss),
);

const cliDirect = runCli(['--evaluate'], JSON.stringify({ complexity: 'L1', policy: allowedPolicy, rounds: [escalatableRound('dominance-1'), escalatableRound('dominance-2')], requiredDominanceRounds: 2 }));
check('runCli-evaluate-ok', cliDirect.ok === true && cliDirect.action === 'ESCALATE_COMPLEXITY', JSON.stringify(cliDirect));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-loop-admission',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Evaluates whether the loop may start, repeat, improve Atomic, or escalate from supplied policy and scored round records. It does not launch workers or prove real coding superiority.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
