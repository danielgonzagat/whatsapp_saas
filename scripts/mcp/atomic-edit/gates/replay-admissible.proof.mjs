#!/usr/bin/env node
/**
 * replay-admissible.proof.mjs — Idea #2: the proof-carrying / replay-admissible repository.
 * A whole history is admissible iff it is a tamper-evident chain AND every step is gate-positive OR
 * carries a RECOMPUTED disproof. It now also re-execs embedded syntactic and dynamic-registry verdict
 * material when present. Full built-in registry-lattice RE-EXEC remains honestly UNJUDGED.
 * Run: node build.mjs && node gates/replay-admissible.proof.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(dir, '..');
const { replayAdmissible } = await import(path.join(dir, '..', 'dist', 'replay-admissible.js'));
const { runRegistryGatesOverEditSync } = await import(path.join(dir, '..', 'dist', 'engine-gate-registry.js'));
const { buildSnapshot, reexecValidate } = await import(path.join(dir, '..', 'dist', 'engine-proof-reexec.js'));
const { chainHashOf } = await import(path.join(dir, '..', 'dist', 'trace.js'));

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

const registryRepoRoot = fs.mkdtempSync(path.join(sourceDir, '.proof-replay-registry-'));
const registryDir = path.join(registryRepoRoot, '.atomic', 'gates');
fs.mkdirSync(registryDir, { recursive: true });
const gatePath = path.join(registryRepoRoot, 'no-debt-regression-gate.mjs');
fs.writeFileSync(gatePath, `
export const id = 'no-debt-regression';
export const appliesTo = (file) => file.endsWith('.ts');
export function gate(ctx) {
  return ctx.after.includes('DEBT_REGRESSION')
    ? { id, status: 'red', fact: 'DEBT_REGRESSION introduced' }
    : { id, status: 'green', fact: 'no DEBT_REGRESSION marker' };
}
`);
fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify({
  format: 'atomic-gate-registry/v2',
  gates: [{ id: 'no-debt-regression', modulePath: gatePath, intent: 'red DEBT_REGRESSION markers', monotonic: true, admittedAgainst: 0, admittedAt: '2026-06-08T00:00:00.000Z' }],
}, null, 2));

const run = (green) => ({ green, reds: [], notApplicable: [], unjudged: [], ran: [] });
const dynamicVerdict = (snapshot, repoRoot = registryRepoRoot) => runRegistryGatesOverEditSync({
  file: snapshot.file,
  before: snapshot.before,
  after: snapshot.after,
  repoRoot,
}, repoRoot);
const entry = (parent, file, before, after, verdict, neg, opts = {}) => {
  const snapshot = buildSnapshot(file, before, after);
  const validation = opts.validation ?? reexecValidate(snapshot, null, snapshot.afterSha256).recomputed;
  const syntacticReexec = opts.omitReexec ? undefined : { snapshot, validation };
  return {
    parentSha256: parent,
    afterSha256: snapshot.afterSha256,
    gateVerdict: verdict,
    chainHash: chainHashOf(parent, snapshot.afterSha256, verdict),
    negativeActionProof: neg,
    syntacticReexec,
    dynamicRegistryReexec: opts.omitDynamicRegistry ? undefined : {
      repoRoot: opts.dynamicRepoRoot ?? registryRepoRoot,
      verdict: opts.dynamicVerdict ?? dynamicVerdict(snapshot, opts.dynamicRepoRoot ?? registryRepoRoot),
    },
  };
};

const e0 = entry('', 'a.ts', '', 'const a=1;\n', run(true));
const e1 = entry(e0.chainHash, 'b.ts', 'const b=1;\n', 'const b=2;\n', run(true));
const e2 = entry(e1.chainHash, 'c.ts', 'const a=1;\nconst a=1;\n', 'const a=1;\n', run(false), { recomputed: true, witnessKind: 'duplicate' });
const valid = replayAdmissible([e0, e1, e2]);
check('valid chain (gate-positive steps + a RECOMPUTED-disproof deletion) => admissible', valid.admissible === true && valid.brokenLinks === 0 && valid.unadmittedSteps === 0);
check('valid chain with snapshots => syntactic producer-untrusted RE-EXEC is GREEN', valid.syntacticProducerUntrustedReexec === 'GREEN' && valid.reexecFailures === 0 && valid.reexecUnjudgedSteps === 0);
check('valid chain with registry material => dynamic registry producer-untrusted RE-EXEC is GREEN', valid.dynamicRegistryProducerUntrustedReexec === 'GREEN' && valid.dynamicRegistryFailures === 0 && valid.dynamicRegistryUnjudgedSteps === 0);

const tv = replayAdmissible([e0, { ...e1, chainHash: 'deadbeef' }, e2]);
check('tampered chainHash => NOT admissible (broken link detected)', tv.admissible === false && tv.brokenLinks >= 1);

const e2asserted = entry(e1.chainHash, 'c.ts', 'const a=1;\nconst a=1;\n', 'const a=1;\n', run(false), { recomputed: false, witnessKind: 'asserted' });
const av = replayAdmissible([e0, e1, e2asserted]);
check('non-green step with only an ASSERTED disproof => NOT admissible (unadmitted step)', av.admissible === false && av.unadmittedSteps >= 1);

const eOrphan = entry('not-the-prior-hash', 'd.ts', '', 'const d=1;\n', run(true));
check('wrong parent link => NOT admissible', replayAdmissible([e0, eOrphan]).admissible === false);

const missingReexec = replayAdmissible([entry('', 'n.ts', '', 'ok();\n', run(true), undefined, { omitReexec: true, omitDynamicRegistry: true })]);
check('missing syntactic reexec material stays UNJUDGED, not synthesized-green', missingReexec.admissible === true && missingReexec.syntacticProducerUntrustedReexec === 'UNJUDGED');
check('missing dynamic registry material stays UNJUDGED, not synthesized-green', missingReexec.admissible === true && missingReexec.dynamicRegistryProducerUntrustedReexec === 'UNJUDGED');

const redSyntax = replayAdmissible([e0, e1, entry(e1.chainHash, 'bad.ts', 'keep();\n', 'keep();\nBROKEN(\n', run(true))]);
check('reproducible red syntactic verdict => NOT admissible', redSyntax.admissible === false && redSyntax.reexecFailures === 1 && redSyntax.syntacticProducerUntrustedReexec === 'RED');

const forgedGreen = replayAdmissible([e0, e1, entry(e1.chainHash, 'forged.ts', 'keep();\n', 'keep();\nBROKEN(\n', run(true), undefined, { validation: { language: 'ts', before: 0, after: 0, ok: true } })]);
check('forged green syntactic verdict over broken bytes => NOT admissible', forgedGreen.admissible === false && forgedGreen.reexecFailures === 1);

const redDynamic = replayAdmissible([e0, e1, entry(e1.chainHash, 'gate.ts', '', "const marker = 'DEBT_REGRESSION';\n", run(true))]);
check('reproducible red dynamic registry verdict => NOT admissible', redDynamic.admissible === false && redDynamic.dynamicRegistryFailures === 1 && redDynamic.dynamicRegistryProducerUntrustedReexec === 'RED');

const forgedDynamic = replayAdmissible([e0, e1, entry(e1.chainHash, 'gate.ts', '', "const marker = 'DEBT_REGRESSION';\n", run(true), undefined, { dynamicVerdict: { green: true, reds: [], unjudged: [], ran: ['no-debt-regression'] } })]);
check('forged green dynamic registry verdict over red bytes => NOT admissible', forgedDynamic.admissible === false && forgedDynamic.dynamicRegistryFailures === 1);

const dynamicWithoutSnapshot = replayAdmissible([entry('', 'x.ts', '', 'const x=1;\n', run(true), undefined, { omitReexec: true })]);
check('dynamic registry material without snapshot => NOT admissible', dynamicWithoutSnapshot.admissible === false && dynamicWithoutSnapshot.dynamicRegistryFailures === 1);

check('full built-in registry-lattice re-exec honestly UNJUDGED (not synthesized green)', valid.producerUntrustedReexec === 'UNJUDGED');
console.log('  PASS  syntactic and dynamic-registry producer-untrusted RE-EXEC are replay-admissible evidence when material is present.');
console.log('  UNJUDGED  full built-in registry-lattice RE-EXEC over each snapshot remains residual.');

fs.rmSync(registryRepoRoot, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
