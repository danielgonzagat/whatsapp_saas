#!/usr/bin/env node
/**
 * ab-loss-formalizer.proof.mjs — executable proof for general Atomic loss formalization.
 * It turns measured Atomic losses into universal improvement briefs, never
 * task-specific patches.
 */
import { scoreRound, MODES } from './ab-round-harness.mjs';

const {
  formalizeAtomicLosses,
  runCli,
} = await import('./ab-loss-formalizer-harness.mjs');

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
  task: 'loss formalization scoring',
  baselineCommit: 'abc123',
  arms,
});

const speedLossRound = scoreRound(round('loss-speed', [factoryArm(), atomicArm()]));
const speedBrief = formalizeAtomicLosses({ scoredRound: speedLossRound });
check('speed-loss-produces-general-fast-path-brief', speedBrief.ok === true && speedBrief.action === 'IMPROVE_ATOMIC' && speedBrief.items[0]?.improvementClass === 'atomic-fast-path' && speedBrief.items[0]?.scope === 'universal', JSON.stringify(speedBrief));
check('speed-loss-brief-has-no-task-specific-target', speedBrief.items.every((item) => item.taskSpecific === false && item.prohibited.includes('task-specific patch')), JSON.stringify(speedBrief.items));

const escalatableRound = scoreRound(round('dominance', [
  factoryArm({ startedAtMs: 1000, finishedAtMs: 5000, diffStats: { files: 5, insertions: 120, deletions: 80 } }),
  atomicArm({ startedAtMs: 1000, finishedAtMs: 1100, diffStats: { files: 1, insertions: 3, deletions: 1 }, tooling: { atomicEditOperations: 3, forbiddenWrites: 0 } }),
]));
const noLossBrief = formalizeAtomicLosses({ scoredRound: escalatableRound });
check('no-loss-produces-no-improvement-items', noLossBrief.ok === true && noLossBrief.action === 'NO_ATOMIC_LOSS' && noLossBrief.items.length === 0, JSON.stringify(noLossBrief));

const noDeliveryRound = scoreRound(round('no-delivery', [
  factoryArm({
    status: 'TIMEOUT_NO_DELIVERY',
    finishedAtMs: 999999,
    changedFiles: [],
    diffStats: { files: 0, insertions: 0, deletions: 0 },
    validation: [],
  }),
  atomicArm(),
]));
const noDeliveryBrief = formalizeAtomicLosses({ scoredRound: noDeliveryRound });
check('incomplete-round-does-not-invent-atomic-improvement', noDeliveryBrief.ok === true && noDeliveryBrief.action === 'ROUND_EVIDENCE_INCOMPLETE' && noDeliveryBrief.items.length === 0, JSON.stringify(noDeliveryBrief));

const complianceLossRound = scoreRound(round('atomic-compliance-loss', [
  factoryArm(),
  atomicArm({ tooling: { atomicEditOperations: 2, forbiddenWrites: 1 } }),
]));
const complianceBrief = formalizeAtomicLosses({ scoredRound: complianceLossRound });
check('compliance-loss-routes-to-policy-hardening', complianceBrief.ok === true && complianceBrief.items.some((item) => item.improvementClass === 'atomic-policy-hardening'), JSON.stringify(complianceBrief));

const operationalCostLossRound = scoreRound(round('atomic-operational-cost-loss', [
  factoryArm({ metrics: { inputTokens: 100, outputTokens: 50, toolCalls: 1, commands: 1 } }),
  atomicArm({ metrics: { inputTokens: 2000, outputTokens: 1000, toolCalls: 10, commands: 8 } }),
]));
const operationalCostBrief = formalizeAtomicLosses({ scoredRound: operationalCostLossRound });
check('operational-cost-loss-routes-to-cost-routing', operationalCostBrief.ok === true && operationalCostBrief.items.some((item) => item.category === 'operationalCost' && item.improvementClass === 'atomic-operational-cost-routing' && item.taskSpecific === false), JSON.stringify(operationalCostBrief));

const cliDirect = runCli(['--formalize-losses'], JSON.stringify({ scoredRound: speedLossRound }));
check('runCli-formalize-losses-ok', cliDirect.ok === true && cliDirect.items[0]?.category === 'speed', JSON.stringify(cliDirect));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-loss-formalizer',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Formalizes measured Atomic losses into universal improvement briefs only. It does not implement improvements, run workers, or prove real superiority.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
