#!/usr/bin/env node
/**
 * strict-admission.proof.mjs -- Y admission law proof.
 *
 * Run:
 *   node scripts/mcp/atomic-edit/build.mjs
 *   node scripts/mcp/atomic-edit/gates/strict-admission.proof.mjs
 *
 * This is the core Y invariant: a persistent mutation is admitted only when
 * every applicable gate is positively green. UNJUDGED is honest, but it is not
 * approval. In strict admission it must block the commit and explain which gate
 * needs more evidence.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..', '..', '..', '..');
const R = await import(path.join(dir, '..', 'dist', 'gates', 'registry.js'));
const C = await import(path.join(dir, '..', 'dist', 'server-helpers-converge.js'));

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
    if (detail) console.log(`         ${detail}`);
  }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-strict-admission-'));
try {
  const unjudgedGate = {
    name: 'demo-unjudged',
    kind: 'static',
    appliesTo: (rel) => rel.endsWith('.ts'),
    run: () => ({ gate: 'demo-unjudged', green: true, reds: [], unjudged: true, note: 'cannot decide' }),
  };
  const redGate = {
    name: 'demo-red',
    kind: 'static',
    appliesTo: (rel) => rel.endsWith('.ts'),
    run: () => ({
      gate: 'demo-red',
      green: false,
      reds: [{ file: 'a.ts', locus: '1:1', fact: 'known red' }],
      note: 'red for polarity',
    }),
  };
  const greenGate = {
    name: 'demo-green',
    kind: 'static',
    appliesTo: (rel) => rel.endsWith('.ts'),
    run: () => ({ gate: 'demo-green', green: true, reds: [], note: 'green' }),
  };
  const notApplicableGate = {
    name: 'demo-not-applicable',
    kind: 'static',
    appliesTo: (rel) => rel.endsWith('.ts'),
    run: () => ({ gate: 'demo-not-applicable', green: true, reds: [], notApplicable: true, note: 'no fact in this file' }),
  };

  const overlay = new Map([['a.ts', 'export const a = 1;\n']]);
  const permissive = await R.runGates([unjudgedGate], tmp, overlay, ['a.ts']);
  check('BASELINE permissive registry records unjudged without red', permissive.green === true && permissive.unjudged.includes('demo-unjudged'));

  const strictUnjudged = await R.runGates([unjudgedGate], tmp, overlay, ['a.ts'], false, 'strict');
  check(
    'STRICT registry blocks UNJUDGED as non-green',
    strictUnjudged.green === false && strictUnjudged.unjudged.includes('demo-unjudged'),
    JSON.stringify(strictUnjudged),
  );

  const strictGreen = await R.runGates([greenGate], tmp, overlay, ['a.ts'], false, 'strict');
  check('STRICT registry allows fully judged GREEN', strictGreen.green === true && strictGreen.unjudged.length === 0 && strictGreen.reds.length === 0, JSON.stringify(strictGreen));

  const strictNotApplicable = await R.runGates([notApplicableGate], tmp, overlay, ['a.ts'], false, 'strict');
  check(
    'STRICT registry allows explicit NOT_APPLICABLE without treating it as unjudged',
    strictNotApplicable.green === true &&
      strictNotApplicable.reds.length === 0 &&
      strictNotApplicable.unjudged.length === 0 &&
      Array.isArray(strictNotApplicable.notApplicable) &&
      strictNotApplicable.notApplicable.includes('demo-not-applicable'),
    JSON.stringify(strictNotApplicable),
  );

  const strictRed = await R.runGates([redGate], tmp, overlay, ['a.ts'], false, 'strict');
  check('STRICT registry still blocks concrete RED', strictRed.green === false && strictRed.reds.length === 1, JSON.stringify(strictRed));

  // A TS file in a temp root with no tsconfig makes the type-soundness write gate
  // honestly UNJUDGED. Under Y, convergeStatic must not call that green.
  const conv = await C.convergeStatic(tmp, [{ file: 'a.ts', newText: 'export const x: number = 1;\n' }]);
  check('STRICT convergeStatic refuses an applicable unjudged gate', conv.converged === false && conv.firstRed && /UNJUDGED|unjudged/i.test(JSON.stringify(conv.firstRed)), JSON.stringify(conv));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
