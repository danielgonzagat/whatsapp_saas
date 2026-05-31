#!/usr/bin/env node
/**
 * reexport-symbol-gate.proof.mjs — standalone node proof for the RE-EXPORT-SYMBOL gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/reexport-symbol-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory over a throwaway temp dir; no repo
 * source is ever written. The gate's decider is in-process ts-morph (resolved by
 * walk-up from the atomic-edit dir, exactly as binding-gate relies on), so the proof
 * runs from inside the repo where ts-morph resolves.
 *
 * It proves the gate in BOTH polarities plus the honesty (UNJUDGED) properties the
 * doctrine demands — the Rice line where named re-export resolution stops being
 * decidable from a single resolved target:
 *
 *   RED      — `export { Missing } from './m'` where ./m does NOT export Missing.
 *   GREEN    — `export { Foo } from './m'` (and `Foo as Bar`, `default as D`) that
 *              DO resolve to real exports of ./m.
 *   DELTA    — a re-export already dangling in the prior bytes is tolerated (NEW-only);
 *              a write that INTRODUCES a fresh dangle is reddened.
 *   UNJUDGED — `export * from './m'` (namespace re-export, not a single-name fact);
 *              a miss against a target that itself carries `export *` (the name may
 *              arrive transitively); an unresolvable target. None of these red-by-guess.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'reexport-symbol-gate.js'))).default;

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

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-reexport-gate-'));
}
function write(d, rel, text) {
  const abs = path.join(d, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}
/** Judge with an explicit overlay (write/lens both flow through makeContext). */
async function judge(repoRoot, overlay, changed, lensMode = false) {
  return gate.run(makeContext(repoRoot, new Map(Object.entries(overlay)), changed, lensMode));
}

// 1) RED — a WRITE that introduces a re-export of a name the target does not
//    export. The dangle must be a NEW claim (prior on disk is clean), since the
//    gate is NEW-only by construction: a dangle present in BOTH prior and now is
//    legacy debt, not this write's fault (proven separately in case 4a). Here the
//    prior barrel re-exports only Foo; the overlay ADDS the dangling `Missing`.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\nexport function Bar() {}\n');
  write(d, 'barrel.ts', "export { Foo } from './m';\n"); // prior: clean
  const res = await judge(d, { 'barrel.ts': "export { Foo, Missing } from './m';\n" }, ['barrel.ts']);
  check(
    'RED: re-exports Missing not exported by ./m reddens',
    res.green === false &&
      !res.unjudged &&
      res.reds.some((r) => r.fact.includes("re-exports 'Missing' not exported")),
  );
  check(
    'RED: only the dangling name reds (Foo stays green)',
    res.reds.length === 1 && res.reds[0].fact.includes("'Missing'"),
  );
  check('RED: red carries an L<line>:<col> locus', /^L\d+:\d+$/.test(res.reds[0]?.locus || ''));
  fs.rmSync(d, { recursive: true, force: true });
}

// 2) GREEN — every re-exported name (incl. alias + `default as D`) is a real export.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\nexport function Bar() {}\nexport default 5;\n');
  write(
    d,
    'barrel.ts',
    "export { Foo, Bar as Renamed } from './m';\nexport { default as D } from './m';\n",
  );
  const res = await judge(d, {}, ['barrel.ts']);
  check(
    'GREEN: Foo + (Bar as Renamed) + (default as D) all resolve → green',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 3) GREEN — type re-export of a real type export.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export type T = number;\nexport interface I { x: number }\n');
  write(d, 'barrel.ts', "export type { T, I } from './m';\n");
  const res = await judge(d, {}, ['barrel.ts']);
  check('GREEN: type re-export of real type exports → green', res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 4a) DELTA — a re-export ALREADY dangling on disk is not re-judged (NEW-only).
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\n');
  // prior on disk already dangles on Missing:
  write(d, 'barrel.ts', "export { Foo, Missing } from './m';\n");
  // overlay keeps the SAME dangling re-export and only adds a comment (no new claim):
  const res = await judge(
    d,
    { 'barrel.ts': "// touched\nexport { Foo, Missing } from './m';\n" },
    ['barrel.ts'],
  );
  check(
    'DELTA: pre-existing dangling re-export tolerated (NEW-only → green)',
    res.green === true && res.reds.length === 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 4b) DELTA — a write that INTRODUCES a fresh dangle IS reddened (prior was clean).
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\n');
  write(d, 'barrel.ts', "export { Foo } from './m';\n"); // prior: clean
  const res = await judge(d, { 'barrel.ts': "export { Foo, JustAdded } from './m';\n" }, ['barrel.ts']);
  check(
    'DELTA: newly-introduced dangling re-export reds (and only the new one)',
    res.green === false && res.reds.length === 1 && res.reds[0].fact.includes("'JustAdded'"),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 5) UNJUDGED — namespace re-export (`export *`) is not a decidable single-name fact.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\n');
  write(d, 'barrel.ts', "export * from './m';\n"); // only a star — nothing named to judge
  const res = await judge(d, {}, ['barrel.ts']);
  check(
    'UNJUDGED: lone `export *` → unjudged (not red-by-guess, not green-by-assumption)',
    res.unjudged === true && res.green === true && res.reds.length === 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 6) UNJUDGED — a miss against a target that itself carries `export *` (transitive).
{
  const d = mkTmp();
  // ./m directly exports Direct, and re-exports more via `export * from './n'`.
  // ./n is not enumerable from m's bytes alone, so a name not found directly MAY
  // arrive through the star → the gate must NOT redden it.
  write(d, 'm.ts', "export const Direct = 1;\nexport * from './n';\n");
  write(d, 'n.ts', 'export const Maybe = 2;\n');
  write(d, 'barrel.ts', "export { Maybe } from './m';\n");
  const res = await judge(d, {}, ['barrel.ts']);
  check(
    'UNJUDGED: miss against a star-bearing target → unjudged (name may be transitive), never red',
    res.unjudged === true && res.green === true && res.reds.length === 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 7) UNJUDGED/SKIP — unresolvable relative target is not our fact (connection-gate's).
{
  const d = mkTmp();
  write(d, 'barrel.ts', "export { Foo } from './does-not-exist';\n"); // resolveRelImport → null
  const res = await judge(d, {}, ['barrel.ts']);
  check(
    'UNJUDGED: unresolvable target skipped → unjudged (module half is connection-gate / supply-chain)',
    res.unjudged === true && res.green === true && res.reds.length === 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 8) GREEN — bare specifier (`from 'pkg'`) is the supply-chain gate's fact, not ours;
//    combined with a real resolvable green re-export, the file is decided green.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\n');
  write(d, 'barrel.ts', "export { something } from 'some-package';\nexport { Foo } from './m';\n");
  const res = await judge(d, {}, ['barrel.ts']);
  check(
    'GREEN: bare re-export skipped (not ours); the resolvable one is decided green',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 9) LENS — absolute mode (priorOf → ''): a committed dangling re-export reds with no prior.
{
  const d = mkTmp();
  write(d, 'm.ts', 'export const Foo = 1;\n');
  write(d, 'barrel.ts', "export { Foo, Gone } from './m';\n");
  // lensMode=true, empty overlay → gate reads committed bytes and judges absolutely.
  const res = await judge(d, {}, ['barrel.ts'], true);
  check(
    'LENS: committed dangling re-export reds absolutely (priorOf → no prior)',
    res.green === false && res.reds.some((r) => r.fact.includes("'Gone'")),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
