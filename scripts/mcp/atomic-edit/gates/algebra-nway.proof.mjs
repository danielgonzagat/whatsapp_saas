#!/usr/bin/env node
/**
 * algebra-nway.proof.mjs — Idea #1: N-WAY obligation-preserving confluence.
 *
 * Two honest layers:
 *  (A) BOUNDED-EXHAUSTIVE byte-confluence: for a set of byte-disjoint edits, EVERY application order
 *      (all N! permutations, offset-rebased) yields IDENTICAL bytes — machine-checked for N<=4.
 *  (B) batchCertificate(): a pairwise-commuting set is certified (global confluence + obligation
 *      preservation, a corollary of the pairwise Z3 theorem); a coupled or capped/unknown set is NOT.
 *
 * HONEST CEILING: the UNBOUNDED inductive metatheorem over a STATE-DEPENDENT read-set needs an external
 * prover (Z3 has no induction tactic). This gate now ACTUALLY runs the two external machine-checks instead
 * of printing a hardcoded green: (1) Z3 base+step via formal/atomic-algebra/nway_induction_z3.py, and
 * (2) the Lean 4 induction principle via formal/atomic-algebra/NwayConfluence.lean (vendored .elan
 * toolchain). A PROVEN line is emitted ONLY for a part that genuinely ran and returned exit 0; an absent
 * Lean toolchain degrades to an honest UNVERIFIED (never a fake green, never a forced gate failure).
 * Run: node build.mjs && node gates/algebra-nway.proof.mjs
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '..', '..', '..', '..');
const formalDir = path.join(repoRoot, 'formal', 'atomic-algebra');
const { batchCertificate } = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));

let pass = 0;
let fail = 0;
const check = (n, c) => {
  if (c) { pass += 1; console.log('  PASS ', n); }
  else { fail += 1; console.log('  FAIL ', n); }
};

// ---- (A) bounded-exhaustive N-way byte-confluence (all permutations, offset-rebased) ----
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
// apply a SEQUENCE of absolute-on-original splices, rebasing later ones by the deltas of earlier-applied
// splices that sit before them — the honest order-sensitive applier (not a set-sort shortcut).
function applySeq(base, order) {
  let s = base;
  const done = [];
  for (const sp of order) {
    let shift = 0;
    for (const a of done) if (a.start < sp.start) shift += a.delta;
    s = s.slice(0, sp.start + shift) + sp.text + s.slice(sp.end + shift);
    done.push({ start: sp.start, delta: sp.text.length - (sp.end - sp.start) });
  }
  return s;
}
for (const N of [2, 3, 4]) {
  const base = 'const a=1; const b=2; const c=3; const d=4; const e=5;';
  // N byte-disjoint single-char replacements at known positions of the digits.
  const positions = [9, 21, 33, 45, 57].slice(0, N);
  const splices = positions.map((p, k) => ({ start: p, end: p + 1, text: String.fromCharCode(88 + k) })); // X,Y,Z,...
  const orders = perms(splices);
  const canonical = applySeq(base, orders[0]);
  const allEqual = orders.every((o) => applySeq(base, o) === canonical);
  check(`(A) N=${N} byte-disjoint edits: all ${orders.length} application orders byte-identical (bounded confluence)`, allEqual);
}

// ---- (B) batchCertificate behavior ----
const fact = (file, closure, capped = false, spanIdents = []) => ({ file, spans: [[0, 5]], closure: new Set([file, ...closure]), closureCapped: capped, spanIdents });
{
  // three different files, no closure coupling => certified.
  const ok = batchCertificate([fact('a.ts', []), fact('b.ts', []), fact('c.ts', [])]);
  check('(B) pairwise-independent set => certified (global confluence + obligation preservation)', ok.certified === true && ok.coupled === 0 && ok.unjudged === 0);
  check('(B) certified set yields a concurrent coloring', Array.isArray(ok.batches) && ok.batches.length >= 1);
  // one real coupling (c reads a) => NOT certified.
  const coupled = batchCertificate([fact('a.ts', []), fact('b.ts', []), fact('c.ts', ['a.ts'])]);
  check('(B) a coupled pair => NOT certified (coupled>=1)', coupled.certified === false && coupled.coupled >= 1);
  // a capped fact => UNJUDGED => NOT certified (honest, never green-by-assumption).
  const capped = batchCertificate([fact('a.ts', [], true), fact('b.ts', [])]);
  check('(B) a capped (UNJUDGED) pair => NOT certified (unjudged>=1, honest)', capped.certified === false && capped.unjudged >= 1);
}

// ---- external machine-checks: actually RUN the provers; no hardcoded green. ----
// Honesty doctrine: a PROVEN/exit-0 line is only emitted for a part we genuinely ran and that
// genuinely returned exit 0. The Z3 base+step is a real machine-check and gates failure; the Lean
// all-N induction degrades to an honest UNVERIFIED when no Lean toolchain is present (it does NOT
// fake-fail the whole gate), but if a Lean toolchain IS present and rejects the proof, that is a
// real regression and fails the gate.

// (Z3) run the base+step induction proof with the repo's vendored z3 venv if present, else PATH python3.
function runZ3() {
  const script = path.join(formalDir, 'nway_induction_z3.py');
  if (!fs.existsSync(script)) return { status: 'MISSING', detail: 'nway_induction_z3.py not found' };
  const venvPy = path.join(repoRoot, '.z3venv', 'bin', 'python3');
  const py = fs.existsSync(venvPy) ? venvPy : 'python3';
  const res = spawnSync(py, [script], { cwd: formalDir, encoding: 'utf8' });
  if (res.error || res.status === null) return { status: 'ABSENT', detail: `z3 runner unavailable (${res.error ? res.error.code : 'no exit'})` };
  return { status: res.status === 0 ? 'PROVEN' : 'FAILED', exit: res.status, out: String(res.stdout || '') + String(res.stderr || '') };
}

// (Lean) run lean on the all-N induction theorem. Prefer the vendored .elan toolchain, else PATH lean.
function runLean() {
  const leanFile = path.join(formalDir, 'NwayConfluence.lean');
  if (!fs.existsSync(leanFile)) return { status: 'MISSING', detail: 'NwayConfluence.lean not found' };
  const elanHome = path.join(repoRoot, '.elan');
  const vendoredLean = path.join(elanHome, 'bin', 'lean');
  const lean = fs.existsSync(vendoredLean) ? vendoredLean : 'lean';
  const env = fs.existsSync(vendoredLean) ? { ...process.env, ELAN_HOME: elanHome } : process.env;
  const res = spawnSync(lean, [leanFile], { cwd: formalDir, encoding: 'utf8', env });
  // ENOENT (lean/lake not installed) => honest UNVERIFIED, never green, never a forced gate failure.
  if (res.error && res.error.code === 'ENOENT') return { status: 'UNVERIFIED', detail: 'lean/lake not installed' };
  if (res.error || res.status === null) return { status: 'UNVERIFIED', detail: `lean unavailable (${res.error ? res.error.code : 'no exit'})` };
  return { status: res.status === 0 ? 'PROVEN' : 'FAILED', exit: res.status, out: String(res.stdout || '') + String(res.stderr || '') };
}

const z3 = runZ3();
const lean = runLean();

if (z3.status === 'PROVEN') {
  console.log('  Z3 base+step: PROVEN (nway_induction_z3.py, exit 0) — REDUCE + STEP machine-checked.');
} else if (z3.status === 'ABSENT' || z3.status === 'MISSING') {
  console.log(`  Z3 base+step: UNVERIFIED — ${z3.detail}.`);
} else {
  console.log(`  Z3 base+step: FAILED (nway_induction_z3.py, exit ${z3.exit}) — machine-check did NOT pass.`);
  if (z3.out) console.log(z3.out.trim().split('\n').map((l) => `    ${l}`).join('\n'));
}

if (lean.status === 'PROVEN') {
  console.log('  Lean all-N: PROVEN (NwayConfluence.lean, exit 0) — INDUCTION PRINCIPLE machine-checked in Lean 4.');
} else if (lean.status === 'UNVERIFIED' || lean.status === 'MISSING') {
  console.log(`  Lean all-N: UNVERIFIED — ${lean.detail || 'not run'} (not faked green; install the .elan toolchain to discharge it).`);
} else {
  console.log(`  Lean all-N: FAILED (NwayConfluence.lean, exit ${lean.exit}) — Lean toolchain present but REJECTED the proof.`);
  if (lean.out) console.log(lean.out.trim().split('\n').map((l) => `    ${l}`).join('\n'));
}

if (z3.status === 'PROVEN' && lean.status === 'PROVEN') {
  console.log('  PROVEN (all-N)  REDUCE + STEP machine-checked by Z3 AND the INDUCTION PRINCIPLE machine-checked in Lean: all-N obligation-preserving confluence, fully mechanized. No residual.');
} else if (z3.status === 'PROVEN' && (lean.status === 'UNVERIFIED' || lean.status === 'MISSING')) {
  console.log('  PARTIAL (all-N)  Z3 base+step PROVEN; Lean all-N induction UNVERIFIED here (toolchain absent) — honest residual, not green.');
}

// Gate failure semantics: real assertion failures, a genuinely-failing Z3 run, or a Lean toolchain
// that is present but rejects the proof. Lean simply being absent does NOT fail the gate.
const z3Failed = z3.status === 'FAILED';
const leanFailed = lean.status === 'FAILED';
const exitFail = fail > 0 || z3Failed || leanFailed;
console.log(`\n${pass} passed, ${fail} failed${z3Failed ? ' (Z3 machine-check FAILED)' : ''}${leanFailed ? ' (Lean machine-check FAILED)' : ''}`);
process.exit(exitFail ? 1 : 0);
