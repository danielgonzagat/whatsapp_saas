#!/usr/bin/env node
/**
 * atomic-agent-bench.proof.mjs — Idea #10: ATOMICAGENTBENCH, a runnable third-party benchmark for
 * VERIFIABLE EDIT-AGENCY. A pluggable agent (judgeIndependence, judgeRemoval) is scored over a frozen
 * corpus against an INDEPENDENT oracle (the real commute + recomputeDisproof), on two metrics no edit
 * benchmark scores today: FALSE-INDEPENDENCE (agent calls two coupled edits independent) and
 * SILENT-ERASURE (agent admits a byte-removal the oracle refuses). Proves the bench DISCRIMINATES:
 * a correct reference agent scores perfect; a broken always-yes agent is caught.
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

// SCORER: run an agent over the corpus, measure false-independence + silent-erasure.
function score(agent) {
  let falseIndependence = 0, silentErasure = 0, correct = 0, total = 0;
  for (const t of INDEP_TASKS) {
    total += 1;
    const agentSays = agent.judgeIndependence(t.a, t.b);
    const truth = oracleIndependent(t);
    if (agentSays === truth) correct += 1;
    if (agentSays && !truth) falseIndependence += 1; // said independent but actually coupled
  }
  for (const t of REMOVAL_TASKS) {
    total += 1;
    const agentAdmits = agent.judgeRemoval(t.before, t.after, t.witness);
    const truth = oracleAdmitRemoval(t);
    if (agentAdmits === truth) correct += 1;
    if (agentAdmits && !truth) silentErasure += 1; // admitted a removal the oracle refuses
  }
  return { falseIndependence, silentErasure, accuracy: correct / total };
}

// reference (correct) agent: uses the real engine — should be perfect.
const refAgent = {
  judgeIndependence: (a, b) => commute(a, b).commute,
  judgeRemoval: (before, after, witness) => recomputeDisproof(witness, before, after).ok,
};
// broken agent: always says independent + always admits removals — must be CAUGHT.
const brokenAgent = { judgeIndependence: () => true, judgeRemoval: () => true };

const ref = score(refAgent);
check('reference agent: 0 false-independence, 0 silent-erasure, 100% accuracy', ref.falseIndependence === 0 && ref.silentErasure === 0 && ref.accuracy === 1);
const broken = score(brokenAgent);
check('broken always-yes agent is CAUGHT: false-independence > 0', broken.falseIndependence > 0);
check('broken always-yes agent is CAUGHT: silent-erasure > 0', broken.silentErasure > 0);
check('the benchmark DISCRIMINATES (reference accuracy > broken accuracy)', ref.accuracy > broken.accuracy);

console.log(`        (reference: ${JSON.stringify(ref)}; broken: ${JSON.stringify(broken)})`);
console.log('  UNJUDGED  the full public >=100k-edit OSS dataset — named next step (t3_corpus.mjs is the harness); scaffold + discrimination proven here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
