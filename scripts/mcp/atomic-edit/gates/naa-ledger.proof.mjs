#!/usr/bin/env node
/**
 * naa-ledger.proof.mjs — Idea #6: tamper-evident NEGATIVE-ACTION AUDIT (deletion provenance).
 * A dedicated chained ledger for byte-REMOVALS: each entry binds the sha256 of the EXACT removed
 * region (the real removedRegion) to its RE-COMPUTED disproof (the real recomputeDisproof) + readLoci,
 * chained tamper-evidently: negChainHash_n = sha256(prev ‖ removedRegionSha256 ‖ proofSha256 ‖
 * canonicalJSON({witnessKind,recomputed,readLoci})). No prior ledger binds the removed bytes to a
 * recomputed refutation. Grounded in the engine (removedRegion, recomputeDisproof, canonicalJSON).
 * Run: node build.mjs && node gates/naa-ledger.proof.mjs
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const NP = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));
const { removedRegion, recomputeDisproof } = NP;
const { canonicalJSON } = await import(path.join(dir, '..', 'dist', 'trace.js'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

// build a chained negative-action entry from a real (before,after,witness).
function naaEntry(prev, before, after, witness) {
  const region = removedRegion(before, after);
  const removedRegionSha256 = sha(region);
  const v = recomputeDisproof(witness, before, after);
  const proofSha256 = sha(canonicalJSON({ witness, recomputed: v.recomputed }));
  const status = { witnessKind: v.kind, recomputed: v.recomputed, readLoci: v.readLoci };
  const negChainHash = sha(`${prev}‖${removedRegionSha256}‖${proofSha256}‖${canonicalJSON(status)}`);
  return { prev, before, after, witness, removedRegionSha256, proofSha256, status, negChainHash, disproofOk: v.ok };
}
function buildNaa(entries) {
  const out = [];
  let prev = '';
  for (const e of entries) { const rec = naaEntry(prev, e.before, e.after, e.witness); out.push(rec); prev = rec.negChainHash; }
  return out;
}
// verify: tamper-evident chain + every entry binds the EXACT removed region + every disproof recomputes.
function verifyNaa(ledger) {
  let broken = 0, unbound = 0, unrefuted = 0;
  let prev = '';
  for (const r of ledger) {
    const region = removedRegion(r.before, r.after);
    if (sha(region) !== r.removedRegionSha256) unbound += 1;
    const recomputed = sha(`${prev}‖${r.removedRegionSha256}‖${r.proofSha256}‖${canonicalJSON(r.status)}`);
    if (recomputed !== r.negChainHash || r.prev !== prev) broken += 1;
    if (!recomputeDisproof(r.witness, r.before, r.after).ok) unrefuted += 1;
    prev = r.negChainHash;
  }
  return { tamperEvident: broken === 0, allBound: unbound === 0, allRefuted: unrefuted === 0, broken, unbound, unrefuted };
}

// a valid negative-action audit: two real, recomputed-refuted removals.
const valid = buildNaa([
  { before: 'const a=1;\nconst a=1;\n', after: 'const a=1;\n', witness: { kind: 'duplicate', readLoci: ['f.ts'] } },
  { before: 'bad();\nkeep();\n', after: 'keep();\n', witness: { kind: 'gate-red', gate: 'type', readLoci: ['g.ts'] } },
]);
const vv = verifyNaa(valid);
check('valid negative-action ledger: tamper-evident + every removed-region bound + every disproof recomputes', vv.tamperEvident && vv.allBound && vv.allRefuted);

// tamper a removedRegionSha256 => unbound AND chain broken.
const tamperedBind = valid.map((r, i) => (i === 0 ? { ...r, removedRegionSha256: 'deadbeef' } : r));
const tv = verifyNaa(tamperedBind);
check('tampered removed-region binding => detected (unbound + broken chain)', tv.allBound === false && tv.tamperEvident === false);

// tamper a chain hash => broken.
const tamperedChain = valid.map((r, i) => (i === 1 ? { ...r, negChainHash: 'deadbeef' } : r));
check('tampered chain hash => NOT tamper-evident', verifyNaa(tamperedChain).tamperEvident === false);

// an entry whose disproof is FALSE (false duplicate) => flagged unrefuted.
const withFalse = buildNaa([{ before: 'const secret=42;\nkeep();\n', after: 'keep();\n', witness: { kind: 'duplicate', readLoci: ['f.ts'] } }]);
check('a removal with a FALSE disproof => flagged (allRefuted=false)', verifyNaa(withFalse).allRefuted === false);

console.log('  UNJUDGED  cross-org public-key cosigned transparency-log variant — named next step; not claimed here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
