#!/usr/bin/env node
/**
 * tight-abstain.proof.mjs — Idea #3: TIGHTNESS-of-UNJUDGED (honesty-completeness).
 *
 * A bounded model-checker whose abstention is CERTIFIED TIGHT: it returns UNJUDGED EXACTLY at its
 * declared decidable frontier (|reachable| > cap), and otherwise DECIDES (GREEN/RED) with the verdict
 * matching an INDEPENDENT ground truth — never lazily abstaining inside the frontier, never claiming
 * outside it. The decidable region D is defined SEMANTICALLY (|reachable| <= cap over total next/inv),
 * NOT as the preimage of {GREEN,RED} (which would be tautological). Bounded-exhaustive over a battery.
 *
 * HONEST RESIDUAL: certifying that the REAL gates/formal-gate.ts UNJUDGED is tight (and the UNBOUNDED
 * claim) needs the formal-gate API + an external prover — UNJUDGED, not claimed here. This proves the
 * PROPERTY is achievable and exactly what it requires.
 * Run: node gates/tight-abstain.proof.mjs
 */
const keyOf = (s) => JSON.stringify(s);

// THE CHECKER: BFS bounded by cap. >cap distinct reachable => UNJUDGED (honest abstention at the
// declared frontier); else decide GREEN/RED by the invariant over the reachable set.
function tightAbstain(model) {
  const { init, next, inv, cap } = model;
  const seen = new Map([[keyOf(init), init]]);
  const stack = [init];
  let capped = false;
  while (stack.length) {
    const s = stack.pop();
    for (const t of next(s)) {
      const k = keyOf(t);
      if (!seen.has(k)) {
        if (seen.size > cap) { capped = true; break; }
        seen.set(k, t);
        stack.push(t);
      }
    }
    if (capped) break;
  }
  if (capped || seen.size > cap) return { verdict: 'UNJUDGED' };
  for (const s of seen.values()) if (!inv(s)) return { verdict: 'RED', counterexample: s };
  return { verdict: 'GREEN' };
}

// GROUND TRUTH, computed INDEPENDENTLY of the checker (uncapped BFS; the battery models are finite):
// the true reachable size and the true verdict. This is what makes the tightness claim non-circular.
function groundTruth(model) {
  const { init, next, inv } = model;
  const seen = new Map([[keyOf(init), init]]);
  const stack = [init];
  while (stack.length) {
    const s = stack.pop();
    for (const t of next(s)) { const k = keyOf(t); if (!seen.has(k)) { seen.set(k, t); stack.push(t); } }
  }
  let holds = true;
  for (const s of seen.values()) if (!inv(s)) { holds = false; break; }
  return { size: seen.size, decided: holds ? 'GREEN' : 'RED' };
}

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

// Battery: counter mod N, invariant 'state !== bad'. reachable = {0..N-1} (size N). Vary N (true size),
// cap (declared frontier), and bad (-1 unreachable => GREEN; in-range => RED) to span both sides of D.
const models = [];
for (let N = 2; N <= 8; N++) {
  for (let cap = 2; cap <= 8; cap++) {
    for (const bad of [-1, 0, N - 1]) {
      models.push({ init: 0, next: (s) => [(s + 1) % N], inv: (s) => s !== bad, cap });
    }
  }
}

let lazy = 0; // UNJUDGED emitted INSIDE the frontier (size<=cap) — must be 0
let overclaim = 0; // a DEFINITE verdict emitted OUTSIDE the frontier (size>cap) — must be 0
let unsoundOnD = 0; // verdict disagrees with ground truth inside D — must be 0
for (const m of models) {
  const gt = groundTruth(m);
  const v = tightAbstain(m).verdict;
  const inD = gt.size <= m.cap;
  if (inD && v === 'UNJUDGED') lazy += 1;
  if (!inD && v !== 'UNJUDGED') overclaim += 1;
  if (inD && v !== gt.decided) unsoundOnD += 1;
}

check(`TIGHTNESS no LAZY abstention: 0 UNJUDGED inside the frontier (over ${models.length} models)`, lazy === 0);
check('TIGHTNESS no OVERCLAIM: 0 definite verdict outside the frontier (UNJUDGED is emitted exactly there)', overclaim === 0);
check('SOUNDNESS on D: every in-frontier verdict matches the independent ground truth', unsoundOnD === 0);
// explicit boundary spot-checks (size==cap decides; size==cap+1 abstains).
check('BOUNDARY size==cap => DECIDES (not UNJUDGED)', tightAbstain({ init: 0, next: (s) => [(s + 1) % 5], inv: () => true, cap: 5 }).verdict === 'GREEN');
check('BOUNDARY size==cap+1 => UNJUDGED (abstains exactly past the frontier)', tightAbstain({ init: 0, next: (s) => [(s + 1) % 6], inv: () => true, cap: 5 }).verdict === 'UNJUDGED');

console.log('  UNJUDGED  certifying the REAL gates/formal-gate.ts abstention is tight + the unbounded claim — needs the formal-gate API + an external prover; not claimed here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
