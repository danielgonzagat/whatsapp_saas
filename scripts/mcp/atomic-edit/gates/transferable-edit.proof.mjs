#!/usr/bin/env node
/**
 * transferable-edit.proof.mjs — Idea #5: PROOF-CARRYING TRANSFERABLE EDIT.
 * Proof-Carrying Code (Necula) ships a proof WITH a PROGRAM; here a proof travels WITH an EDIT, and a
 * receiving repo/agent re-verifies it WITHOUT trusting the producer:
 *   (V1) recompute sha256(after) == artifact.afterSha256  (the producer cannot lie about the result),
 *   (V2) any byte-removal's disproof RE-COMPUTES (the real recomputeDisproof) — a faked refutation is rejected, and
 *   (V3) the embedded syntactic validation verdict RE-EXECS from the embedded snapshot before trust.
 * Composition law (C): two verified artifacts compose iff they COMMUTE (the real algebra).
 * Grounded in the engine (recomputeDisproof, removedByteCountBetween, commute, engine-proof-reexec) — no drift.
 * HONEST RESIDUAL: full producer-untrusted RE-EXEC of the registry-lattice verdict across repos is the deeper
 * step — UNJUDGED, not claimed.
 * Run: node build.mjs && node gates/transferable-edit.proof.mjs
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const NP = await import(path.join(dir, '..', 'dist', 'server-helpers-negative-proof.js'));
const { recomputeDisproof, removedByteCountBetween } = NP;
const { commute } = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));
const { buildSnapshot, reexecValidate } = await import(path.join(dir, '..', 'dist', 'engine-proof-reexec.js'));

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const makeArtifact = (file, before, after, witness) => {
  const snapshot = buildSnapshot(file, before, after);
  const validation = reexecValidate(snapshot, null, snapshot.afterSha256).recomputed;
  return { file, before, after, afterSha256: snapshot.afterSha256, witness, snapshot, validation };
};

// the RECEIVER's producer-untrusted re-verification.
function verifyTransfer(a) {
  if (sha(a.after) !== a.afterSha256) return { ok: false, reason: 'afterSha256 mismatch (tampered result)' };
  if (!a.snapshot || !a.validation) return { ok: false, reason: 'missing snapshot or syntactic validation verdict' };
  if (
    a.snapshot.file !== a.file ||
    a.snapshot.before !== a.before ||
    a.snapshot.after !== a.after ||
    a.snapshot.afterSha256 !== a.afterSha256
  ) {
    return { ok: false, reason: 'embedded snapshot does not match artifact bytes' };
  }
  const reexec = reexecValidate(a.snapshot, a.validation, a.afterSha256);
  if (!reexec.reproduces) return { ok: false, reason: `syntactic re-exec does not reproduce: ${reexec.note}` };
  if (a.validation.ok !== true) return { ok: false, reason: 'reproduced syntactic validation is red' };
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

// (V1/V2/V3) valid artifacts re-verify on the receiver side.
const addArt = makeArtifact('a.ts', 'keep();\n', 'keep();\nmore();\n', undefined);
check('(V) additive artifact re-verifies (sha + syntactic reexec)', verifyTransfer(addArt).ok === true);
const dupArt = makeArtifact('b.ts', 'const a=1;\nconst a=1;\n', 'const a=1;\n', { kind: 'duplicate', readLoci: ['b.ts'] });
check('(V) duplicate-removal artifact re-verifies (syntax + disproof recompute)', verifyTransfer(dupArt).ok === true);

// tampered result => producer cannot lie about the bytes.
const tampered = { ...addArt, after: 'keep();\nEVIL();\n' };
check('(V1) tampered after-bytes => REJECTED (sha mismatch)', verifyTransfer(tampered).ok === false);

// missing or forged syntactic proof material is rejected by the receiver.
const missingReexec = { ...addArt, validation: null };
check('(V3) missing syntactic reexec material => REJECTED', verifyTransfer(missingReexec).ok === false);
const forgedValidation = { ...addArt, validation: { language: 'ts', before: 0, after: 1, ok: false } };
check('(V3) forged syntactic verdict => REJECTED (does not reproduce)', verifyTransfer(forgedValidation).ok === false);
const invalidAfter = makeArtifact('bad.ts', 'keep();\n', 'keep();\nBROKEN(\n', undefined);
check('(V3) reproducible red syntactic verdict => REJECTED', verifyTransfer(invalidAfter).ok === false);

// faked refutation => a removal with a false duplicate witness is rejected.
const faked = makeArtifact('c.ts', 'const secret=42;\nkeep();\n', 'keep();\n', { kind: 'duplicate', readLoci: ['c.ts'] });
check('(V2) faked disproof (false duplicate) => REJECTED (does not re-compute)', verifyTransfer(faked).ok === false);

// (C) composition law: verified, different-file artifacts compose; coupled ones do not.
check('(C) two verified different-file artifacts COMPOSE (commute)', compose(addArt, dupArt).composed === true);
const sameFile1 = makeArtifact('d.ts', 'x();\n', 'x();\ny();\n', undefined);
const sameFile2 = makeArtifact('d.ts', 'x();\n', 'x();\nz();\n', undefined);
check('(C) two same-file artifacts (unknown idents) do NOT auto-compose (refused/unjudged)', compose(sameFile1, sameFile2).composed === false);

console.log('  PASS  syntactic producer-untrusted RE-EXEC travels with the artifact (receiver re-runs engine.validate).');
console.log('  UNJUDGED  full producer-untrusted registry-lattice verdict RE-EXEC across repos remains residual.');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
