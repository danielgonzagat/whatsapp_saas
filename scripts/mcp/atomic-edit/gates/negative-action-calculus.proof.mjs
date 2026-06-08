#!/usr/bin/env node
/**
 * negative-action-calculus.proof.mjs — Idea #4: the NEGATIVE-ACTION CALCULUS, grounded in the real
 * engine (no drift): the admission judgment is requireNegativeProofForRemovedBytes; the removed-byte
 * measure is removedByteCountBetween. We prove the calculus's metatheorems operationally:
 *
 *   (T1 no-silent-erasure) every ADMITTED edit that removes bytes carries a SHA-bound disproof
 *                          receipt — a removal is NEVER admitted silently.
 *   (T2 teeth/strict)       under STRICT admission (accept only recomputed witnesses) every admitted
 *                          removal carries a RECOMPUTED refutation (a false/asserted disproof is rejected).
 *   (T3 honesty)            a free-text proof IS admitted but the receipt is labeled asserted /
 *                          recomputed:false — honest, never a faked verification.
 *   (T4 progress)           additive edits (0 bytes removed) are admitted with NO obligation.
 *
 * HONEST RESIDUAL: the full proof-theoretic (sequent-calculus) metatheory — cut-elimination /
 * subject-reduction style — in an external prover is UNJUDGED, not claimed. This proves the
 * operational metatheorems over the real admission relation.
 * Run: node build.mjs && node gates/negative-action-calculus.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const M = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));
const { requireNegativeProofForRemovedBytes, removedByteCountBetween } = M;

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

// the admission JUDGMENT (the calculus rule), via the real engine. additive => receipt undefined.
function admit(before, after, proof, witness) {
  try {
    const receipt = requireNegativeProofForRemovedBytes({
      action: 'edit', target: 'f.ts', targetUnit: 'file', before, after,
      proofOfIncorrectness: proof, disproofWitness: witness,
    });
    return { admitted: true, receipt };
  } catch (e) {
    return { admitted: false, error: String((e && e.message) || e) };
  }
}

// the battery of edit judgments spanning the calculus rules.
const DUP_BEFORE = 'const a = 1;\nconst a = 1;\n';
const DUP_AFTER = 'const a = 1;\n';
const cases = [
  { name: 'additive', before: 'keep();\n', after: 'keep();\nmore();\n', proof: undefined, witness: undefined },
  { name: 'dup-true', before: DUP_BEFORE, after: DUP_AFTER, proof: 'removed an exact duplicate of a line that remains', witness: { kind: 'duplicate', readLoci: ['f.ts'] } },
  { name: 'dup-false', before: 'const secret = 42;\nkeep();\n', after: 'keep();\n', proof: 'claiming a duplicate that does not actually exist', witness: { kind: 'duplicate', readLoci: ['f.ts'] } },
  { name: 'gate-red', before: 'bad();\nkeep();\n', after: 'keep();\n', proof: 'these bytes fail the type-soundness gate red', witness: { kind: 'gate-red', gate: 'type-soundness', readLoci: ['f.ts'] } },
  { name: 'asserted', before: 'dead();\nkeep();\n', after: 'keep();\n', proof: 'this code is dead and unreachable per the call graph', witness: undefined },
  { name: 'no-proof', before: 'x();\nkeep();\n', after: 'keep();\n', proof: undefined, witness: undefined },
  { name: 'short-proof', before: 'x();\nkeep();\n', after: 'keep();\n', proof: 'short', witness: undefined },
];
const results = cases.map((c) => ({ ...c, removed: removedByteCountBetween(c.before, c.after), ...admit(c.before, c.after, c.proof, c.witness) }));
const by = (n) => results.find((r) => r.name === n);

// (T1) no-silent-erasure: every admitted removal carries a SHA-bound receipt.
const t1 = results.every((r) => !(r.admitted && r.removed > 0) || (r.receipt && typeof r.receipt.proofSha256 === 'string'));
check('(T1) no-silent-erasure: every admitted byte-removal carries a SHA-bound disproof receipt', t1);

// (T2) teeth under STRICT admission: accept a removal only if its receipt is recomputed:true.
const strictAdmits = (r) => r.admitted && r.removed > 0 && r.receipt && r.receipt.recomputed === true;
check('(T2) strict teeth: dup-true and gate-red admit under strict (recomputed refutation)', strictAdmits(by('dup-true')) && strictAdmits(by('gate-red')));
check('(T2) strict teeth: asserted-only removal does NOT admit under strict', !strictAdmits(by('asserted')) && by('asserted').receipt.recomputed === false);

// (T3) honesty: a free-text proof is admitted but labeled asserted / recomputed:false (not faked).
const as_ = by('asserted');
check('(T3) honesty: free-text removal admitted but witnessKind=asserted, recomputed=false', as_.admitted === true && as_.receipt.witnessKind === 'asserted' && as_.receipt.recomputed === false);

// (T4) progress: additive edits admitted with NO obligation (no receipt).
const add_ = by('additive');
check('(T4) progress: additive edit admitted with no obligation (receipt undefined)', add_.admitted === true && add_.receipt === undefined && add_.removed === 0);

// refusals: a false duplicate, no proof, and a short proof are all REFUSED.
check('REFUSE false-duplicate removal', by('dup-false').admitted === false);
check('REFUSE no-proof removal', by('no-proof').admitted === false);
check('REFUSE short-proof removal', by('short-proof').admitted === false);

console.log('  UNJUDGED  full sequent-calculus metatheory (cut-elimination / subject-reduction) in a prover — not claimed here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
