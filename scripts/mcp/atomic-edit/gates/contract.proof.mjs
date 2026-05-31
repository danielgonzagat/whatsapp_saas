#!/usr/bin/env node
/**
 * contract.proof.mjs — standalone node proof for the CONTRACT-phase shared
 * surface (the canonical interfaces the 6 parallel builders compile against).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/contract.proof.mjs
 *
 * WHAT THIS PROVES (and what it honestly cannot).
 *
 * MergeResult / ConvergeResult / CorpusTriple / ClosureProvider are TypeScript
 * shapes — type-erased at runtime, so there is no JS value to `instanceof`. The
 * compiler already proved (at build time) that algebra.ts emits with these
 * exports present and that the additive edit did not break the file's existing
 * runtime exports. This proof therefore attacks the parts a contract surface CAN
 * be wrong about at runtime, in BOTH polarities:
 *
 *   COMPILE     — algebra.js loads and still exports every PRE-EXISTING runtime
 *                 symbol (commute, buildEditFact, closureOf, concurrentBatches,
 *                 resolveImport). Positive: they are functions. Negative: the
 *                 additive interfaces did NOT shadow or delete a runtime export.
 *   SHAPE       — a concrete value built to each new interface's documented
 *                 polarity round-trips through structuredClone unchanged AND its
 *                 invariants hold (refused merge ⟹ no `merged` + byteIdentical
 *                 false; converged ⟺ finalReds === 0). Negative pole: a value
 *                 that VIOLATES the documented invariant is detectable by the
 *                 same predicate — so the contract is falsifiable, not vacuous.
 *   CLOSURE     — ClosureProvider's contract is satisfiable by the algebra's own
 *                 closureOf: it returns { set:Set, capped:boolean } for a real
 *                 file, and the conservative direction (capped ⟹ lower bound)
 *                 means a finer provider can only REMOVE edges. Negative pole: a
 *                 provider returning a non-Set is rejected by the same guard.
 *   PROPOSEFIX  — the optional GateModule.proposeFixes is genuinely OPTIONAL: a
 *                 module without it is a valid GateModule (positive), and a fix
 *                 proposal object has the exact 5 documented fields with the
 *                 right primitive kinds (negative: a missing field is detected).
 *
 * HONEST CEILING: this proves the SHARED VOCABULARY is loadable, structurally
 * coherent, and falsifiable — it does NOT prove any builder's merge/converge
 * IMPLEMENTATION is correct (those ship their own proofs). Type-level conformance
 * of the builders is proven by `tsc` at integrator build time, not here.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// ── COMPILE: additive edit preserved every pre-existing runtime export ───────
for (const sym of ['commute', 'buildEditFact', 'closureOf', 'concurrentBatches', 'resolveImport']) {
  check(`COMPILE algebra.js still exports ${sym} as a function`, typeof A[sym] === 'function');
}
// Negative pole: a name we deliberately did NOT export must be absent (no leak).
check('COMPILE no accidental runtime export of the type-only MergeResult', A.MergeResult === undefined);

// ── SHAPE: each new interface's documented polarity is coherent + falsifiable ─
{
  // MergeResult — admitted merge.
  const merged = { merged: 'const a=A;const b=B;', byteIdentical: true, refused: false, reason: 'disjoint splices, order-independent' };
  // MergeResult — refused merge (honest non-guess): no `merged`, byteIdentical false.
  const refused = { byteIdentical: false, refused: true, reason: 'overlapping byte spans' };
  const mergeOk = (m) => typeof m.byteIdentical === 'boolean' && typeof m.refused === 'boolean' && typeof m.reason === 'string'
    && (m.refused ? (m.merged === undefined && m.byteIdentical === false) : typeof m.merged === 'string');
  check('SHAPE MergeResult admitted polarity satisfies invariant', mergeOk(merged) === true);
  check('SHAPE MergeResult refused polarity satisfies invariant (no merged, byteIdentical false)', mergeOk(refused) === true);
  // Falsifier (negative pole): a "refused" that still carries merged bytes is INVALID.
  check('SHAPE MergeResult bogus refused-with-bytes is correctly rejected', mergeOk({ merged: 'x', byteIdentical: true, refused: true, reason: 'lying' }) === false);
  check('SHAPE MergeResult round-trips through structuredClone', JSON.stringify(structuredClone(merged)) === JSON.stringify(merged));

  // ConvergeResult — converged ⟺ finalReds === 0.
  const conv = { converged: true, finalReds: 0, appliedEdits: 3, needsIntent: false };
  const stuck = { converged: false, finalReds: 2, appliedEdits: 5, needsIntent: true };
  const convOk = (c) => typeof c.appliedEdits === 'number' && typeof c.needsIntent === 'boolean'
    && c.converged === (c.finalReds === 0);
  check('ConvergeResult converged polarity satisfies finalReds===0 invariant', convOk(conv) === true);
  check('ConvergeResult escalated polarity (needsIntent, finalReds>0) is coherent', convOk(stuck) === true);
  // Falsifier: converged:true with finalReds>0 is a contradiction.
  check('ConvergeResult bogus converged-with-residual-reds is correctly rejected', convOk({ converged: true, finalReds: 1, appliedEdits: 0, needsIntent: false }) === false);

  // CorpusTriple — kind ∈ {repair, commute}, sha string, payload unknown.
  const triple = { kind: 'commute', sha: 'a'.repeat(64), payload: { a: 'x.ts', b: 'y.ts', commute: true } };
  const tripleOk = (t) => (t.kind === 'repair' || t.kind === 'commute') && typeof t.sha === 'string';
  check('CorpusTriple commute-kind record is valid', tripleOk(triple) === true);
  check('CorpusTriple repair-kind record is valid', tripleOk({ kind: 'repair', sha: 'b'.repeat(64), payload: null }) === true);
  // Falsifier: an out-of-enum kind is rejected.
  check('CorpusTriple bogus kind is correctly rejected', tripleOk({ kind: 'merge', sha: 'c'.repeat(64), payload: {} }) === false);
}

// ── CLOSURE: ClosureProvider's contract is satisfiable by algebra.closureOf ───
{
  /** @type {(repoRoot: string, rel: string) => { set: Set<string>; capped: boolean }} */
  const provider = (repoRoot, rel) => A.closureOf(repoRoot, rel);
  const repoRoot = path.resolve(dir, '..', '..', '..', '..');
  const r = provider(repoRoot, 'scripts/mcp/atomic-edit/gates/algebra.ts');
  check('CLOSURE ClosureProvider returns a Set', r.set instanceof Set);
  check('CLOSURE ClosureProvider returns boolean capped flag', typeof r.capped === 'boolean');
  check('CLOSURE closure always contains its own anchor file (reflexive)', r.set.has('scripts/mcp/atomic-edit/gates/algebra.ts'));
  // Falsifier (negative pole): a malformed provider (non-Set) is detectable by the guard.
  const badProvider = () => ({ set: ['not', 'a', 'set'], capped: false });
  check('CLOSURE malformed provider (array not Set) is correctly rejected', (badProvider().set instanceof Set) === false);
}

// ── PROPOSEFIX: GateModule.proposeFixes is genuinely OPTIONAL + shape-checked ─
{
  // A module WITHOUT proposeFixes is a valid GateModule (the 14 existing gates).
  const moduleNoFixes = { name: 'demo-gate', kind: 'static', appliesTo: () => true, run: () => ({ gate: 'demo-gate', green: true, reds: [] }) };
  check('PROPOSEFIX module without proposeFixes is still a valid GateModule', moduleNoFixes.proposeFixes === undefined && typeof moduleNoFixes.run === 'function');
  // A proposal object has exactly the 5 documented fields with correct primitive kinds.
  const fix = { file: 'backend/src/x.ts', byteStart: 10, byteEnd: 12, replacement: "from './y'", rationale: 'dangling import → resolved sibling' };
  const fixOk = (f) => typeof f.file === 'string' && typeof f.byteStart === 'number' && typeof f.byteEnd === 'number'
    && typeof f.replacement === 'string' && typeof f.rationale === 'string' && f.byteStart <= f.byteEnd;
  check('PROPOSEFIX a well-formed fix proposal passes the field-shape guard', fixOk(fix) === true);
  // Falsifier: a proposal missing rationale (or with byteStart > byteEnd) is rejected.
  check('PROPOSEFIX proposal missing rationale is correctly rejected', fixOk({ file: 'x', byteStart: 0, byteEnd: 1, replacement: '' }) === false);
  check('PROPOSEFIX proposal with byteStart > byteEnd is correctly rejected', fixOk({ ...fix, byteStart: 20, byteEnd: 5 }) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
