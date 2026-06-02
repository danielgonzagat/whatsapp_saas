/**
 * gates/property-gate.proof.ts — standalone tsx proof for the property gate.
 *
 * Builds REAL on-disk fixture modules (each carrying an inline `// @property`
 * directive, exactly as a real changed file would) and drives the gate's full
 * transaction — snapshot → write an EPHEMERAL sibling driver → run it twice as a
 * real child process → revert (unlink driver) — then asserts:
 *
 *   GREEN     — a function whose asserted invariant truly holds over K seeded
 *               inputs (e.g. Math.abs(x) >= 0) → no counterexample → green.
 *   RED       — a function whose invariant is violated for some inputs (e.g. an
 *               author claims `double(x) > x` which fails for x <= 0) → the gate
 *               finds and SHRINKS a concrete counterexample → a precise GateRed
 *               naming the function + the shrunk input.
 *   RED       — a buggy implementation (claims sort keeps length but drops dups) →
 *               counterexample over array(int(0,3)) inputs.
 *   UNJUDGED  — a NON-DETERMINISTIC function (returns Date.now()/random) → the two
 *               seeded runs disagree → property testing is unsound → the honest
 *               ceiling, never red/green-by-guess.
 *   UNJUDGED  — the exported name is not a function (import resolves but fn missing)
 *               → cannot execute the property → honest defer.
 *   TOKEN-CORRECT (the FP removal) — a file whose ONLY occurrence of `@property`
 *               is inside a STRING LITERAL (not a comment) → perception reads
 *               comment nodes, sees NO directive → NO property fact → green/no-op,
 *               whereas a naive whole-file regex would wrongly fire. Proven both
 *               at the gate level and directly via the parser.
 *   NO-OP     — a changed file with no directive at all → green, nothing run.
 *   TARGET UNTOUCHED — after every run, each fixture target is byte-identical and
 *               no ephemeral driver remains (clean tree).
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/property-gate.proof.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext, type GateResult } from './contract.js';
import gate, { parseDirectiveLine, parsePropertyDirective } from './property-gate.js';

function mkrepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'property-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');

function show(label: string, r: GateResult): void {
  const tag = r.unjudged ? 'UNJUDGED' : r.green ? 'GREEN' : 'RED';
  console.log(`  [${tag}] ${label} — reds=${r.reds.length}${r.reds[0] ? ` :: ${r.reds[0].fact}` : ''}`);
  if (r.unjudged && r.note) console.log(`           note: ${r.note}`);
}

let failures = 0;
function expect(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.log(`  ✗ FAIL: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

/** Assert a target stayed byte-identical and no `.__propgate_*` driver leaked. */
function expectCleanTree(root: string, rel: string, original: string): void {
  const after = fs.readFileSync(path.join(root, rel));
  expect(sha(after) === sha(original), `target ${rel} untouched (byte-identical after harness)`);
  const leaked = fs.readdirSync(path.dirname(path.join(root, rel))).filter((f) => f.startsWith('.__propgate_'));
  expect(leaked.length === 0, `no ephemeral driver leaked beside ${rel}`);
}

async function main(): Promise<void> {
  console.log('property-gate proof\n');

  // ── Sanity: the line parser pulls a full spec out of one directive line ──
  {
    const spec = parseDirectiveLine('// @property fn=foo invariant=result >= 0 gen=int runs=50 seed=7');
    expect(spec !== null, 'parseDirectiveLine returns a spec');
    expect(spec?.fn === 'foo' && spec?.invariant === 'result >= 0', 'fn + invariant parsed');
    expect(spec?.gens.length === 1 && spec?.gens[0] === 'int', 'single gen spec parsed');
    expect(spec?.runs === 50 && spec?.seed === 7, 'runs + seed parsed');
    const multi = parseDirectiveLine('// @property fn=add invariant=result === input[0]+input[1] gen=int, int');
    expect(multi?.gens.length === 2, 'comma-split gen → two arg specs (top-level comma)');
    const ranged = parseDirectiveLine('// @property fn=clamp invariant=result>=0 gen=int(0,10)');
    expect(ranged?.gens.length === 1 && ranged?.gens[0] === 'int(0,10)', 'comma INSIDE int(0,10) is not a split point');
  }

  // ── TOKEN-CORRECTNESS (the FP removal) at the parser level ──
  // A directive that exists ONLY inside a string literal must yield NO spec, while
  // the same text in a real comment must yield a spec. perception reads comment
  // nodes, so the literal is invisible — exactly the FP a whole-file regex makes.
  {
    const inComment = '// @property fn=foo invariant=result>=0 gen=int\nexport function foo(x: number) { return Math.abs(x); }\n';
    const inString = 'export const banner = "// @property fn=evil invariant=false gen=int";\nexport function foo(x: number) { return x; }\n';
    const c = await parsePropertyDirective(inComment, 'a.ts');
    const s = await parsePropertyDirective(inString, 'b.ts');
    expect(c !== null && c !== 'no-grammar' && c.fn === 'foo', 'directive in a REAL comment is parsed');
    expect(s === null, 'directive text inside a STRING LITERAL is NOT a directive (token-correct, FP removed)');
  }

  // ── CASE 1: GREEN — invariant truly holds over K inputs ──
  {
    const file =
      '// @property fn=absNonNeg invariant=result >= 0 gen=int runs=80\n' +
      'export function absNonNeg(x) { return Math.abs(x); }\n';
    const root = mkrepo({ 'good.mjs': file });
    const ctx = makeContext(root, new Map(), ['good.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 1 (abs >= 0 holds)', r);
    expect(r.green && !r.unjudged, 'a true invariant converges GREEN over K seeded inputs');
    expect(r.reds.length === 0, 'no counterexample found');
    expectCleanTree(root, 'good.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 2: RED — invariant violated; gate finds + shrinks a counterexample ──
  // Author over-claims `double(x) > x`, which is FALSE for x <= 0 (e.g. x=0 -> 0).
  {
    const file =
      '// @property fn=dbl invariant=result > input gen=int runs=80\n' +
      'export function dbl(x) { return x * 2; }\n';
    const root = mkrepo({ 'bug.mjs': file });
    const ctx = makeContext(root, new Map(), ['bug.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 2 (double(x) > x is false for x<=0)', r);
    expect(!r.green && !r.unjudged, 'a violated invariant is RED');
    expect(r.reds.some((x) => x.file === 'bug.mjs' && /counterexample/i.test(x.fact)), 'red names file + states a counterexample');
    expect(r.reds.some((x) => x.locus === 'dbl'), 'red locus is the function under test');
    expect(r.reds.some((x) => /shrunk input/.test(x.fact)), 'red reports the SHRUNK counterexample');
    expectCleanTree(root, 'bug.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3: RED — array property (sort keeps length) violated by a dedupe bug ──
  {
    const file =
      '// @property fn=mysort invariant=result.length === input.length gen=array(int(0,3)) runs=80\n' +
      'export function mysort(a) {\n' +
      '  return Array.from(new Set(a)).sort((x, y) => x - y);\n' + // drops duplicates → length shrinks
      '}\n';
    const root = mkrepo({ 'sort.mjs': file });
    const ctx = makeContext(root, new Map(), ['sort.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3 (dedup sort breaks length-preservation)', r);
    expect(!r.green && !r.unjudged, 'array-property violation is RED');
    expect(r.reds.some((x) => x.locus === 'mysort' && /counterexample/i.test(x.fact)), 'red names mysort + counterexample');
    expectCleanTree(root, 'sort.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3b: GREEN — the SAME shape, with a correct implementation ──
  {
    const file =
      '// @property fn=mysort invariant=result.length === input.length gen=array(int(0,3)) runs=80\n' +
      'export function mysort(a) {\n' +
      '  return a.slice().sort((x, y) => x - y);\n' + // keeps every element → length preserved
      '}\n';
    const root = mkrepo({ 'sortok.mjs': file });
    const ctx = makeContext(root, new Map(), ['sortok.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3b (correct sort preserves length)', r);
    expect(r.green && !r.unjudged, 'a correct array property converges GREEN');
    expectCleanTree(root, 'sortok.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 4: UNJUDGED — a NON-DETERMINISTIC function (the honest ceiling) ──
  // The function returns Date.now()+random, so the two seeded runs disagree on the
  // verdict → property testing is unsound → unjudged, never faked green/red.
  {
    const file =
      '// @property fn=nd invariant=result === 0 gen=int runs=20\n' +
      'export function nd(_x) { return Date.now() + Math.floor(Math.random() * 1e9); }\n';
    const root = mkrepo({ 'nondet.mjs': file });
    const ctx = makeContext(root, new Map(), ['nondet.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 4 (non-deterministic function)', r);
    expect(r.unjudged === true, 'non-deterministic function is UNJUDGED (the honest ceiling)');
    expect(r.reds.length === 0, 'unjudged emits NO reds — never red-by-guess');
    expect(/non-deterministic/i.test(r.note ?? ''), 'note explains the non-determinism ceiling');
    expectCleanTree(root, 'nondet.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 5: UNJUDGED — the exported name is not a function ──
  {
    const file =
      '// @property fn=notThere invariant=result === 1 gen=int runs=10\n' +
      'export const notThere = 42;\n'; // exists, but not callable
    const root = mkrepo({ 'noexport.mjs': file });
    const ctx = makeContext(root, new Map(), ['noexport.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 5 (export is not a function)', r);
    expect(r.unjudged === true, 'a non-callable export is UNJUDGED (cannot execute the property)');
    expect(r.reds.length === 0, 'no reds when the property cannot run');
    expectCleanTree(root, 'noexport.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 6: TOKEN-CORRECT no-op at the GATE level — directive only in a string ──
  {
    const file =
      'export const help = "usage: // @property fn=ghost invariant=false gen=int";\n' +
      'export function real(x) { return x; }\n';
    const root = mkrepo({ 'stringonly.mjs': file });
    const ctx = makeContext(root, new Map(), ['stringonly.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 6 (directive only inside a string literal)', r);
    expect(r.green && r.reds.length === 0, 'a string-embedded directive yields NO property fact (green no-op)');
    expect(r.unjudged !== true, 'and it is not unjudged either — there is simply no directive');
    // No driver should ever have been written (nothing to run).
    const leaked = fs.readdirSync(root).filter((f) => f.startsWith('.__propgate_'));
    expect(leaked.length === 0, 'no driver written for a non-directive file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 7: GREEN no-op — a changed file with no directive at all ──
  {
    const file = 'export const plain = (n) => n + 1;\n';
    const root = mkrepo({ 'plain.mjs': file });
    const ctx = makeContext(root, new Map(), ['plain.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 7 (no directive)', r);
    expect(r.green && !r.unjudged && r.reds.length === 0, 'a file with no property directive is GREEN (no fact)');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 8: multi-arg property — GREEN (commutativity of +) ──
  {
    const file =
      '// @property fn=add invariant=result === input[1] + input[0] gen=int, int runs=50\n' +
      'export function add(a, b) { return a + b; }\n';
    const root = mkrepo({ 'add.mjs': file });
    const ctx = makeContext(root, new Map(), ['add.mjs']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 8 (multi-arg add commutativity)', r);
    expect(r.green && !r.unjudged, 'a true multi-arg property converges GREEN');
    expectCleanTree(root, 'add.mjs', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('');
  if (failures === 0) {
    console.log('PROOF PASS');
    process.exit(0);
  } else {
    console.log(`PROOF FAIL (${failures} assertion(s) failed)`);
    process.exit(1);
  }
}

void main();
