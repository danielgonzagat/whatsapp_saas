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
const { commute, buildEditFact, concurrentBatches } = A;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};
const fact = (file, spans, closure) => ({ file, spans, closure: new Set(closure), closureCapped: false });

// ── UNIT ─────────────────────────────────────────────────────────────────────
check('UNIT diff-file independent → commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('y.ts', [[0, 5]], ['y.ts'])).commute === true);
check('UNIT diff-file closure-coupled → no commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('y.ts', [[0, 5]], ['y.ts', 'x.ts'])).commute === false);
check('UNIT same-file disjoint spans → commute',
  commute(fact('x.ts', [[0, 5]], ['x.ts']), fact('x.ts', [[10, 15]], ['x.ts'])).commute === true);
check('UNIT same-file overlapping spans → no commute',
  commute(fact('x.ts', [[0, 10]], ['x.ts']), fact('x.ts', [[5, 15]], ['x.ts'])).commute === false);

// ── VALUE: closure catches a coupling byte-disjointness misses ────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-algebra-'));
  fs.writeFileSync(path.join(tmp, 'a.ts'), 'export const foo = 1;\n');
  fs.writeFileSync(path.join(tmp, 'b.ts'), "import { foo } from './a';\nexport const bar = foo + 1;\n");
  fs.writeFileSync(path.join(tmp, 'c.ts'), 'export const baz = 2;\n');
  const fA = buildEditFact(tmp, { file: 'a.ts', modifiedZones: [{ byteStart: 13, byteEnd: 16 }] }); // edit `foo`
  const fB = buildEditFact(tmp, { file: 'b.ts', modifiedZones: [{ byteStart: 40, byteEnd: 43 }] }); // edit in b's body
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
  check('EMPIRICAL commute rate is DISCRIMINATING (0.50 < r < 0.99, not degenerate)', pairs > 0 && rate > 0.5 && rate < 0.99);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
