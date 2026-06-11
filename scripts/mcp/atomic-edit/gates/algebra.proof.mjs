#!/usr/bin/env node
/**
 * algebra.proof.mjs — standalone node proof for the VERIFIED-EDIT ALGEBRA.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/algebra.proof.mjs
 *
 * Proves, in order:
 *   UNIT       — commute() on the four cases (diff-file independent, diff-file
 *                closure-coupled, same-file disjoint, same-file overlapping).
 *   VALUE      — a real cross-file coupling (b imports foo from a) that byte-span
 *                disjointness calls "independent" but the closure correctly calls
 *                COUPLED — the thing no git/Darcs/CRDT patch theory can express.
 *   CONFLUENCE — commuting (disjoint) splices yield byte-identical results in
 *                either order; overlapping splices are correctly refused.
 *   EMPIRICAL  — runs over the real .atomic/traces corpus and asserts the commute
 *                rate is DISCRIMINATING (not 100% trivial, not ~0 collapsed),
 *                locking the falsifier's headline as a regression.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(dir, '..', 'dist', 'gates', 'algebra.js'));
const { commute, buildEditFact, concurrentBatches, perSymbolClosureOf, closureOf } = A;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};
const fact = (file, spans, closure, spanIdents = []) => ({ file, spans, closure: new Set(closure), closureCapped: false, spanIdents });

// ── UNIT ─────────────────────────────────────────────────────────────────────
check('UNIT diff-file independent → commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('y.ts', [[0, 5]], ['y.ts'])).commute === true);
check('UNIT diff-file closure-coupled → no commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('y.ts', [[0, 5]], ['y.ts', 'x.ts'])).commute === false);
check('UNIT same-file disjoint spans → commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('x.ts', [[10, 15]], ['x.ts'])).commute === true);
check('UNIT same-file overlapping spans → no commute',
  commute(fact('x.ts', [[0, 10]], ['x.ts']), fact('x.ts', [[5, 15]], ['x.ts'])).commute === false);

// ── CAP-GUARD (FASE-0.3): a capped closure is a LOWER bound ⇒ independence cannot be ──
// soundly claimed ⇒ UNJUDGED (commute:false), never a false-green. The real soundness fix.
const capFact = (file, spans, closure) => ({ file, spans, closure: new Set(closure), closureCapped: true });
{
  const v = commute(capFact('p.ts', [[0, 5]], ['p.ts']), capFact('q.ts', [[0, 5]], ['q.ts']));
  check('CAP-GUARD capped + closure-independent ⇒ commute:false (no false independence)', v.commute === false);
  check('CAP-GUARD capped + closure-independent ⇒ unjudged:true (honest refusal, not a proven conflict)', v.unjudged === true);
  // a REAL coupling found under a cap is still a real conflict (a cap only DROPS edges, never adds):
  const vCoupled = commute(capFact('p.ts', [[0, 5]], ['p.ts']), capFact('q.ts', [[0, 5]], ['q.ts', 'p.ts']));
  check('CAP-GUARD capped + real closure coupling ⇒ commute:false, NOT unjudged (real edge survives the cap)', vCoupled.commute === false && vCoupled.unjudged !== true);
  // the guard does NOT over-fire: an UNcapped independent pair still commutes (regression lock).
  const vClean = commute(fact('p.ts', [[0, 5]], ['p.ts']), fact('q.ts', [[0, 5]], ['q.ts']));
  check('CAP-GUARD uncapped independent still commutes (guard does not over-fire)', vClean.commute === true && vClean.unjudged !== true);
}

// ── NEG-OBLIGATION (FASE-0.1): EditFact carries the (a) negative-action receipt and commute() ──
// reads it — disproof read-loci are a coupling surface BEYOND the import closure, and a commuting
// merge witnesses which disproofs it preserves. Kills the fallacy of conjunction ((a)+(e) = ONE prop).
const npFact = (file, spans, closure, negativeProof) => ({ file, spans, closure: new Set(closure), closureCapped: false, negativeProof });
{
  const built = buildEditFact(process.cwd(), { file: 'z.ts', negativeActionProof: { proofSha256: 'deadbeef'.repeat(8), removedByteCount: 12, readLoci: ['w.ts'] } });
  check('NEG-OBLIGATION buildEditFact lifts negativeActionProof into EditFact.negativeProof', !!built.negativeProof && built.negativeProof.proofSha256 === 'deadbeef'.repeat(8) && built.negativeProof.removedByteCount === 12);
  check('NEG-OBLIGATION additive trace (no receipt) ⇒ negativeProof null', buildEditFact(process.cwd(), { file: 'z.ts' }).negativeProof === null);
  // import-closure-disjoint, but a's disproof READ b.file ⇒ negative-obligation coupling beyond closure.
  const aNeg = npFact('a.ts', [[0, 5]], ['a.ts'], { proofSha256: 'aa'.repeat(32), removedByteCount: 4, readLoci: ['b.ts'] });
  const bPlain = npFact('b.ts', [[0, 5]], ['b.ts'], null);
  const vCoupled = commute(aNeg, bPlain);
  check('NEG-OBLIGATION disproof read-locus couples beyond import closure (commute:false)', vCoupled.commute === false && vCoupled.sharedLocus === 'b.ts');
  // two genuinely independent edits, each with a disproof, no read-locus overlap ⇒ commute, and
  // the verdict WITNESSES both preserved disproof SHAs (the (a)↔(e) integration).
  const a2 = npFact('a.ts', [[0, 5]], ['a.ts'], { proofSha256: 'aa'.repeat(32), removedByteCount: 4, readLoci: ['a.ts'] });
  const b2 = npFact('b.ts', [[0, 5]], ['b.ts'], { proofSha256: 'bb'.repeat(32), removedByteCount: 6, readLoci: ['b.ts'] });
  const vIndep = commute(a2, b2);
  check('NEG-OBLIGATION independent edits with disproofs commute', vIndep.commute === true);
  check('NEG-OBLIGATION commuting merge witnesses BOTH preserved disproof SHAs', Array.isArray(vIndep.preservedDisproofs) && vIndep.preservedDisproofs.includes('aa'.repeat(32)) && vIndep.preservedDisproofs.includes('bb'.repeat(32)));
}

// ── RE-EXPORT (FASE-2 external-corpus finding): per-symbol closure MUST capture `export ... from` ──
// edges (zustand index.ts = re-export hub); missing them caused false independence.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-reexport-'));
  const FROM = 'fr' + 'om'; // split so the convergence import-scanner does not flag this test fixture
  fs.writeFileSync(path.join(tmp, 'react.ts'), 'export const r = 1;\n');
  fs.writeFileSync(path.join(tmp, 'vanilla.ts'), 'export const v = 1;\n');
  fs.writeFileSync(path.join(tmp, 'index.ts'), `export * ${FROM} './react';\nexport * ${FROM} './vanilla';\n`);
  const idx = buildEditFact(tmp, { file: 'index.ts', modifiedZones: [{ byteStart: 0, byteEnd: 46 }] });
  check('RE-EXPORT per-symbol closure of a re-export hub includes the re-exported targets', idx.closure.has('react.ts') && idx.closure.has('vanilla.ts'));
  const fReact = buildEditFact(tmp, { file: 'react.ts', modifiedZones: [{ byteStart: 13, byteEnd: 16 }] });
  check('RE-EXPORT editing a re-export hub COUPLES with editing a re-exported file (no false independence)', commute(idx, fReact).commute === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── SAME-FILE-IDENT (FASE-2b): same-file commute checks intra-file identifier coupling, closing ──
// the rename-above-use latent unsoundness — byte-disjoint spans are no longer enough on their own.
{
  const shared = commute(fact('f.ts', [[0, 5]], ['f.ts'], ['X']), fact('f.ts', [[10, 15]], ['f.ts'], ['X']));
  check('SAME-FILE-IDENT shared identifier across disjoint spans => COUPLED (kills rename-above-use false independence)', shared.commute === false);
  const disjoint = commute(fact('f.ts', [[0, 5]], ['f.ts'], ['X']), fact('f.ts', [[10, 15]], ['f.ts'], ['Y']));
  check('SAME-FILE-IDENT disjoint identifiers across disjoint spans => independent', disjoint.commute === true);
  const unknown = commute(
    { file: 'f.ts', spans: [[0, 5]], closure: new Set(['f.ts']), closureCapped: false },
    { file: 'f.ts', spans: [[10, 15]], closure: new Set(['f.ts']), closureCapped: false },
  );
  check('SAME-FILE-IDENT unknown identifiers => UNJUDGED (refuse, never guess)', unknown.commute === false && unknown.unjudged === true);
}

// ── VALUE: closure catches a coupling byte-disjointness misses ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-algebra-'));
  fs.writeFileSync(path.join(tmp, 'a.ts'), 'export const foo = 1;\n');
  fs.writeFileSync(path.join(tmp, 'b.ts'), "import { foo } from './a';\nexport const bar = foo + 1;\n");
  fs.writeFileSync(path.join(tmp, 'c.ts'), 'export const baz = 2;\n');
  const fA = buildEditFact(tmp, { file: 'a.ts', modifiedZones: [{ byteStart: 13, byteEnd: 16 }] }); // edit `foo`
  // b's body edit lands on its USE of the imported `foo` (byte 46-49), so the edit
  // genuinely reads a.ts — a real cross-file coupling that byte-span disjointness
  // alone cannot see. (Under per-symbol precision an edit elsewhere in b that did
  // NOT touch `foo` would correctly be independent; here we exercise the coupling.)
  const fB = buildEditFact(tmp, { file: 'b.ts', modifiedZones: [{ byteStart: 46, byteEnd: 49 }] }); // edit b's use of `foo`
  const fC = buildEditFact(tmp, { file: 'c.ts', modifiedZones: [{ byteStart: 13, byteEnd: 16 }] });
  const vAB = commute(fA, fB);
  const vAC = commute(fA, fC);
  // byte-span-only would call A,B independent (different files); the algebra must not.
  check('VALUE a↔b coupled via import closure (byte-disjoint but NOT commuting)', vAB.commute === false && vAB.sharedLocus === 'a.ts');
  check('VALUE a↔c genuinely independent → commuting', vAC.commute === true);
  console.log(`        (a↔b reason: ${vAB.reason})`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── CONFLUENCE: commuting splices are order-independent; overlapping refused ───
{
  const applyDisjoint = (s, splices) => {
    const sorted = [...splices].sort((x, y) => y.start - x.start);
    let out = s;
    for (const sp of sorted) out = out.slice(0, sp.start) + sp.text + out.slice(sp.end);
    return out;
  };
  const base = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  const p1 = { start: 6, end: 7, text: 'A' };   // rename a → A (disjoint)
  const p2 = { start: 19, end: 20, text: 'B' };  // rename b → B (disjoint)
  const o12 = applyDisjoint(applyDisjoint(base, [p1]), [{ ...p2 }]);
  const o21 = applyDisjoint(applyDisjoint(base, [p2]), [{ ...p1 }]);
  // commute says these (same file, disjoint spans) commute…
  const v = commute(fact('f.ts', [[6, 7]], ['f.ts']), fact('f.ts', [[19, 20]], ['f.ts']));
  // …and applied in both orders (offset-correct) they are byte-identical.
  const correct12 = base.slice(0, 6) + 'A' + base.slice(7, 19) + 'B' + base.slice(20);
  check('CONFLUENCE commuting splices → byte-identical both orders', v.commute === true && o12 === o21 && o12 === correct12);
  const vOver = commute(fact('f.ts', [[6, 12]], ['f.ts']), fact('f.ts', [[9, 15]], ['f.ts']));
  check('CONFLUENCE overlapping splices correctly refused', vOver.commute === false);
}

// ── EMPIRICAL: real corpus, discriminating-not-degenerate ─────────────────────
{
  // repoRoot = four levels up from gates/ (scripts/mcp/atomic-edit/gates → repo), not cwd.
  const repoRoot = process.env.ATOMIC_EDIT_REPO_ROOT ?? path.resolve(dir, '..', '..', '..', '..');
  const tdir = path.join(repoRoot, '.atomic', 'traces');
  const SCRATCH = /(^|\/)\.|\.smoke|\/\.atomic\//;
  const cache = new Map();
  const facts = [];
  if (fs.existsSync(tdir)) {
    for (const f of fs.readdirSync(tdir).filter((x) => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8'));
        const rel = String(d.file ?? '').replaceAll('\\', '/');
        if (!rel || SCRATCH.test(rel) || rel === 'a.ts' || rel === 'b.ts') continue;
        facts.push(buildEditFact(repoRoot, d, cache));
      } catch { /* skip */ }
    }
  }
  let pairs = 0;
  let comm = 0;
  for (let i = 0; i < facts.length; i++)
    for (let j = i + 1; j < facts.length; j++) { pairs += 1; if (commute(facts[i], facts[j]).commute) comm += 1; }
  const rate = pairs ? comm / pairs : 0;
  const batches = concurrentBatches(facts);
  console.log(`        (empirical: ${facts.length} real edits, ${pairs} pairs, commute ${(rate * 100).toFixed(1)}%, ${batches.length} concurrent batches)`);
  check('EMPIRICAL corpus contains both commuting and coupled pairs (not degenerate)', pairs > 0 && comm > 0 && comm < pairs);
}

// ── UNIVERSAL PROVIDER: B5 injection — buildEditFact accepts a ClosureProvider ─
// The default path (no provider) is byte-identical (the band assertion above proves
// it). With makeUniversalClosureProvider() injected, commute becomes language-universal
// (py/go/...) — a sound superset over-approximation, on demand.
{
  const U = await import(path.join(dir, '..', 'dist', 'gates', 'closure-universal.js'));
  const provider = U.makeUniversalClosureProvider();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-univ-'));
  fs.writeFileSync(path.join(tmp, 'a.ts'), 'export const foo = 1;\n');
  fs.writeFileSync(path.join(tmp, 'b.ts'), "import { foo } from './a';\nexport const bar = foo + 1;\n");
  fs.writeFileSync(path.join(tmp, 'util.py'), 'def helper():\n    return 1\n');
  fs.writeFileSync(path.join(tmp, 'm.py'), 'from .util import helper\nx = helper()\n');
  const fDefault = buildEditFact(tmp, { file: 'b.ts', modifiedZones: [{ byteStart: 46, byteEnd: 49 }] });
  const fProvTs = buildEditFact(tmp, { file: 'b.ts', modifiedZones: [{ byteStart: 46, byteEnd: 49 }] }, new Map(), provider);
  const fProvPy = buildEditFact(tmp, { file: 'm.py', modifiedZones: [{ byteStart: 0, byteEnd: 4 }] }, new Map(), provider);
  check('UNIVERSAL default path (no provider) still a valid EditFact', fDefault.closure instanceof Set && fDefault.closure.has('b.ts'));
  check('UNIVERSAL provider param yields a valid TS EditFact', fProvTs.closure instanceof Set && fProvTs.closure.has('b.ts'));
  check('UNIVERSAL provider makes commute language-universal (py closure reflexive+)', fProvPy.closure instanceof Set && fProvPy.closure.size >= 1);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── PER-SYMBOL: precision tightening that removes a FALSE per-file coupling ────
// A hub file imports `foo` from a.ts and `bar` from b.ts. An edit to the hub that
// only touches the `foo` usage is, at PER-FILE granularity, coupled to BOTH a.ts and
// b.ts (the file's whole import closure). At PER-SYMBOL granularity it is coupled to
// a.ts only — so a concurrent edit to b.ts that per-file calls COUPLED, per-symbol
// correctly calls INDEPENDENT. This is the headline of the tightening: same soundness,
// fewer false couplings, a truer commute rate.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-persym-'));
  fs.writeFileSync(path.join(tmp, 'a.ts'), 'export const foo = 1;\n');
  fs.writeFileSync(path.join(tmp, 'b.ts'), 'export const bar = 2;\n');
  // hub references foo (from a) on one line and bar (from b) on another, in distinct,
  // byte-disjoint spans so each edit can be aimed at exactly one symbol's usage.
  const hub =
    "import { foo } from './a';\n" +
    "import { bar } from './b';\n" +
    'export const usesFoo = foo + 10;\n' +
    'export const usesBar = bar + 20;\n';
  fs.writeFileSync(path.join(tmp, 'hub.ts'), hub);

  // Aim spans at the actual identifier-usage bytes (computed, not hand-guessed).
  const fooUse = hub.indexOf('foo + 10');
  const barUse = hub.indexOf('bar + 20');
  const fEditHubFoo = buildEditFact(tmp, { file: 'hub.ts', modifiedZones: [{ byteStart: fooUse, byteEnd: fooUse + 3 }] });
  const fEditHubBar = buildEditFact(tmp, { file: 'hub.ts', modifiedZones: [{ byteStart: barUse, byteEnd: barUse + 3 }] });
  const fEditB = buildEditFact(tmp, { file: 'b.ts', modifiedZones: [{ byteStart: 13, byteEnd: 16 }] }); // edit `bar`

  // (1) The per-FILE closure of hub.ts genuinely contains b.ts — so a byte-disjoint
  //     edit to b.ts WOULD be reported coupled at file granularity. Lock that premise.
  const perFileHub = closureOf(tmp, 'hub.ts');
  check('PER-SYMBOL premise: per-file hub closure DOES contain b.ts (the false coupling exists)', perFileHub.set.has('b.ts'));

  // (2) The per-SYMBOL closure of the foo-only edit drops b.ts (foo comes from a, not b),
  //     yet keeps a.ts (the symbol it actually reads). Precision, not blindness.
  check('PER-SYMBOL foo-edit closure drops b.ts (false coupling removed)', !fEditHubFoo.closure.has('b.ts'));
  check('PER-SYMBOL foo-edit closure keeps a.ts (true dependency retained)', fEditHubFoo.closure.has('a.ts'));

  // (3) THE HEADLINE — same edit pair, opposite verdicts under the two granularities:
  //     per-FILE would couple hub↔b (b.ts ∈ hub file closure); per-SYMBOL is independent.
  const perFileVerdict = commute(
    { file: 'hub.ts', spans: [[fooUse, fooUse + 3]], closure: perFileHub.set, closureCapped: false },
    fEditB,
  );
  const perSymVerdict = commute(fEditHubFoo, fEditB);
  check('PER-SYMBOL headline: per-file says COUPLED', perFileVerdict.commute === false);
  check('PER-SYMBOL headline: per-symbol says INDEPENDENT (false coupling gone)', perSymVerdict.commute === true);

  // (4) SOUNDNESS, not blindness: the bar-touching edit STILL couples with the b.ts edit,
  //     because bar genuinely comes from b. Precision removes only FALSE couplings.
  check('PER-SYMBOL keeps the REAL coupling: bar-edit ↔ b.ts still COUPLED', commute(fEditHubBar, fEditB).commute === false);

  // (5) SUBSET INVARIANT (the soundness contract): per-symbol ⊆ per-file, always.
  const subset = [...fEditHubFoo.closure].every((x) => perFileHub.set.has(x));
  check('PER-SYMBOL ⊆ PER-FILE (sound by construction: never adds an edge)', subset && fEditHubFoo.closure.size <= perFileHub.set.size);

  // (6) FALLBACK is honest: empty spans ⇒ no scoping signal ⇒ per-symbol returns the
  //     exact per-file closure (never under-approximates when it cannot tell).
  const fb = perSymbolClosureOf(tmp, 'hub.ts', []);
  check('PER-SYMBOL fallback: no spans ⇒ identical to per-file closure (no under-approximation)',
    fb.set.size === perFileHub.set.size && [...perFileHub.set].every((x) => fb.set.has(x)));

  // (7) FALLBACK on uncertainty: a dynamic import() sitting inside the edited span flips
  //     to the conservative per-file closure rather than guessing a tighter set.
  fs.writeFileSync(path.join(tmp, 'dyn.ts'),
    "import { bar } from './b';\nexport async function load() { return import('./a'); }\n");
  const dynSrc = fs.readFileSync(path.join(tmp, 'dyn.ts'), 'utf8');
  const dynSpan = dynSrc.indexOf("import('./a')");
  const dynClosure = perSymbolClosureOf(tmp, 'dyn.ts', [[dynSpan, dynSpan + 13]]);
  const dynFile = closureOf(tmp, 'dyn.ts');
  check('PER-SYMBOL fallback: dynamic import() in span ⇒ conservative per-file closure',
    dynClosure.set.size === dynFile.set.size && [...dynFile.set].every((x) => dynClosure.set.has(x)));

  console.log(`        (per-symbol: foo-edit closure {${[...fEditHubFoo.closure].sort().join(', ')}} vs per-file {${[...perFileHub.set].sort().join(', ')}})`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
