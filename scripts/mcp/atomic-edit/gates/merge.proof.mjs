#!/usr/bin/env node
/**
 * merge.proof.mjs — standalone node proof for the THIRD MERGE MODE (gates/merge.ts).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/merge.proof.mjs
 *
 * THE LIVE PROOF that "merge without CI" is sound. Builds REAL temp projects on
 * disk (so merge's own readBase + algebra's closureOf read real bytes), constructs
 * atomic-trace-shaped inputs, and exercises merge() in BOTH polarities:
 *
 *   COMPILE       — dist/gates/merge.js loads and exports merge as a function.
 *   CONFLUENCE-1  — TWO-AGENT, SAME FILE, disjoint loci: two independent edits to one
 *                   file merge to a single buffer that (a) is byte-identical in both
 *                   application orders and (b) EQUALS the hand-computed double-edit —
 *                   so the merged bytes are CORRECT, not vacuously order-free.
 *   CONFLUENCE-2  — TWO-AGENT, DIFFERENT FILES, orthogonal: edits to two files with no
 *                   import coupling merge (byteIdentical, not refused) and the merged
 *                   map carries BOTH files' post-edit bytes.
 *   REFUSE-1      — SAME FILE, OVERLAPPING spans: a genuine conflict is REFUSED
 *                   (refused:true, no merged, byteIdentical:false) — never a guessed
 *                   best-effort splice. This is the honest non-merge.
 *   REFUSE-2      — DIFFERENT FILES, closure-coupled (b imports a, edit both): the
 *                   coupling byte-disjointness would miss is REFUSED via the algebra's
 *                   import closure — the thing no git/CRDT three-way merge can express.
 *   IDENTITY      — the empty splice (a no-op trace) is the merge UNIT: merging it with
 *                   any real edit yields exactly that edit. (The CAPPED-CLOSURE refuse
 *                   path exists in merge.ts but cannot be cheaply triggered through the
 *                   public merge() — it uses the internal default maxNodes=2000 — so it
 *                   is UNJUDGED here and called out in honestLimits, never green-faked.)
 *   FALSIFIER     — a deliberately COUPLED same-file pair (overlapping) that, if merge
 *                   silently spliced, WOULD diverge by order — confirms merge's refusal
 *                   (REFUSE-1) is load-bearing (the bytes really are order-dependent there).
 *
 * HONEST CEILING — proves CONFLUENCE OF BYTES, not CORRECTNESS OF BEHAVIOUR. merge
 * inherits exactly algebra.ts's coupling model; it removes the integration test that
 * asks "did the merge corrupt the tree", not the per-edit gates. A semantic coupling
 * algebra.ts does not model (e.g. intra-file binding) is out of scope here by design.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const M = await import(path.join(dir, '..', 'dist', 'gates', 'merge.js'));
const { merge } = M;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// Build a fresh temp project; return its root. Files written verbatim.
const mkProject = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-merge-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
};
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

// A trace as merge consumes it: { file, modifiedZones:[{byteStart,byteEnd,newSample}] }.
const trace = (file, zones) => ({
  file,
  modifiedZones: zones.map(([byteStart, byteEnd, newSample]) => ({ byteStart, byteEnd, newSample })),
});

// ── COMPILE ───────────────────────────────────────────────────────────────────
check('COMPILE dist/gates/merge.js exports merge as a function', typeof merge === 'function');

// ── CONFLUENCE-1: two-agent, SAME FILE, disjoint loci ─────────────────────────
{
  // shared.ts post-both-edits is the base on disk (each edit was already applied
  // when its trace was written). We model the merge over the CURRENT bytes and
  // splice in the two zones; the two splices are byte-disjoint so they commute.
  const content = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  //                01234567890123456789012345678901234567
  // 'a' value '1' is at byte 10; 'b' value '2' is at byte 23.
  const root = mkProject({ 'shared.ts': content });
  const tA = trace('shared.ts', [[10, 11, 'A']]); // 1 -> A
  const tB = trace('shared.ts', [[23, 24, 'B']]); // 2 -> B
  const r = merge(root, tA, tB);

  // Hand-computed double-edit (offset-correct): byte 10 → A, byte 23 → B.
  const expected = content.slice(0, 10) + 'A' + content.slice(11, 23) + 'B' + content.slice(24);

  check('CONFLUENCE-1 same-file disjoint edits are ADMITTED (not refused)', r.refused === false);
  check('CONFLUENCE-1 byteIdentical witness is TRUE', r.byteIdentical === true);
  check('CONFLUENCE-1 merged buffer EQUALS the hand-computed double-edit (correct, not vacuous)', r.merged === expected);
  check('CONFLUENCE-1 merged reflects BOTH agents (a→A and b→B present)', r.merged.includes('const a = A;') && r.merged.includes('const b = B;'));
  console.log(`        (merged: ${JSON.stringify(r.merged)})`);
  cleanup(root);
}

// ── CONFLUENCE-2: two-agent, DIFFERENT FILES, orthogonal ──────────────────────
{
  // x.ts and c.ts: c.ts is NOT imported by x.ts → genuinely independent files.
  const root = mkProject({
    'x.ts': 'export const x = 1;\n',
    'c.ts': 'export const c = 2;\n',
  });
  const tX = trace('x.ts', [[17, 18, '9']]); // 1 -> 9 (the literal `1` is at byte 17)
  const tC = trace('c.ts', [[17, 18, '7']]); // 2 -> 7 (the literal `2` is at byte 17)
  const r = merge(root, tX, tC);
  check('CONFLUENCE-2 orthogonal cross-file edits are ADMITTED', r.refused === false && r.byteIdentical === true);
  // Two files touched → merged is the canonical JSON map carrying both post-edit buffers.
  let map = null;
  try { map = JSON.parse(r.merged); } catch { /* leave null */ }
  check('CONFLUENCE-2 merged map carries BOTH files post-edit bytes', map !== null
    && map['x.ts'] === 'export const x = 9;\n' && map['c.ts'] === 'export const c = 7;\n');
  cleanup(root);
}

// ── REFUSE-1: same file, OVERLAPPING spans → honest non-merge ──────────────────
{
  const root = mkProject({ 'f.ts': 'const value = 12345;\n' });
  const tA = trace('f.ts', [[14, 17, 'AAA']]); // overlaps...
  const tB = trace('f.ts', [[15, 19, 'BBBB']]); // ...with this
  const r = merge(root, tA, tB);
  check('REFUSE-1 same-file overlapping spans are REFUSED', r.refused === true);
  check('REFUSE-1 refused merge has NO merged buffer', r.merged === undefined);
  check('REFUSE-1 refused merge has byteIdentical false (by construction)', r.byteIdentical === false);
  console.log(`        (refuse reason: ${r.reason})`);
  cleanup(root);
}

// ── REFUSE-2: different files, closure-coupled (b imports a) ───────────────────
{
  const root = mkProject({
    'a.ts': 'export const foo = 1;\n',
    'b.ts': "import { foo } from './a';\nexport const bar = foo + 1;\n",
  });
  // Byte-span-only would call these independent (different files). The algebra's
  // import closure (b reads a) makes them COUPLED → merge must refuse.
  const tA = trace('a.ts', [[13, 16, 'foo']]); // touch `foo` (the export) in a
  const tB = trace('b.ts', [[46, 49, 'foo']]); // touch the USE of imported `foo` in b — under the
  //                                              per-SYMBOL closure (algebra.ts) the refusal fires
  //                                              because the edited span actually reads the symbol
  //                                              imported from a.ts (a REAL coupling, not the false
  //                                              per-file one a `bar`-only edit would over-report).
  const r = merge(root, tA, tB);
  check('REFUSE-2 cross-file closure coupling (b imports a) is REFUSED', r.refused === true);
  check('REFUSE-2 refused: no merged buffer, byteIdentical false', r.merged === undefined && r.byteIdentical === false);
  console.log(`        (refuse reason: ${r.reason})`);
  cleanup(root);
}

// ── IDENTITY: a no-op (empty-zone) trace is the merge unit ────────────────────
{
  // The empty splice is the identity of the partial commutative monoid (§algebra.ts).
  // A trace with no modifiedZones contributes no splice, so merging it with any real
  // edit yields exactly that edit — proving the no-op is the unit and that an edit
  // with disjoint-from-nothing spans always merges. (The CAPPED-CLOSURE refuse path
  // is real in merge.ts but cannot be cheaply triggered through the public merge()
  // here — merge calls buildEditFact with the internal default maxNodes=2000, which a
  // fixture cannot exceed without thousands of files; that path is UNJUDGED by this
  // proof and called out in honestLimits, never asserted-by-guess.)
  const root = mkProject({ 'g.ts': 'export const g = 1;\n' });
  const tNoop = trace('g.ts', []);                 // no modifiedZones → identity splice
  const tEdit = trace('g.ts', [[17, 18, '5']]);    // 1 -> 5 (the literal `1` is at byte 17)
  const r = merge(root, tNoop, tEdit);
  check('IDENTITY no-op (empty-zone) trace merges as identity with a real edit', r.refused === false && r.byteIdentical === true);
  check('IDENTITY identity-merge applies the real edit (g = 5)', r.merged === 'export const g = 5;\n');
  cleanup(root);
}

// ── FALSIFIER: the refusal in REFUSE-1 is load-bearing (bytes ARE order-dependent) ─
{
  // Confirm that the overlapping pair merge REFUSED would, if naively spliced in
  // both orders, actually DIVERGE — so refusal prevented a real corruption, not a
  // hypothetical one. We replicate the naive splice locally (merge never does this).
  const base = 'const value = 12345;\n';
  const naive = (s, splices) => {
    let out = s;
    for (const sp of [...splices].sort((x, y) => y.start - x.start)) out = out.slice(0, sp.start) + sp.text + out.slice(sp.end);
    return out;
  };
  const pA = { start: 14, end: 17, text: 'AAA' };
  const pB = { start: 15, end: 19, text: 'BBBB' };
  const ab = naive(naive(base, [pA]), [pB]);
  const ba = naive(naive(base, [pB]), [pA]);
  check('FALSIFIER overlapping splices DO diverge by order (so REFUSE-1 was load-bearing)', ab !== ba);
  console.log(`        (order AB: ${JSON.stringify(ab)}  order BA: ${JSON.stringify(ba)})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
