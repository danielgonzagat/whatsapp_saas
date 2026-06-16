#!/usr/bin/env node
/**
 * ab-round.proof.mjs — executable proof for deterministic Codex A/B round scoring.
 * Synthetic input proves harness behavior only; it is not evidence that either
 * arm is better in real coding work.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  scoreRound,
  runCli,
  MODES,
} from './ab-round-harness.mjs';

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

const round = (arms) => ({
  roundId: 'round-1',
  task: 'score deterministic A/B arms',
  baselineCommit: 'abc123',
  arms,
});

const happy = scoreRound(round([factoryArm(), atomicArm()]));
check('happy.ok', happy.ok === true, happy.error);
check('happy.atomic-overall-win', happy.winners.overall.winnerMode === MODES.ATOMIC, JSON.stringify(happy.winners.overall));
check(
  'happy.factory-speed-creates-atomic-loss',
  happy.atomicLosses.some((loss) => loss.category === 'speed' && loss.winnerMode === MODES.FACTORY),
  JSON.stringify(happy.atomicLosses),
);
check('happy.no-factory-loss-for-speed', !happy.factoryLosses.some((loss) => loss.category === 'speed'), JSON.stringify(happy.factoryLosses));
check(
  'happy-decision-does-not-escalate-on-atomic-loss',
  happy.decision.atomicDominance === false
    && happy.decision.escalateComplexity === false
    && happy.decision.atomicCompetitiveLosses.includes('speed'),
  JSON.stringify(happy.decision),
);

const costRound = scoreRound(round([
  factoryArm({ metrics: { inputTokens: 1000, outputTokens: 500, toolCalls: 4, commands: 3 } }),
  atomicArm({ metrics: { inputTokens: 300, outputTokens: 100, toolCalls: 1, commands: 1 } }),
]));
check('operational-cost-category-present', costRound.ok === true && costRound.winners.operationalCost?.winnerMode === MODES.ATOMIC, JSON.stringify(costRound.winners.operationalCost));
check('operational-cost-measured-in-category', costRound.armsByMode?.[MODES.FACTORY]?.operationalCost > costRound.armsByMode?.[MODES.ATOMIC]?.operationalCost, JSON.stringify(costRound.armsByMode));
check('factory-loss-records-operational-cost', costRound.factoryLosses.some((loss) => loss.category === 'operationalCost' && loss.winnerMode === MODES.ATOMIC), JSON.stringify(costRound.factoryLosses));

const atomicCostLossRound = scoreRound(round([
  factoryArm({ metrics: { inputTokens: 100, outputTokens: 50, toolCalls: 1, commands: 1 } }),
  atomicArm({ metrics: { inputTokens: 2000, outputTokens: 1000, toolCalls: 10, commands: 8 } }),
]));
check('atomic-loss-records-operational-cost', atomicCostLossRound.atomicLosses.some((loss) => loss.category === 'operationalCost' && loss.winnerMode === MODES.FACTORY), JSON.stringify(atomicCostLossRound.atomicLosses));

const factoryBad = scoreRound(round([factoryArm({ tooling: { atomicEditOperations: 1, forbiddenWrites: 0 } }), atomicArm()]));
check('factory-using-atomic-noncompliant', factoryBad.ok === true && factoryBad.armsByMode[MODES.FACTORY].compliance.ok === false, JSON.stringify(factoryBad.armsByMode[MODES.FACTORY].compliance));

const atomicBad = scoreRound(round([factoryArm(), atomicArm({ tooling: { atomicEditOperations: 2, forbiddenWrites: 1 } })]));
check('atomic-using-forbidden-writes-noncompliant', atomicBad.ok === true && atomicBad.armsByMode[MODES.ATOMIC].compliance.ok === false, JSON.stringify(atomicBad.armsByMode[MODES.ATOMIC].compliance));

const noDelivery = scoreRound(round([
  factoryArm({
    status: 'TIMEOUT_NO_DELIVERY',
    finishedAtMs: 999999,
    changedFiles: [],
    diffStats: { files: 0, insertions: 0, deletions: 0 },
    validation: [],
  }),
  atomicArm(),
]));
check('no-delivery-zero-diff-not-overall-winner', noDelivery.winners.overall.winnerMode === MODES.ATOMIC, JSON.stringify(noDelivery.winners.overall));
check('no-delivery-zero-diff-not-diff-winner', noDelivery.winners.diffSize.winnerMode === MODES.ATOMIC, JSON.stringify(noDelivery.winners.diffSize));
check('no-delivery-overall-score-zero', noDelivery.armsByMode[MODES.FACTORY].scores.overall === 0, JSON.stringify(noDelivery.armsByMode[MODES.FACTORY].scores));
check(
  'no-delivery-decision-no-escalation',
  noDelivery.decision.headToHeadComplete === false
    && noDelivery.decision.atomicDominance === false
    && noDelivery.decision.escalateComplexity === false
    && noDelivery.decision.reasons.some((reason) => reason.includes('head-to-head incomplete')),
  JSON.stringify(noDelivery.decision),
);

const missingArm = scoreRound(round([factoryArm()]));
check('missing-required-arm-rejected', missingArm.ok === false && missingArm.error.includes('exactly two arms'), missingArm.error);

const tie = scoreRound(round([
  factoryArm({ startedAtMs: 10, finishedAtMs: 20, diffStats: { files: 1, insertions: 1, deletions: 1 } }),
  atomicArm({ startedAtMs: 10, finishedAtMs: 20, diffStats: { files: 1, insertions: 1, deletions: 1 }, tooling: { atomicEditOperations: 1, forbiddenWrites: 0 } }),
]));
check('tie.ok', tie.ok === true, tie.error);
check('tie-speed-represented-deterministically', tie.winners.speed.winnerMode === 'TIE' && tie.winners.speed.tiedModes.join(',') === `${MODES.FACTORY},${MODES.ATOMIC}`, JSON.stringify(tie.winners.speed));
check('tie-diff-represented-deterministically', tie.winners.diffSize.winnerMode === 'TIE' && tie.winners.diffSize.reason.includes('tie'), JSON.stringify(tie.winners.diffSize));

const escalatable = scoreRound(round([
  factoryArm({ startedAtMs: 1000, finishedAtMs: 5000, diffStats: { files: 5, insertions: 120, deletions: 80 } }),
  atomicArm({ startedAtMs: 1000, finishedAtMs: 1100, diffStats: { files: 1, insertions: 3, deletions: 1 }, tooling: { atomicEditOperations: 3, forbiddenWrites: 0 } }),
]));
check('escalatable-decision-dominance', escalatable.decision.atomicDominance === true, JSON.stringify(escalatable.decision));
check('escalatable-decision-can-escalate', escalatable.decision.escalateComplexity === true, JSON.stringify(escalatable.decision));

const missingIsolation = scoreRound(round([
  factoryArm({ workspaceRoot: null }),
  atomicArm({ workspaceRoot: null }),
]));
check(
  'missing-workspace-roots-block-dominance',
  missingIsolation.decision.workspaceIsolation.ok === false
    && missingIsolation.decision.workspaceIsolation.measured === false
    && missingIsolation.decision.atomicDominance === false
    && missingIsolation.decision.escalateComplexity === false,
  JSON.stringify(missingIsolation.decision),
);

const overlappingIsolation = scoreRound(round([
  factoryArm({ workspaceRoot: '/tmp/atomic-ab/shared' }),
  atomicArm({ workspaceRoot: '/tmp/atomic-ab/shared/atomic' }),
]));
check(
  'overlapping-workspace-roots-block-dominance',
  overlappingIsolation.decision.workspaceIsolation.ok === false
    && overlappingIsolation.decision.workspaceIsolation.measured === true
    && overlappingIsolation.decision.atomicDominance === false
    && overlappingIsolation.decision.escalateComplexity === false,
  JSON.stringify(overlappingIsolation.decision),
);
check(
  'overlapping-workspace-roots-reasoned',
  overlappingIsolation.decision.reasons.some((reason) => reason.includes('workspace roots overlap')),
  JSON.stringify(overlappingIsolation.decision),
);

const cliDirect = runCli(['--score'], JSON.stringify(round([factoryArm(), atomicArm()])));
check('runCli-score-ok', cliDirect.ok === true && cliDirect.winners.overall.winnerMode === MODES.ATOMIC, JSON.stringify(cliDirect.error ?? cliDirect.winners.overall));

const harnessPath = fileURLToPath(new URL('./ab-round-harness.mjs', import.meta.url));
const cliSpawn = spawnSync(process.execPath, [harnessPath, '--score'], {
  input: JSON.stringify(round([factoryArm(), atomicArm()])),
  encoding: 'utf8',
});
let cliParsed = null;
try {
  cliParsed = JSON.parse(cliSpawn.stdout);
} catch {
  cliParsed = null;
}
check('cli-score-stdin-exit-zero', cliSpawn.status === 0, cliSpawn.stderr || cliSpawn.stdout);
check('cli-score-stdin-json-ok', cliParsed?.ok === true && cliParsed?.winners?.overall?.winnerMode === MODES.ATOMIC, cliSpawn.stdout);

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-round-scoring-harness',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Scores one supplied A/B round deterministically. It does not execute tasks, verify git diffs, or prove external runtime behavior.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
