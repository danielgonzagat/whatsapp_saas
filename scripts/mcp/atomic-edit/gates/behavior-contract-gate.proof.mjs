#!/usr/bin/env node
/**
 * behavior-contract-gate.proof.mjs — standalone node proof for the BEHAVIOR-CONTRACT gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/behavior-contract-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every case is a throwaway temp project: the PRIOR bytes live on disk
 * (read via ctx.priorOf), the NEW bytes are the overlay (read via ctx.readFile). No
 * repo source is ever written. It proves the gate in all four polarities the doctrine
 * demands:
 *
 *   GREEN     — a write that PRESERVES the fn's prior observed behavior passes.
 *   RED       — a write that SILENTLY changes the fn's behavior (no co-committed
 *               @behavior-change-approved) is refused, with the divergent input as fact.
 *   GREEN     — the SAME behavioral change, but co-committing @behavior-change-approved,
 *               passes (intent and implementation move together — the novel shape).
 *   UNJUDGED  — a NEW fn (no prior export) and a NON-DETERMINISTIC fn both bail honestly,
 *               never red-by-guess, never green-by-assumption.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'behavior-contract-gate.js'))).default;

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-behavior-gate-'));
}
async function judge(repoRoot, priorDisk, newOverlay, rel) {
  fs.writeFileSync(path.join(repoRoot, rel), priorDisk); // PRIOR bytes on disk → ctx.priorOf
  return gate.run(makeContext(repoRoot, new Map([[rel, newOverlay]]), [rel])); // NEW bytes in overlay
}

// 1) GREEN — behavior preserved (same map over K inputs; new is only reformatted).
{
  const d = mkTmp();
  const prior = 'export function f(x){ return x + 1; }\n';
  const next = '// @behavior-contract fn=f gen=int\nexport function f(x) {\n  return x + 1;\n}\n';
  const res = await judge(d, prior, next, 'a.mjs');
  check('GREEN: preserved behavior passes', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// 2) RED — behavior silently changed (x+1 → x+2), no approval directive.
{
  const d = mkTmp();
  const prior = 'export function f(x){ return x + 1; }\n';
  const next = '// @behavior-contract fn=f gen=int\nexport function f(x){ return x + 2; }\n';
  const res = await judge(d, prior, next, 'a.mjs');
  check('RED: silent behavioral change reddens', res.green === false && !res.unjudged && res.reds.length === 1);
  check('RED: red carries fn locus + divergence fact', !!res.reds[0] && res.reds[0].locus === 'f' && /behavioral contract of 'f' CHANGED/.test(res.reds[0].fact));
  fs.rmSync(d, { recursive: true, force: true });
}

// 3) GREEN — the SAME change, but co-committing the intent update, passes.
{
  const d = mkTmp();
  const prior = 'export function f(x){ return x + 1; }\n';
  const next = '// @behavior-contract fn=f gen=int\n// @behavior-change-approved fn=f\nexport function f(x){ return x + 2; }\n';
  const res = await judge(d, prior, next, 'a.mjs');
  check('GREEN: approved behavioral change passes', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// 4) UNJUDGED — a NEW fn (no prior export) cannot regress its own behavior.
{
  const d = mkTmp();
  const prior = 'export function g(x){ return x; }\n'; // no f in prior
  const next = '// @behavior-contract fn=f gen=int\nexport function f(x){ return x + 1; }\nexport function g(x){ return x; }\n';
  const res = await judge(d, prior, next, 'a.mjs');
  check('UNJUDGED: new fn (no prior) bails honestly', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 5) UNJUDGED — a non-deterministic fn makes the comparison ill-posed.
{
  const d = mkTmp();
  const prior = 'export function r(x){ return x + Math.random(); }\n';
  const next = '// @behavior-contract fn=r gen=int\nexport function r(x){ return x + Math.random(); }\n';
  const res = await judge(d, prior, next, 'a.mjs');
  check('UNJUDGED: non-deterministic fn bails (never red-by-guess)', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
