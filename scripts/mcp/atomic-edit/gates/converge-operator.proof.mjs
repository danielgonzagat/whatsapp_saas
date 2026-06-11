#!/usr/bin/env node
/**
 * converge-operator.proof.mjs — standalone node proof for the CONVERGENCE OPERATOR
 * (the gates running BACKWARD: a red overlay → a green fixpoint, or honest needsIntent).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/converge-operator.proof.mjs
 *
 * WHAT THIS PROVES, in BOTH polarities (the falsifier is the same predicate as the
 * pole it falsifies, so no assertion is vacuously true):
 *
 *   GREEN-ALREADY — an overlay that is ALREADY green converges with appliedEdits===0
 *                   and converged===true (the operator does not invent work).
 *   RED→GREEN (binding) — an overlay file that CALLS a Node builtin (`randomUUID()`)
 *                   without importing it is RED on the binding gate; the operator's
 *                   binding proposer prepends `import { randomUUID } from 'node:crypto'`
 *                   and the candidate RE-GATES green ⟹ converged===true, finalReds===0,
 *                   appliedEdits>0, and the accepted-splice trail names the fix.
 *                   FALSIFIER: the residual is empty exactly when converged.
 *   RED→GREEN (connection) — an overlay file with a dangling RELATIVE import whose
 *                   intended basename matches exactly one resolvable sibling on disk:
 *                   the connection proposer retargets the specifier and the candidate
 *                   re-gates green.
 *   UNREPAIRABLE→needsIntent — an overlay file that calls a name that is NEITHER a
 *                   builtin NOR exported by any sibling: NO proposal exists, so the
 *                   operator returns needsIntent===true, converged===false, finalReds>0,
 *                   and the residual red is REPORTED (never guessed away). This is the
 *                   honesty pole: the operator escalates rather than fabricate an edit.
 *   INVARIANT — converged ⟺ finalReds===0 across every case above (and its negation:
 *               a needsIntent result is NEVER reported converged).
 *
 * HONEST CEILING: this proves the operator drives the registry to a GREEN byte
 * fixpoint (ASSEMBLED + CONNECTED) and escalates honestly when it cannot. It does
 * NOT prove the converged module BREATHES at runtime — that is the dynamic gates'
 * / a deploy probe's job. The two proposers cover the mechanical missing-import /
 * dangling-relative classes only; a semantic red is correctly left to intent.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { converge } = await import(path.join(dir, '..', 'dist', 'gates', 'converge-operator.js'));

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// A tiny isolated repo root: keeps reachability's disk walk small + deterministic
// (not capped → it actually decides), and ts-morph (imported by binding-gate.js
// relative to its OWN location) + node: builtins resolve regardless of this root.
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'converge-proof-'));
fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true }); // a real repo-root marker
const cleanup = () => { try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch { /* best effort */ } };

try {
  // ── GREEN-ALREADY — no work to do ──────────────────────────────────────────
  {
    // Every name binds (local const + known global), no relative import → already green.
    // Named *.test.ts so reachability treats it as a ROOT (no orphan red to muddy the test).
    const rel = 'green.test.ts';
    const text = ['export const x = 1;', 'export function go() { return x + 1; }', ''].join('\n');
    const r = await converge(repoRoot, new Map([[rel, text]]));
    check('GREEN-ALREADY converged===true on an already-green overlay', r.converged === true);
    check('GREEN-ALREADY appliedEdits===0 (operator invents no work)', r.appliedEdits === 0);
    check('GREEN-ALREADY finalReds===0', r.finalReds === 0);
    check('GREEN-ALREADY needsIntent===false', r.needsIntent === false);
  }

  // ── RED→GREEN (binding, builtin) — the headline backward run ────────────────
  {
    // `randomUUID` is referenced as a bare call but never imported/declared/global
    // → binding RED. The operator's binding proposer maps it to node:crypto.
    const rel = 'binding.test.ts';
    const text = [
      'export function makeId(): string {',
      '  return randomUUID();', // unbound free reference → binding red
      '}',
      '',
    ].join('\n');
    const r = await converge(repoRoot, new Map([[rel, text]]));
    check('RED→GREEN(binding) converged===true (drove the binding red to green)', r.converged === true);
    check('RED→GREEN(binding) finalReds===0', r.finalReds === 0);
    check('RED→GREEN(binding) appliedEdits>0 (a real splice landed)', r.appliedEdits > 0);
    check('RED→GREEN(binding) needsIntent===false (it was repairable)', r.needsIntent === false);
    check('RED→GREEN(binding) accepted trail names the node:crypto import',
      r.accepted.some((a) => a.includes("node:crypto") && a.includes('randomUUID')));
    // FALSIFIER: a converged result reports an EMPTY residual (never a guessed-away red).
    check('RED→GREEN(binding) residual is empty exactly when converged', r.converged === (r.residual.length === 0));
  }

  // ── RED→GREEN (connection) — retarget a unique resolvable sibling ───────────
  {
    // A real sibling `lib.ts` exists on disk; the overlay file imports the WRONG path
    // './nested/lib' (dangling) — the connection proposer retargets it to the unique
    // resolvable sibling './lib.js' and the candidate re-gates green.
    fs.writeFileSync(path.join(repoRoot, 'lib.ts'), 'export const helper = 1;\n');
    const rel = 'conn.test.ts';
    const text = [
      "import { helper } from './nested/lib';", // ./nested/lib dangles (no nested dir)
      'export const v = helper + 1;',
      '',
    ].join('\n');
    const r = await converge(repoRoot, new Map([[rel, text]]));
    check('RED→GREEN(connection) converged===true (retargeted the dangling relative import)', r.converged === true);
    check('RED→GREEN(connection) finalReds===0', r.finalReds === 0);
    check('RED→GREEN(connection) appliedEdits>0', r.appliedEdits > 0);
    check('RED→GREEN(connection) accepted trail names the retarget to ./lib.js',
      r.accepted.some((a) => a.includes('retarget') && a.includes('./lib.js')));
  }

  // ── UNREPAIRABLE → needsIntent — the honesty pole ───────────────────────────
  {
    // `totallyMadeUpSymbolXYZ` is neither a builtin nor exported by any sibling
    // (the deep dir has no other files) → NO proposal exists → honest escalation.
    fs.mkdirSync(path.join(repoRoot, 'lonely'), { recursive: true });
    const rel = 'lonely/intent.test.ts';
    const text = [
      'export function go() {',
      '  return totallyMadeUpSymbolXYZ();', // unbound, unrepairable
      '}',
      '',
    ].join('\n');
    const r = await converge(repoRoot, new Map([[rel, text]]));
    check('needsIntent converged===false (could NOT drive to green)', r.converged === false);
    check('needsIntent needsIntent===true (honest escalation, not a guessed edit)', r.needsIntent === true);
    check('needsIntent finalReds>0 (a real red survived)', r.finalReds > 0);
    check('needsIntent appliedEdits===0 (no splice was fabricated)', r.appliedEdits === 0);
    check('needsIntent residual REPORTS the surviving binding red (never guessed away)',
      r.residual.some((rd) => rd.gate === 'binding' && rd.fact.includes('totallyMadeUpSymbolXYZ')));
    // FALSIFIER: a needsIntent result is NEVER reported converged.
    check('needsIntent is NEVER reported converged (invariant)', !(r.converged && r.needsIntent));

  // ── FORMAT (opt-in format-fixpoint) — wire-green but non-canonical ──────────
  {
    // *.test.ts → reachability treats it as a ROOT (no orphan red), so it is wire-green
    // but deliberately NOT prettier-canonical. format:true must drain the formatting
    // WITHOUT changing the wire facts (converged / finalReds / appliedEdits).
    const frel = 'format.test.ts';
    const ugly = 'export  const   y=1\nexport function f(){return y+1}\n';
    const def = await converge(repoRoot, new Map([[frel, ugly]]));
    check('FORMAT default path is opt-in (formatEdits===0, wire-green, no work invented)',
      def.formatEdits === 0 && def.converged === true && def.appliedEdits === 0);
    const fmt = await converge(repoRoot, new Map([[frel, ugly]]), { format: true });
    check('FORMAT format:true preserves wire facts (converged, finalReds===0, appliedEdits===0)',
      fmt.converged === true && fmt.finalReds === 0 && fmt.appliedEdits === 0);
    check('FORMAT format:true drains formatting (formatEdits>0, rationale recorded)',
      fmt.formatEdits > 0 && fmt.formatted.length > 0);
  }
  }
} finally {
  cleanup();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
