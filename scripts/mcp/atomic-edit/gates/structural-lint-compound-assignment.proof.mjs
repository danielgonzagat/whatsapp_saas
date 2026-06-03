#!/usr/bin/env node
/**
 * structural-lint-compound-assignment.proof.mjs
 *
 * Proves prefer-const treats compound assignments as reassignments. A `let`
 * binding mutated by `+=` is not byte-negative prefer-const debt; rewriting it to
 * const would break runtime semantics.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'structural-lint-gate.js'))).default;

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
  }
}

const overlay = new Map(Object.entries({
  'compound.ts': 'let total = 0;\ntotal += 1;\nexport const x = total;\n',
}));
const res = await gate.run(makeContext(dir, overlay, ['compound.ts']));
const falsePreferConst = res.reds.some((red) =>
  red.fact.includes('prefer-const') && red.fact.includes("'total'"),
);

check('compound assignment is judged source, not unjudged', res.unjudged !== true);
check('compound assignment does not emit false prefer-const', !falsePreferConst);
check('compound assignment case is green', res.green === true && res.reds.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
