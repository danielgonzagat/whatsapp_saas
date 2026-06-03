#!/usr/bin/env node
/**
 * type-soundness-gate.proof.mjs — standalone node proof for the TYPE-SOUNDNESS gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/type-soundness-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory over a throwaway temp project; no repo
 * source is ever written. It proves the gate in BOTH polarities plus the two honesty
 * properties the doctrine demands:
 *
 *   RED      — an overlay edit that introduces a NEW type error is refused.
 *   GREEN    — a type-valid overlay edit passes.
 *   DELTA    — a pre-existing type error is tolerated (no regression → no red).
 *   UNJUDGED — no tsconfig bails honestly rather than red-by-guess.
 *   WIDE     — a wide lens-shaped change set is still judged and can produce RED.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'type-soundness-gate.js')))
  .default;

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-type-gate-'));
}
function writeTsconfig(d, opts) {
  fs.writeFileSync(
    path.join(d, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, ...(opts || {}) } }),
  );
}
async function judge(repoRoot, overlay, changed) {
  return gate.run(makeContext(repoRoot, new Map(Object.entries(overlay)), changed));
}
// Lens-shaped judgement: committed bytes, no prior (priorOf === ''), absolute.
// This is exactly the shape that surfaced the `process` TS2591 false positive.
async function judgeLens(repoRoot, overlay, changed) {
  return gate.run(makeContext(repoRoot, new Map(Object.entries(overlay)), changed, true));
}
// Scaffold a minimal `@types/node` into a tmp project's type root so the gate's
// ambient-type discovery can find it — mirrors a real project's node typings.
function writeNodeTypes(d) {
  const td = path.join(d, 'node_modules', '@types', 'node');
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(
    path.join(td, 'package.json'),
    JSON.stringify({ name: '@types/node', version: '0.0.0', types: 'index.d.ts' }),
  );
  fs.writeFileSync(
    path.join(td, 'index.d.ts'),
    'declare var process: { env: { [k: string]: string | undefined } };\n',
  );
}
// Scaffold an arbitrary `@types/<name>` package declaring a global ambient symbol.
// Used to prove type-ROOT anchoring: the package exists ONLY in the tmp project's
// node_modules/@types, never in the gate process's cwd, so the global resolves iff
// the gate anchors type-root resolution on the tsconfig dir (not cwd).
function writeTypesPkg(d, name, body) {
  const td = path.join(d, 'node_modules', '@types', name);
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(
    path.join(td, 'package.json'),
    JSON.stringify({ name: `@types/${name}`, version: '0.0.0', types: 'index.d.ts' }),
  );
  fs.writeFileSync(path.join(td, 'index.d.ts'), body);
}

// 1) RED — overlay introduces a NEW type error vs a valid prior on disk.
{
  const d = mkTmp();
  writeTsconfig(d);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const x: number = "oops";\n' }, ['a.ts']);
  check(
    'RED: new TS2322 reddens',
    res.green === false && !res.unjudged && res.reds.some((r) => r.fact.includes('TS2322')),
  );
  check(
    'RED: red carries an L<line>:<col> locus',
    !!res.reds[0] && /^L\d+:\d+$/.test(res.reds[0].locus || ''),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 2) GREEN — a type-valid overlay edit passes (fast path, no second compile).
{
  const d = mkTmp();
  writeTsconfig(d);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const x: number = 2;\n' }, ['a.ts']);
  check('GREEN: valid edit passes', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// 3) DELTA — a pre-existing type error is tolerated (count unchanged → no regression).
{
  const d = mkTmp();
  writeTsconfig(d);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = "bad";\n'); // prior already errors
  const res = await judge(d, { 'a.ts': 'export const x: number = "bad2";\n' }, ['a.ts']); // still exactly 1 error
  check(
    'DELTA: pre-existing type error tolerated',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 4) UNJUDGED — no tsconfig from the changed file up to repoRoot.
{
  const d = mkTmp(); // no tsconfig written
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const x: number = "oops";\n' }, ['a.ts']);
  check(
    'UNJUDGED: no tsconfig → unjudged (never red-by-guess)',
    res.unjudged === true && res.green === true && res.reds.length === 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 5) WIDE — a lens-shaped change set above the old 8-file ceiling is judged.
{
  const d = mkTmp();
  writeTsconfig(d);
  const overlay = {};
  const changed = [];
  for (let i = 0; i < 12; i += 1) {
    const f = `f${i}.ts`;
    fs.writeFileSync(path.join(d, f), 'export const y: number = 1;\n');
    overlay[f] = 'export const y: number = "x";\n';
    changed.push(f);
  }
  const res = await judge(d, overlay, changed);
  check('WIDE: >8 files are judged, not unjudged', res.unjudged !== true);
  check(
    'WIDE: broad type regressions still produce RED',
    res.green === false && res.reds.length > 0,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 6) FP-CLASS FIXED — a new file using `process.env` is GREEN when the project's
//    ambient @types/node is discoverable. This is the exact false-positive class
//    (TS2591 "Cannot find name 'process'") that the lens reported on real frontend
//    code: TS ≥6.0 dropped implicit @types inclusion, so single-file rooting falsely
//    reddened a global the real build resolves. The gate now mirrors the project's
//    ambient @types and must not red it.
{
  const d = mkTmp();
  writeTsconfig(d); // no `types` field → relies on discovery, like next.js tsconfig
  writeNodeTypes(d);
  const res = await judge(
    d,
    { 'uses-process.ts': 'export const u = process.env.NEXT_PUBLIC_X ?? "";\n' },
    ['uses-process.ts'],
  );
  check(
    'FP-FIXED: process.env resolves GREEN when @types/node is discoverable',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  // Same shape in the LENS direction (committed bytes, absolute) — where the FP lived.
  fs.writeFileSync(
    path.join(d, 'uses-process.ts'),
    'export const u = process.env.NEXT_PUBLIC_X ?? "";\n',
  );
  const resLens = await judgeLens(d, {}, ['uses-process.ts']);
  check(
    'FP-FIXED: lens-mode process.env is GREEN (no TS2591)',
    resLens.green === true && resLens.reds.length === 0 && !resLens.unjudged,
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 7) NOT VACUOUS — the ambient-type inclusion must not blanket-suppress real errors.
//    A new file that resolves `process` AND has a genuine TS2322 still reds, on TS2322.
{
  const d = mkTmp();
  writeTsconfig(d);
  writeNodeTypes(d);
  const src = 'export const u = process.env.X ?? "";\nexport const n: number = "oops";\n';
  const res = await judge(d, { 'mixed.ts': src }, ['mixed.ts']);
  check(
    'NOT-VACUOUS: genuine TS2322 still reds even though process resolves',
    res.green === false && res.reds.some((r) => r.fact.includes('TS2322')),
  );
  check(
    'NOT-VACUOUS: the false TS2591 is NOT among the reds',
    !res.reds.some((r) => r.fact.includes('TS2591')),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 8) EARNED, NOT BLANKET — when the project genuinely has NO @types/node, a file
//    using `process` honestly reds (TS2591), exactly as the real compiler would.
//    This proves case 6's GREEN is caused by the discovered ambient types, not by
//    the gate having simply stopped reporting `process` — soundness, not blindness.
{
  const d = mkTmp();
  writeTsconfig(d); // NO writeNodeTypes — no node typings anywhere up-tree
  const res = await judge(d, { 'uses-process.ts': 'export const u = process.env.X;\n' }, [
    'uses-process.ts',
  ]);
  check(
    'EARNED: process honestly reds (TS2591) when no @types/node exists',
    res.green === false && res.reds.some((r) => r.fact.includes('TS2591')),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 9) TYPE-ROOT ANCHORING — an explicitly listed `types: ["proj"]` that lives in the
//    PROJECT's node_modules/@types (not the gate process's cwd) must resolve. This is
//    the backend-monorepo class: `tsconfig.json` lists `types:["node","jest"]` but
//    @types/jest sits in `backend/node_modules`, so every spec falsely reds `jest`
//    /`describe` until type-root resolution is anchored on the tsconfig directory.
{
  const d = mkTmp();
  writeTsconfig(d, { types: ['proj'] });
  writeTypesPkg(d, 'proj', 'declare const __PROJ_GLOBAL__: number;\n');
  const res = await judge(d, { 'u.ts': 'export const x: number = __PROJ_GLOBAL__;\n' }, ['u.ts']);
  check(
    'TYPEROOT: explicit project-local @types resolves (anchored on tsconfig dir)',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  // Not vacuous: a genuine error in the same file still reds.
  const bad = await judge(d, { 'u.ts': 'export const x: string = __PROJ_GLOBAL__;\n' }, ['u.ts']);
  check(
    'TYPEROOT: genuine TS2322 still reds with the global resolved',
    bad.green === false && bad.reds.some((r) => r.fact.includes('TS2322')),
  );
  fs.rmSync(d, { recursive: true, force: true });
}

// 10) AMBIENT .d.ts — a global augmentation declared in an ambient `.d.ts` the
//     tsconfig includes (but the changed file does not import) must resolve. This is
//     the `window.google`/`declare global` class: the bounded single-file program
//     would miss it and red the global; rooting the project's ambient .d.ts fixes it.
{
  const d = mkTmp();
  writeTsconfig(d);
  fs.writeFileSync(path.join(d, 'globals.d.ts'), 'declare const __AMBIENT_AUG__: number;\n');
  const res = await judge(d, { 'consumer.ts': 'export const x: number = __AMBIENT_AUG__;\n' }, [
    'consumer.ts',
  ]);
  check(
    'AMBIENT: a global from an ambient .d.ts resolves (rooted alongside changed files)',
    res.green === true && res.reds.length === 0 && !res.unjudged,
  );
  // Earned, not blanket: with NO ambient .d.ts the same global honestly reds.
  const d2 = mkTmp();
  writeTsconfig(d2);
  const res2 = await judge(d2, { 'consumer.ts': 'export const x: number = __AMBIENT_AUG__;\n' }, [
    'consumer.ts',
  ]);
  check(
    'AMBIENT: the global honestly reds when no ambient .d.ts declares it',
    res2.green === false && res2.reds.some((r) => r.fact.includes('Cannot find name')),
  );
  fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(d2, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
