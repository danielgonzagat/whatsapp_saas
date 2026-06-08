#!/usr/bin/env node
/**
 * negative-proof-teeth.proof.mjs — FASE-0.2: (a) inverted byte-default has SEMANTIC TEETH.
 * A free-text proof is an honest ASSERTION; a DisproofWitness is RE-COMPUTED against the removed
 * bytes, and a FALSE witness is REFUSED. Decidable kinds only (no Rice).
 *
 * Run: node scripts/mcp/atomic-edit/build.mjs && node scripts/mcp/atomic-edit/gates/negative-proof-teeth.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const M = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));
const { requireNegativeActionProof, requireNegativeProofForRemovedBytes, recomputeDisproof, removedRegion } = M;

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// FLOOR preserved: a <20-char proof is still refused.
check('FLOOR <20-char proof still refused',
  throws(() => requireNegativeActionProof({ action: 'delete', target: 'x', targetUnit: 'file', removedByteCount: 5, proofOfIncorrectness: 'short' })));

// HONESTY: free-text proof admitted, but labelled asserted / recomputed:false (never a faked verification).
{
  const r = requireNegativeActionProof({ action: 'delete', target: 'x', targetUnit: 'file', removedByteCount: 5, proofOfIncorrectness: 'this code is dead and unreachable per the call-graph' });
  check('HONESTY free-text proof ⇒ witnessKind=asserted, recomputed=false (honest, not faked)', r.witnessKind === 'asserted' && r.recomputed === false);
}

// TEETH duplicate TRUE: removed bytes still present in `after` ⇒ recomputed:true, readLoci carried.
{
  const before = 'const a = 1;\nconst a = 1;\n';
  const after = 'const a = 1;\n';
  const r = requireNegativeProofForRemovedBytes({ action: 'dedup', target: 'x', targetUnit: 'file', before, after, proofOfIncorrectness: 'removed an exact duplicate of a line that remains', disproofWitness: { kind: 'duplicate', readLoci: ['x.ts'] } });
  check('TEETH duplicate TRUE ⇒ recomputed:true, witnessKind=duplicate', !!r && r.recomputed === true && r.witnessKind === 'duplicate');
  check('TEETH duplicate TRUE ⇒ readLoci carried into receipt (feeds the algebra)', !!r && Array.isArray(r.readLoci) && r.readLoci.includes('x.ts'));
}

// TEETH duplicate FALSE: removed bytes NOT present in `after` ⇒ REFUSED.
{
  const before = 'const secret = 42;\nkeep();\n';
  const after = 'keep();\n';
  check('TEETH duplicate FALSE (removed bytes absent from after) ⇒ REFUSED',
    throws(() => requireNegativeProofForRemovedBytes({ action: 'delete', target: 'x', targetUnit: 'file', before, after, proofOfIncorrectness: 'claiming a duplicate that does not actually exist here', disproofWitness: { kind: 'duplicate', readLoci: ['x.ts'] } })));
}

// TEETH gate-red with gate + readLoci ⇒ admitted, recomputed, readLoci carried.
{
  const r = requireNegativeActionProof({ action: 'delete', target: 'x', targetUnit: 'file', removedByteCount: 9, proofOfIncorrectness: 'these bytes fail the type-soundness gate (red)', disproofWitness: { kind: 'gate-red', gate: 'type-soundness', readLoci: ['x.ts', 'dep.ts'] } });
  check('TEETH gate-red with gate+readLoci ⇒ recomputed:true, readLoci carried', r.witnessKind === 'gate-red' && r.recomputed === true && r.readLoci.includes('dep.ts'));
}

// TEETH gate-red MISSING readLoci ⇒ REFUSED (a gate-red claim must name what it read).
check('TEETH gate-red without readLoci ⇒ REFUSED',
  throws(() => requireNegativeActionProof({ action: 'delete', target: 'x', targetUnit: 'file', removedByteCount: 9, proofOfIncorrectness: 'asserting a gate red without naming the loci read', disproofWitness: { kind: 'gate-red', gate: 'type-soundness' } })));

// removedRegion is byte-exact.
check('removedRegion extracts the exact removed bytes', removedRegion('abcXYZdef', 'abcdef') === 'XYZ');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
