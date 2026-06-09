#!/usr/bin/env node
/**
 * task-suite.proof.mjs — proves the STEPPING-STONE property of the sandbox
 * suite by inequality chain (never by assertion):
 *   S1: the greedy goal-edit (full dedup in ONE step) is REFUSED by the hard
 *       channel with a byte-floor witness;
 *   S2: an admissible intermediate exists with score STRICTLY BELOW baseline;
 *   S3: from that valley, admissible steps reach a score STRICTLY ABOVE baseline;
 *   S4: the padding-strip shortcut (raise score by deleting fixtures) is REFUSED.
 * Also proves witness-shape compatibility with disproof-corpus-harness.
 * Exit 1 on any failure. Synthetic; proves the apparatus, not the thesis.
 */
import { TASKS, evaluateProposal, baselineScore, BYTE_CAP, removedByteCountBetween } from './task-suite-harness.mjs';
import { appendWitnessJsonl, verifyCorpusJsonl } from './disproof-corpus-harness.mjs';
import * as crypto from 'node:crypto';

const sha = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const TASK_ID = 'task1-dedup-under-byte-cap';
const baseline = TASKS[TASK_ID].baselineText;
const scoreBase = baselineScore(TASK_ID);

const DUP_BODY = [
  '  // dup:block',
  '  const x = compute(1, "alpha-padding-0001");',
  '  const y = compute(2, "alpha-padding-0002");',
  '  const z = combine(x, y, "alpha-padding-0003");',
  '  return normalize(z); // end-dup',
].join('\n');
const CALL_BODY = '  return shared(); // dedup-step';
const HELPER = [
  '',
  'function shared() {',
  '  const x = compute(1, "alpha-padding-0001");',
  '  const y = compute(2, "alpha-padding-0002");',
  '  const z = combine(x, y, "alpha-padding-0003");',
  '  return normalize(z);',
  '}',
  '',
].join('\n');

check('S0a.baseline-contains-two-dup-bodies', baseline.split(DUP_BODY).length === 3, `scoreBase=${scoreBase}`);

// S1 — GREEDY refused: helper + both blocks replaced, in ONE step from baseline
const greedy = (baseline + HELPER).replace(DUP_BODY, CALL_BODY).replace(DUP_BODY, CALL_BODY);
const greedyRemoved = removedByteCountBetween(baseline, greedy);
const greedyVerdict = evaluateProposal({ taskId: TASK_ID, previousText: baseline, proposedText: greedy });
check('S1a.greedy-exceeds-byte-cap', greedyRemoved > BYTE_CAP, `removed=${greedyRemoved} cap=${BYTE_CAP}`);
check('S1b.greedy-rejected-with-byte-floor-witness', greedyVerdict.decision === 'reject' && greedyVerdict.witnesses.some((w) => w.invariantId === 'sandbox.byte-floor'), JSON.stringify(greedyVerdict.rejections));
check('S1c.greedy-would-have-scored-higher', TASKS[TASK_ID].score(greedy) > scoreBase, `greedyScore=${TASKS[TASK_ID].score(greedy)} base=${scoreBase}`);

// S2 — the VALLEY: pure-addition helper step is admissible and scores BELOW baseline
const step1 = baseline + HELPER;
const v1 = evaluateProposal({ taskId: TASK_ID, previousText: baseline, proposedText: step1 });
check('S2a.valley-step-admitted', v1.decision === 'promote', JSON.stringify(v1.rejections));
check('S2b.valley-scores-below-baseline', v1.publicScore < scoreBase, `valley=${v1.publicScore} base=${scoreBase}`);

// S3 — from the valley, admissible per-block steps climb ABOVE baseline
const step2 = step1.replace(DUP_BODY, CALL_BODY);
const removed2 = removedByteCountBetween(step1, step2);
const v2 = evaluateProposal({ taskId: TASK_ID, previousText: step1, proposedText: step2 });
check('S3a.single-block-within-cap', removed2 <= BYTE_CAP, `removed=${removed2} cap=${BYTE_CAP}`);
check('S3b.first-climb-admitted', v2.decision === 'promote', JSON.stringify(v2.rejections));
const step3 = step2.replace(DUP_BODY, CALL_BODY);
const v3 = evaluateProposal({ taskId: TASK_ID, previousText: step2, proposedText: step3 });
check('S3c.second-climb-admitted', v3.decision === 'promote', JSON.stringify(v3.rejections));
check('S3d.final-above-baseline', v3.publicScore > scoreBase, `final=${v3.publicScore} base=${scoreBase}`);
check('S3e.full-chain-inequality', v1.publicScore < scoreBase && scoreBase < v3.publicScore, `${v1.publicScore} < ${scoreBase} < ${v3.publicScore} (via ${v2.publicScore})`);

// S4 — padding-strip shortcut refused
const stripped = baseline.split('alpha-padding-0001').join('p');
const v4 = evaluateProposal({ taskId: TASK_ID, previousText: baseline, proposedText: stripped });
check('S4a.padding-strip-rejected', v4.decision === 'reject' && v4.witnesses.some((w) => w.invariantId === 'sandbox.padding-contract'), JSON.stringify(v4.rejections));

// S5 — task2: security monotonicity wall + legitimate extension
const t2 = TASKS['task2-extend-scanner-monotonic'];
const t2Shrunk = t2.baselineText.replace('// regex: /eval\\(/\n', '');
const v5 = evaluateProposal({ taskId: t2.taskId, previousText: t2.baselineText, proposedText: t2Shrunk });
check('S5a.regex-removal-rejected', v5.decision === 'reject' && v5.witnesses.some((w) => w.invariantId === 'sandbox.security-monotonicity'), JSON.stringify(v5.rejections));
const t2Extended = t2.baselineText.replace('\n', '\n// regex: /execSync/\n');
const v6 = evaluateProposal({ taskId: t2.taskId, previousText: t2.baselineText, proposedText: t2Extended });
check('S5b.regex-extension-admitted-and-scores-higher', v6.decision === 'promote' && v6.publicScore > t2.score(t2.baselineText), `score=${v6.publicScore} base=${t2.score(t2.baselineText)}`);

// S6 — witness shapes flow into the corpus unchanged (the gradient pipeline)
let corpus = { corpusText: '' };
for (const witness of [...greedyVerdict.witnesses, ...v4.witnesses, ...v5.witnesses]) {
  corpus = appendWitnessJsonl({
    corpusText: corpus.corpusText,
    witnessArgs: {
      ...witness,
      proposalDigest: sha(JSON.stringify(witness)),
      generation: 1,
      archiveEntrySha256: sha('sandbox-run'),
    },
  });
  if (corpus.ok !== true) break;
}
const corpusVerify = corpus.ok === true ? verifyCorpusJsonl(corpus.corpusText) : { ok: false, error: corpus.error };
// 4 witnesses entram (greedy byte-floor, strip byte-floor+padding, regex-removal),
// mas strip-byte-floor bate na MESMA parede do greedy → dedup vira wall-hit:
// 4 registros, 3 paredes, e a parede byte-floor DEVE ter hitCount 2.
const byteFloorWallLive = corpusVerify.ok === true ? corpusVerify.walls.find((w) => w.invariantId === 'sandbox.byte-floor') : null;
check('S6a.sandbox-witnesses-feed-corpus-with-live-dedup', corpusVerify.ok === true && corpusVerify.recordCount === 4 && corpusVerify.wallCount === 3 && byteFloorWallLive?.hitCount === 2, JSON.stringify({ ok: corpusVerify.ok, records: corpusVerify.recordCount, walls: corpusVerify.wallCount, byteFloorHits: byteFloorWallLive?.hitCount ?? null, error: corpusVerify.error ?? null }));

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'task-suite-stepping-stones',
  scoreChain: { valley: null, baseline: scoreBase },
  checks,
  failedCount: failed.length,
  honestCeiling:
    'Proves the sandbox stepping-stone inequality and witness-pipeline compatibility. Does not claim NO single-step improvement exists (minor nibbles like title-comment deletion remain); the GOAL-level jump provably requires the valley.',
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
