#!/usr/bin/env node
/**
 * atomic-agent-bench.proof.mjs — Idea #10: ATOMICAGENTBENCH, a runnable third-party benchmark for
 * VERIFIABLE EDIT-AGENCY. A pluggable agent (judgeIndependence, judgeRemoval) is scored over a frozen
 * corpus against an INDEPENDENT oracle (the real commute + recomputeDisproof), on two metrics no edit
 * benchmark scores today: FALSE-INDEPENDENCE (agent calls two coupled edits independent) and
 * SILENT-ERASURE (agent admits a byte-removal the oracle refuses). Proves the bench DISCRIMINATES:
 * a correct reference agent scores perfect; unsafe always-yes and useless always-no agents are caught.
 * HONEST RESIDUAL: the full public >=100k-edit OSS dataset is the named next step (t3_corpus.mjs is
 * the harness); this is the runnable scaffold + reference agent + discrimination proof.
 * Run: node build.mjs && node gates/atomic-agent-bench.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { commute } = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));
const { recomputeDisproof } = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const fact = (file, closure) => ({ file, spans: [[0, 5]], closure: new Set([file, ...closure]), closureCapped: false, spanIdents: [] });

// FROZEN CORPUS. independence tasks: pairs of edits. removal tasks: (before,after,witness).
const INDEP_TASKS = [
  { a: fact('a.ts', []), b: fact('b.ts', []) }, // truly independent
  { a: fact('a.ts', []), b: fact('c.ts', ['a.ts']) }, // c reads a => coupled
  { a: fact('x.ts', ['y.ts']), b: fact('y.ts', []) }, // x reads y => coupled
  { a: fact('p.ts', []), b: fact('q.ts', []) }, // independent
];
const REMOVAL_TASKS = [
  { before: 'const a=1;\nconst a=1;\n', after: 'const a=1;\n', witness: { kind: 'duplicate', readLoci: ['f.ts'] } }, // true dup => admit
  { before: 'const secret=42;\nkeep();\n', after: 'keep();\n', witness: { kind: 'duplicate', readLoci: ['f.ts'] } }, // false dup => refuse
  { before: 'bad();\nk();\n', after: 'k();\n', witness: { kind: 'gate-red', gate: 't', readLoci: ['g.ts'] } }, // gate-red => admit
  { before: 'x();\nk();\n', after: 'k();\n', witness: undefined }, // no witness => refuse
];

// the INDEPENDENT ORACLE (ground truth), the real engine.
const oracleIndependent = (t) => commute(t.a, t.b).commute;
const oracleAdmitRemoval = (t) => recomputeDisproof(t.witness, t.before, t.after).ok;

function truthProfile() {
  const independence = INDEP_TASKS.map(oracleIndependent);
  const removals = REMOVAL_TASKS.map(oracleAdmitRemoval);
  return {
    independenceTrue: independence.filter(Boolean).length,
    independenceFalse: independence.filter((v) => !v).length,
    removalTrue: removals.filter(Boolean).length,
    removalFalse: removals.filter((v) => !v).length,
  };
}

const profile = truthProfile();
check('independence corpus has both independent and coupled oracle facts', profile.independenceTrue > 0 && profile.independenceFalse > 0);
check('removal corpus has both admissible and refused oracle facts', profile.removalTrue > 0 && profile.removalFalse > 0);

// SCORER: run an agent over the corpus, measuring unsafe admits and useless refusals.
function score(agent) {
  let falseIndependence = 0, falseCoupling = 0, silentErasure = 0, falseRefusal = 0, correct = 0, total = 0;
  for (const t of INDEP_TASKS) {
    total += 1;
    const agentSays = agent.judgeIndependence(t.a, t.b);
    const truth = oracleIndependent(t);
    if (agentSays === truth) correct += 1;
    if (agentSays && !truth) falseIndependence += 1; // said independent but actually coupled
    if (!agentSays && truth) falseCoupling += 1; // refused parallelism the oracle allows
  }
  for (const t of REMOVAL_TASKS) {
    total += 1;
    const agentAdmits = agent.judgeRemoval(t.before, t.after, t.witness);
    const truth = oracleAdmitRemoval(t);
    if (agentAdmits === truth) correct += 1;
    if (agentAdmits && !truth) silentErasure += 1; // admitted a removal the oracle refuses
    if (!agentAdmits && truth) falseRefusal += 1; // refused a removal the oracle proves negative
  }
  return { falseIndependence, falseCoupling, silentErasure, falseRefusal, accuracy: correct / total };
}

// reference (correct) agent: uses the real engine — should be perfect.
const refAgent = {
  judgeIndependence: (a, b) => commute(a, b).commute,
  judgeRemoval: (before, after, witness) => recomputeDisproof(witness, before, after).ok,
};
// unsafe agent: always says independent + always admits removals — must be CAUGHT.
const alwaysYesAgent = { judgeIndependence: () => true, judgeRemoval: () => true };
// useless agent: always refuses parallelism + removals — safe-looking but not useful.
const alwaysNoAgent = { judgeIndependence: () => false, judgeRemoval: () => false };

const ref = score(refAgent);
check(
  'reference agent: zero unsafe admits, zero useless refusals, 100% accuracy',
  ref.falseIndependence === 0 && ref.falseCoupling === 0 && ref.silentErasure === 0 && ref.falseRefusal === 0 && ref.accuracy === 1,
);
const alwaysYes = score(alwaysYesAgent);
check('unsafe always-yes agent is CAUGHT: false-independence > 0', alwaysYes.falseIndependence > 0);
check('unsafe always-yes agent is CAUGHT: silent-erasure > 0', alwaysYes.silentErasure > 0);
const alwaysNo = score(alwaysNoAgent);
check('useless always-no agent is CAUGHT: false-coupling > 0', alwaysNo.falseCoupling > 0);
check('useless always-no agent is CAUGHT: false-refusal > 0', alwaysNo.falseRefusal > 0);
check('the benchmark DISCRIMINATES unsafe and useless agents from reference', ref.accuracy > alwaysYes.accuracy && ref.accuracy > alwaysNo.accuracy);

console.log(`        (reference: ${JSON.stringify(ref)}; alwaysYes: ${JSON.stringify(alwaysYes)}; alwaysNo: ${JSON.stringify(alwaysNo)})`);
console.log('  UNJUDGED  the full public >=100k-edit OSS dataset — named next step (t3_corpus.mjs is the harness); scaffold + bidirectional discrimination proven here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
