#!/usr/bin/env node
/**
 * experiment.proof.mjs — executable proof for the III.f apparatus controls.
 * Adversarial by design: each control (C1-C5) is attacked and MUST refuse.
 * Synthetic data exercises the PIPELINE only — it is not evidence on the thesis.
 */
import {
  buildFrozenPrompt,
  buildProposalRecord,
  appendProposalJsonl,
  verifyRunLedgerJsonl,
  aggregateArm,
  BASE_PROMPT_VERSION,
  SHADOW_BUDGET,
} from './experiment-harness.mjs';
import * as crypto from 'node:crypto';

const sha = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;
const refuses = (fn, needle) => {
  try {
    fn();
    return { refused: false, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { refused: needle ? message.includes(needle) : true, message };
  }
};

// C1 — frozen skeleton: arms differ ONLY in the information slot
const task = 'remover duplicação no módulo X preservando o contrato público';
const pEscalar = buildFrozenPrompt({ arm: 'ESCALAR', taskText: task, feedback: { lastDecision: 'reject', lastScore: 0 } });
const pGradiente = buildFrozenPrompt({ arm: 'GRADIENTE', taskText: task, feedback: { briefingText: 'PAREDE: byte-floor @ io — 3 colisões' } });
const pSombra = buildFrozenPrompt({ arm: 'GRADIENTE_SOMBRA', taskText: task, feedback: { briefingText: 'PAREDE: byte-floor @ io — 3 colisões' } });
check('C1a.same-skeleton-across-arms', pEscalar.skeletonSha256 === pGradiente.skeletonSha256 && pGradiente.skeletonSha256 === pSombra.skeletonSha256);
check('C1b.arms-actually-differ', new Set([pEscalar.promptSha256, pGradiente.promptSha256, pSombra.promptSha256]).size === 3);
check('C1c.deterministic', buildFrozenPrompt({ arm: 'ESCALAR', taskText: task, feedback: { lastDecision: 'reject', lastScore: 0 } }).promptSha256 === pEscalar.promptSha256);
const drift = refuses(
  () =>
    buildProposalRecord({
      arm: 'ESCALAR',
      seed: 's1',
      generation: 1,
      taskId: 't1',
      basePromptVersion: 'frozen-proposer-v2',
      promptSha256: pEscalar.promptSha256,
      briefingDigest: null,
      proposalDigest: sha('d'),
      verdict: { decision: 'promote' },
    }),
  'C1 FROZEN',
);
check('C1d.version-drift-refused', drift.refused, drift.message);

// C2 — leakage: ESCALAR with a briefing is REFUSED at build AND at verify
const leak = refuses(
  () =>
    buildProposalRecord({
      arm: 'ESCALAR',
      seed: 's1',
      generation: 1,
      taskId: 't1',
      basePromptVersion: BASE_PROMPT_VERSION,
      promptSha256: pEscalar.promptSha256,
      briefingDigest: sha('briefing'),
      proposalDigest: sha('d'),
      verdict: { decision: 'promote' },
    }),
  'C2 LEAKAGE',
);
check('C2a.escalar-briefing-refused-at-build', leak.refused, leak.message);

// C3 — shadow budget
const overBudget = refuses(
  () =>
    buildProposalRecord({
      arm: 'GRADIENTE_SOMBRA',
      seed: 's1',
      generation: 1,
      taskId: 't1',
      basePromptVersion: BASE_PROMPT_VERSION,
      promptSha256: pSombra.promptSha256,
      briefingDigest: sha('briefing'),
      shadowCount: SHADOW_BUDGET + 1,
      proposalDigest: sha('d'),
      verdict: { decision: 'promote' },
    }),
  'C3',
);
check('C3a.over-budget-refused', overBudget.refused, overBudget.message);
const probeInGradiente = refuses(
  () =>
    buildProposalRecord({
      arm: 'GRADIENTE',
      seed: 's1',
      generation: 1,
      taskId: 't1',
      basePromptVersion: BASE_PROMPT_VERSION,
      promptSha256: pGradiente.promptSha256,
      briefingDigest: sha('briefing'),
      shadowCount: 1,
      proposalDigest: sha('d'),
      verdict: { decision: 'promote' },
    }),
  'C3',
);
check('C3b.probe-outside-sombra-refused', probeInGradiente.refused, probeInGradiente.message);

// C4 — hash-chained ledger; tamper and control-violation rejected at verify
const mk = (arm, seed, generation, opts = {}) => ({
  arm,
  seed,
  generation,
  taskId: 't1',
  basePromptVersion: BASE_PROMPT_VERSION,
  promptSha256: sha(`prompt-${arm}-${generation}`),
  briefingDigest: arm === 'ESCALAR' ? null : sha(`briefing-${generation}`),
  shadowCount: arm === 'GRADIENTE_SOMBRA' ? 1 : 0,
  proposalDigest: sha(`prop-${arm}-${seed}-${generation}-${opts.tag ?? ''}`),
  diffText: opts.diffText ?? `diff ${arm} ${seed} g${generation} ${opts.tag ?? ''}`,
  verdict: opts.verdict ?? { decision: 'promote' },
  publicScore: opts.publicScore ?? null,
  unjudged: opts.unjudged === true,
});
let ledger = { ledgerText: '' };
ledger = appendProposalJsonl({ ledgerText: ledger.ledgerText, proposalArgs: mk('ESCALAR', 's1', 1, { verdict: { decision: 'reject', rejections: ['gate.security'], wallKey: 'W1' } }) });
check('C4a.append-ok', ledger.ok === true);
ledger = appendProposalJsonl({ ledgerText: ledger.ledgerText, proposalArgs: mk('ESCALAR', 's1', 2, { verdict: { decision: 'promote' }, publicScore: 2 }) });
check('C4b.chain-grows', ledger.ok === true && ledger.chain.recordCount === 2);
const tampered = ledger.ledgerText.replace('"publicScore":2', '"publicScore":9');
check('C4c.tamper-rejected', verifyRunLedgerJsonl(tampered).ok === false, verifyRunLedgerJsonl(tampered).error);
const forgedControl = (() => {
  const record = JSON.parse(ledger.ledgerText.trim().split('\n')[0]);
  record.briefingDigest = sha('smuggled');
  delete record.recordSha256;
  record.recordSha256 = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  return verifyRunLedgerJsonl(JSON.stringify(record) + '\n');
})();
check('C4d.control-violation-rejected-even-with-valid-hash', forgedControl.ok === false, forgedControl.error);

// C5 — aggregation: mean ± std across seeds, hand-computed
let ab = { ledgerText: '' };
// seed s1: g1 m1=0.5 (1 of 2), g2 m1=1
ab = appendProposalJsonl({ ledgerText: ab.ledgerText, proposalArgs: mk('GRADIENTE', 's1', 1, { tag: 'a', verdict: { decision: 'reject', rejections: ['gate.x'], wallKey: 'W1' } }) });
ab = appendProposalJsonl({ ledgerText: ab.ledgerText, proposalArgs: mk('GRADIENTE', 's1', 1, { tag: 'b', verdict: { decision: 'promote' }, publicScore: 1 }) });
ab = appendProposalJsonl({ ledgerText: ab.ledgerText, proposalArgs: mk('GRADIENTE', 's1', 2, { tag: 'c', verdict: { decision: 'promote' }, publicScore: 2 }) });
// seed s2: g1 m1=1, g2 m1=0 com repeat de W2? (W2 1ª vez em g1 => repeat em g2)
ab = appendProposalJsonl({ ledgerText: ab.ledgerText, proposalArgs: mk('GRADIENTE', 's2', 1, { tag: 'd', verdict: { decision: 'reject', rejections: ['gate.y'], wallKey: 'W2' } }) });
ab = appendProposalJsonl({ ledgerText: ab.ledgerText, proposalArgs: mk('GRADIENTE', 's2', 2, { tag: 'e', verdict: { decision: 'reject', rejections: ['gate.y'], wallKey: 'W2' } }) });
const agg = aggregateArm({ ledgerText: ab.ledgerText, arm: 'GRADIENTE' });
check('C5a.aggregate-ok', agg.ok === true && agg.seeds.length === 2, JSON.stringify(agg.seeds ?? agg.error));
const g1 = agg.perGeneration.find((row) => row.generation === 1);
const g2 = agg.perGeneration.find((row) => row.generation === 2);
// g1 m1: s1=0.5, s2=0 → mean 0.25, std 0.25
check('C5b.m1-mean-std-hand-computed', near(g1.m1.mean, 0.25) && near(g1.m1.std, 0.25) && g1.m1.n === 2, JSON.stringify(g1.m1));
// g2 m2: s1 sem rejeições (null), s2 repeat 1/1 → mean 1 com n=1
check('C5c.m2-null-handling', near(g2.m2.mean, 1) && g2.m2.n === 1, JSON.stringify(g2.m2));
// best-run nunca: a API só expõe mean/std/n
check('C5d.no-best-run-surface', !('best' in g1.m1) && !('max' in g1.m1));

// E2E — aggregate refuses an unverifiable ledger
const aggBad = aggregateArm({ ledgerText: tampered, arm: 'ESCALAR' });
check('E2E.aggregate-refuses-tampered-ledger', aggBad.ok === false);

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'experiment-apparatus',
  checks,
  failedCount: failed.length,
  honestCeiling:
    'Apparatus controls only (C1-C5). No experiment ran; synthetic data proves the pipeline, not the thesis. The real run requires: engine-side III.a consumer, shadowGate (III.e), task suite with stepping-stones, and a frozen LLM proposer.',
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
