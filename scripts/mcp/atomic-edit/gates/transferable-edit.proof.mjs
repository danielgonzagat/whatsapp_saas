#!/usr/bin/env node
/**
 * transferable-edit.proof.mjs — Idea #5: PROOF-CARRYING TRANSFERABLE EDIT.
 * Proof-Carrying Code (Necula) ships a proof WITH a PROGRAM; here a proof travels WITH an EDIT, and a
 * receiving repo/agent re-verifies it WITHOUT trusting the producer:
 *   (V1) recompute sha256(after) == artifact.afterSha256  (the producer cannot lie about the result), and
 *   (V2) any byte-removal's disproof RE-COMPUTES (the real recomputeDisproof) — a faked refutation is rejected.
 * Composition law (C): two verified artifacts compose iff they COMMUTE (the real algebra).
 * Grounded in the engine (recomputeDisproof, removedByteCountBetween, commute) — no drift.
 * HONEST RESIDUAL: full producer-untrusted RE-EXEC of the registry verdict across repos is the deeper
 * step (engine-proof-reexec.ts re-execs the SYNTACTIC verdict today) — UNJUDGED, not claimed.
 * Run: node build.mjs && node gates/transferable-edit.proof.mjs
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const NP = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));
const { recomputeDisproof, removedByteCountBetween } = NP;
const { commute } = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const makeArtifact = (file, before, after, witness) => ({ file, before, after, afterSha256: sha(after), witness });

// the RECEIVER's producer-untrusted re-verification.
function verifyTransfer(a) {
  if (sha(a.after) !== a.afterSha256) return { ok: false, reason: 'afterSha256 mismatch (tampered result)' };
  if (removedByteCountBetween(a.before, a.after) > 0) {
    const v = recomputeDisproof(a.witness, a.before, a.after);
    if (!v.ok) return { ok: false, reason: 'byte-removal disproof does not re-compute' };
  }
  return { ok: true };
}

const fact = (file, closure) => ({ file, spans: [[0, 5]], closure: new Set([file, ...closure]), closureCapped: false, spanIdents: [] });
function compose(a, b) {
  if (!verifyTransfer(a).ok || !verifyTransfer(b).ok) return { composed: false, reason: 'an artifact failed verification' };
  const c = commute(fact(a.file, []), fact(b.file, []));
  return { composed: c.commute, reason: c.reason };
}

// (V1/V2) valid artifacts re-verify on the receiver side.
const addArt = makeArtifact('a.ts', 'keep();\n', 'keep();\nmore();\n', undefined);
check('(V) additive artifact re-verifies (no removal, sha matches)', verifyTransfer(addArt).ok === true);
const dupArt = makeArtifact('b.ts', 'const a=1;\nconst a=1;\n', 'const a=1;\n', { kind: 'duplicate', readLoci: ['b.ts'] });
check('(V) duplicate-removal artifact re-verifies (disproof recomputes)', verifyTransfer(dupArt).ok === true);

// tampered result => producer cannot lie about the bytes.
const tampered = { ...addArt, after: 'keep();\nEVIL();\n' };
check('(V1) tampered after-bytes => REJECTED (sha mismatch)', verifyTransfer(tampered).ok === false);

// faked refutation => a removal with a false duplicate witness is rejected.
const faked = makeArtifact('c.ts', 'const secret=42;\nkeep();\n', 'keep();\n', { kind: 'duplicate', readLoci: ['c.ts'] });
check('(V2) faked disproof (false duplicate) => REJECTED (does not re-compute)', verifyTransfer(faked).ok === false);

// (C) composition law: verified, different-file artifacts compose; coupled ones do not.
check('(C) two verified different-file artifacts COMPOSE (commute)', compose(addArt, dupArt).composed === true);
const sameFile1 = makeArtifact('d.ts', 'x();\n', 'x();\ny();\n', undefined);
const sameFile2 = makeArtifact('d.ts', 'x();\n', 'x();\nz();\n', undefined);
check('(C) two same-file artifacts (unknown idents) do NOT auto-compose (refused/unjudged)', compose(sameFile1, sameFile2).composed === false);

console.log('  UNJUDGED  full producer-untrusted RE-EXEC of the registry verdict across repos — engine-proof-reexec does the syntactic verdict; not claimed here.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
