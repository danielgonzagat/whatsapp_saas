#!/usr/bin/env node
/**
 * replay-admissible.proof.mjs — Idea #2: the proof-carrying / replay-admissible repository.
 * A whole history is admissible iff it is a tamper-evident chain AND every step is gate-positive OR
 * carries a RECOMPUTED disproof. Reuses the real trace.chainHashOf (no drift). Producer-untrusted
 * per-step registry RE-EXEC is honestly UNJUDGED.
 * Run: node build.mjs && node gates/replay-admissible.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { replayAdmissible } = await import(path.join(dir, '..', 'dist', 'replay-admissible.js'));
const { chainHashOf } = await import(path.join(dir, '..', 'dist', 'trace.js'));

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const run = (green) => ({ green, reds: [], notApplicable: [], unjudged: [], ran: [] });
const entry = (parent, after, verdict, neg) => ({
  parentSha256: parent,
  afterSha256: after,
  gateVerdict: verdict,
  chainHash: chainHashOf(parent, after, verdict),
  negativeActionProof: neg,
});

const e0 = entry('', 'sha0', run(true));
const e1 = entry(e0.chainHash, 'sha1', run(true));
const e2 = entry(e1.chainHash, 'sha2', run(false), { recomputed: true, witnessKind: 'duplicate' });
const valid = replayAdmissible([e0, e1, e2]);
check('valid chain (gate-positive steps + a RECOMPUTED-disproof deletion) => admissible', valid.admissible === true && valid.brokenLinks === 0 && valid.unadmittedSteps === 0);

const tv = replayAdmissible([e0, { ...e1, chainHash: 'deadbeef' }, e2]);
check('tampered chainHash => NOT admissible (broken link detected)', tv.admissible === false && tv.brokenLinks >= 1);

const e2asserted = entry(e1.chainHash, 'sha2', run(false), { recomputed: false, witnessKind: 'asserted' });
const av = replayAdmissible([e0, e1, e2asserted]);
check('non-green step with only an ASSERTED disproof => NOT admissible (unadmitted step)', av.admissible === false && av.unadmittedSteps >= 1);

const eOrphan = entry('not-the-prior-hash', 'sha3', run(true));
check('wrong parent link => NOT admissible', replayAdmissible([e0, eOrphan]).admissible === false);

check('producer-untrusted re-exec honestly UNJUDGED (not faked green)', valid.producerUntrustedReexec === 'UNJUDGED');
console.log('  UNJUDGED  producer-untrusted RE-EXEC of the registry over each snapshot — named next step (engine-proof-reexec does the syntactic verdict today).');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
