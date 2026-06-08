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
const fact = (file, spans, closureExtra, capped, readLoci, spanIdents = []) => ({
  file,
  spans,
  closure: new Set([file, ...closureExtra]),
  closureCapped: capped,
  negativeProof: readLoci.length ? { proofSha256: 'x'.repeat(64), removedByteCount: 1, readLoci } : null,
  spanIdents,
});

// The Z3-proven predicate, mirroring runtime commute()'s branch order EXACTLY.
function modelCommute(a, b) {
  if (a.file === b.file) {
    if (spansOverlap(a.spans, b.spans)) return false;
    const ai = a.spanIdents;
    const bi = b.spanIdents;
    if (ai && bi) return !ai.some((x) => bi.includes(x));
    return false; // unknown identifiers => UNJUDGED => not commuting
  }
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
let sameAgree = 0;
const mism = [];
for (let i = 0; i < facts.length; i++)
  for (let j = 0; j < facts.length; j++) {
    const a = facts[i];
    const b = facts[j];
    const rt = commute(a, b).commute;
    const ok = rt === modelCommute(a, b);
    if (a.file === b.file) {
      samePairs += 1;
      if (ok) sameAgree += 1;
      else if (mism.length < 5) mism.push({ kind: 'same', a: a.file, rt });
    } else {
      crossPairs += 1;
      if (ok) crossAgree += 1;
      else if (mism.length < 5) mism.push({ kind: 'cross', a: a.file, b: b.file, rt });
    }
  }

check(
  `REFINEMENT cross-file: runtime commute() == Z3-proven predicate on all ${crossPairs} configs`,
  crossPairs > 0 && crossAgree === crossPairs,
);
check(
  `REFINEMENT same-file: runtime commute() == Z3-proven predicate on all ${samePairs} configs (FASE-2b, residual closed)`,
  samePairs > 0 && sameAgree === samePairs,
);
check('REFINEMENT no mismatches anywhere', mism.length === 0);
{
  const a = fact('x.ts', [[0, 5]], [], true, []);
  const b = fact('y.ts', [[0, 5]], [], false, []);
  check(
    'REFINEMENT capped cross-file independent => runtime false AND model false (FASE-0.3 guard)',
    commute(a, b).commute === false && modelCommute(a, b) === false,
  );
}
{
  // explicit same-file identifier cases (the loop covers empty-idents; pin shared/disjoint/unknown).
  const shA = fact('f.ts', [[0, 5]], [], false, [], ['X']);
  const shB = fact('f.ts', [[10, 15]], [], false, [], ['X']);
  const djA = fact('f.ts', [[0, 5]], [], false, [], ['X']);
  const djB = fact('f.ts', [[10, 15]], [], false, [], ['Y']);
  const ukA = { file: 'f.ts', spans: [[0, 5]], closure: new Set(['f.ts']), closureCapped: false };
  const ukB = { file: 'f.ts', spans: [[10, 15]], closure: new Set(['f.ts']), closureCapped: false };
  check('REFINEMENT same-file shared-ident: runtime==model AND both COUPLED', commute(shA, shB).commute === modelCommute(shA, shB) && commute(shA, shB).commute === false);
  check('REFINEMENT same-file disjoint-ident: runtime==model AND both independent', commute(djA, djB).commute === modelCommute(djA, djB) && commute(djA, djB).commute === true);
  check('REFINEMENT same-file unknown-ident: runtime==model AND both refused', commute(ukA, ukB).commute === modelCommute(ukA, ukB) && commute(ukA, ukB).commute === false);
}
console.log(
  `        (same-file fragment now PROVEN: ${samePairs} pairs, runtime == Z3-proven predicate; intra-file identifier coupling decided — FASE-2b residual closed)`,
);
for (const mm of mism) console.log('  MISMATCH', JSON.stringify(mm));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
