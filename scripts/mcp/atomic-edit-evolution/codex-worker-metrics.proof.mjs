#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { observeCodexWorkerRound } from './codex-worker-metrics-harness.mjs';
import { MODES } from './ab-round-harness.mjs';

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-worker-metrics-proof-'));
const baseline = path.join(root, 'baseline');
const block = path.join(root, 'block');
const allin = path.join(root, 'allin');
const artifacts = path.join(root, 'artifacts');

write(path.join(baseline, 'src/value.ts'), 'export const value = 1;\n');
copyDir(baseline, block);
copyDir(baseline, allin);
write(path.join(allin, 'src/value.ts'), 'export const value = 2;\n');
write(path.join(artifacts, 'block.test.exit'), '1\n');
write(path.join(artifacts, 'block.typecheck.exit'), '2\n');
write(path.join(artifacts, 'allin.test.exit'), '0\n');
write(path.join(artifacts, 'allin.typecheck.exit'), '0\n');
write(path.join(artifacts, 'allin.test.txt'), 'ok\n');

const result = observeCodexWorkerRound({
  roundId: 'proof-codex-round',
  task: 'prove Codex worker external metrics observation',
  baselineRoot: baseline,
  baselineCommit: 'proof-baseline',
  roundStartedAtMs: 1000,
  roundFinishedAtMs: 5000,
  arms: [
    {
      armId: 'block-proof',
      mode: MODES.FACTORY,
      workspaceRoot: block,
      status: 'TIMEOUT',
      validation: [
        { command: 'npm test', exitFile: path.join(artifacts, 'block.test.exit') },
        { command: 'npm run typecheck', exitFile: path.join(artifacts, 'block.typecheck.exit') },
      ],
      tooling: { atomicEditOperations: 0, forbiddenWrites: 0, shellWriteOperations: 0 },
    },
    {
      armId: 'allin-proof',
      mode: MODES.ATOMIC,
      workspaceRoot: allin,
      status: 'DONE',
      traceRefs: ['.atomic/traces/proof.json'],
      validation: [
        { command: 'npm test', exitFile: path.join(artifacts, 'allin.test.exit'), outputFile: path.join(artifacts, 'allin.test.txt') },
        { command: 'npm run typecheck', exitFile: path.join(artifacts, 'allin.typecheck.exit') },
      ],
      tooling: { atomicEditOperations: 1, forbiddenWrites: 0, shellWriteOperations: 0 },
    },
  ],
});

assert.equal(result.ok, true, JSON.stringify(result, null, 2));
const blockArm = result.observedArms.find((arm) => arm.mode === MODES.FACTORY);
const allinArm = result.observedArms.find((arm) => arm.mode === MODES.ATOMIC);
assert.equal(blockArm.diffStats.files, 0);
assert.equal(blockArm.validationDetails.every((item) => item.ok), false);
assert.deepEqual(allinArm.changedFiles, ['src/value.ts']);
assert.equal(allinArm.diffStats.files, 1);
assert.equal(allinArm.validationDetails.every((item) => item.ok), true);
assert.equal(result.scoredRound.winners.overall.winnerMode, MODES.ATOMIC);

process.stdout.write(JSON.stringify({
  ok: true,
  proof: 'codex-worker-metrics-harness',
  blockStatus: blockArm.status,
  allinChangedFiles: allinArm.changedFiles,
  winner: result.scoredRound.winners.overall,
}, null, 2) + '\n');
