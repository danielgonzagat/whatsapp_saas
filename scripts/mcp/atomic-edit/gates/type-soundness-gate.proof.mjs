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
 *   UNJUDGED — no tsconfig, and a too-broad (lens-shaped) change set, both bail
 *              honestly rather than red-by-guess or green-by-assumption.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'type-soundness-gate.js'))).default;

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

// 1) RED — overlay introduces a NEW type error vs a valid prior on disk.
{
  const d = mkTmp();
  writeTsconfig(d);
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const x: number = "oops";\n' }, ['a.ts']);
  check('RED: new TS2322 reddens', res.green === false && !res.unjudged && res.reds.some((r) => r.fact.includes('TS2322')));
  check('RED: red carries an L<line>:<col> locus', !!res.reds[0] && /^L\d+:\d+$/.test(res.reds[0].locus || ''));
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
  check('DELTA: pre-existing type error tolerated', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// 4) UNJUDGED — no tsconfig from the changed file up to repoRoot.
{
  const d = mkTmp(); // no tsconfig written
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x: number = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const x: number = "oops";\n' }, ['a.ts']);
  check('UNJUDGED: no tsconfig → unjudged (never red-by-guess)', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 5) UNJUDGED — a too-broad change set (the whole-repo READ-lens shape) bails.
{
  const d = mkTmp();
  writeTsconfig(d);
  const overlay = {};
  const changed = [];
  for (let i = 0; i < 12; i += 1) {
    const f = `f${i}.ts`;
    fs.writeFileSync(path.join(d, f), 'export const y = 1;\n');
    overlay[f] = 'export const y: number = "x";\n';
    changed.push(f);
  }
  const res = await judge(d, overlay, changed);
  check('UNJUDGED: >MAX_CHANGED files → unjudged (lens bail)', res.unjudged === true && res.green === true);
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
