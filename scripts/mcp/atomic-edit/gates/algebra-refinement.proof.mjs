#!/usr/bin/env node
/**
 * algebra-refinement.proof.mjs — FASE-1 REFINEMENT LINK (T1).
 *
 * Proves runtime commute() (gates/algebra.ts) EQUALS the predicate machine-checked in
 * formal/atomic-algebra/confluence_z3.py, on the CROSS-FILE fragment, exhaustively over a
 * branch-covering domain (file, spans, closure, capped, disproof readLoci). The same-file/
 * disjoint case is the documented unproven residual (intra-file binding coupling not modelled
 * — algebra.ts) and is surfaced, never claimed as proven.
 * Run: node build.mjs && node gates/algebra-refinement.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { commute } = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const LOCI = ['x.ts', 'y.ts', 'z.ts'];
const FILES = ['x.ts', 'y.ts'];
const SPANS = [[[0, 5]], [[10, 15]], [[3, 8]]];
const subsetsOf = (arr) => {
  const out = [[]];
  for (const e of arr) for (const sub of [...out]) out.push([...sub, e]);
  return out;
};
const spansOverlap = (a, b) => a.some(([s1, e1]) => b.some(([s2, e2]) => s1 < e2 && s2 < e1));
const fact = (file, spans, closureExtra, capped, readLoci) => ({
  file,
  spans,
  closure: new Set([file, ...closureExtra]),
  closureCapped: capped,
  negativeProof: readLoci.length ? { proofSha256: 'x'.repeat(64), removedByteCount: 1, readLoci } : null,
});

// The Z3-proven predicate, mirroring runtime commute()'s branch order EXACTLY.
function modelCommute(a, b) {
  if (a.file === b.file) return !spansOverlap(a.spans, b.spans);
  const readA = new Set([...a.closure, ...(a.negativeProof?.readLoci ?? [])]);
  const readB = new Set([...b.closure, ...(b.negativeProof?.readLoci ?? [])]);
  if (readB.has(a.file) || readA.has(b.file)) return false;
  if (a.closureCapped || b.closureCapped) return false;
  return true;
}

const facts = [];
for (const f of FILES)
  for (const sp of SPANS)
    for (const cl of subsetsOf(LOCI.filter((x) => x !== f)))
      for (const cap of [false, true])
        for (const rl of subsetsOf(LOCI)) facts.push(fact(f, sp, cl, cap, rl));

let crossPairs = 0;
let crossAgree = 0;
let samePairs = 0;
let sameTrue = 0;
const mism = [];
for (let i = 0; i < facts.length; i++)
  for (let j = 0; j < facts.length; j++) {
    const a = facts[i];
    const b = facts[j];
    const rt = commute(a, b).commute;
    if (a.file === b.file) {
      samePairs += 1;
      if (rt) sameTrue += 1;
      continue;
    }
    crossPairs += 1;
    if (rt === modelCommute(a, b)) crossAgree += 1;
    else if (mism.length < 5) mism.push({ a: a.file, b: b.file, rt });
  }

check(
  `REFINEMENT cross-file: runtime commute() == Z3-proven predicate on all ${crossPairs} configs`,
  crossPairs > 0 && crossAgree === crossPairs && mism.length === 0,
);
{
  const a = fact('x.ts', [[0, 5]], [], true, []);
  const b = fact('y.ts', [[0, 5]], [], false, []);
  check(
    'REFINEMENT capped cross-file independent => runtime false AND model false (FASE-0.3 guard)',
    commute(a, b).commute === false && modelCommute(a, b) === false,
  );
}
console.log(
  `        (same-file residual: ${samePairs} pairs, ${sameTrue} granted commute:true by the conservative unproven rule — outside the proven fragment; see formal/atomic-algebra/README.md)`,
);
for (const mm of mism) console.log('  MISMATCH', JSON.stringify(mm));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
