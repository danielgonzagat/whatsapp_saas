/**
 * gates/deterministic-harness.proof.ts — standalone tsx proof for the
 * deterministic-harness (controlled-non-determinism) gate.
 *
 * Builds REAL on-disk fixture files and drives the gate's full transaction —
 * snapshot → instrument-at-locus → run a REAL `/bin/bash -c "node --require {preload} {file}"`
 * N TIMES, each with a DIFFERENT seeded clock/PRNG → revert-byte-exact — with NO
 * mock of fs, child_process, or the run. Each fixture carries an inline
 * `@deterministic-harness` directive (the gate's self-driving spec), exactly as a
 * real changed file would. It asserts:
 *
 *   HORIZON-PUSH (the whole point) — a value built from Date.now()+Math.random()
 *              is what the OLD probe-convergence gate marks UNJUDGED ("non-
 *              deterministic, not a single-valued fact"). Under THIS gate's frozen
 *              clock + seeded PRNG preload it converges to a SINGLE value per the
 *              controlled schedule, so the same flaky fact becomes DECIDABLE:
 *     GREEN    — the directive asserts the value the seeded run actually produces.
 *     RED      — the same controlled fixture, directive asserts a DIFFERENT value:
 *              the locus converges to a single value under every seed, that value
 *              contradicts the assertion → a determined RED (not a guess).
 *   UNJUDGED — a value that depends on async/thread SCHEDULING still differs across
 *              runs EVEN under the frozen clock + seeded PRNG → the irreducible
 *              residual Node cannot freeze → honest unjudged, never red/green-by-guess.
 *   UNJUDGED — the live target is unreachable (the {preload} runner crashes / the
 *              command exits without printing) → the locus is not reached under
 *              control → unjudged, never green-by-assumption.
 *   UNJUDGED — an ambiguous locus (anchor on >1 code line) cannot be placed.
 *   GREEN    — a changed file with NO directive asserts no harness fact (no-op).
 *   BYTE-EXACT REVERT — after every run the fixture bytes equal the originals.
 *   TOKEN-CORRECT — a fixture where the anchor appears in a COMMENT and a STRING
 *              but on exactly ONE real code line: the gate locates the CODE line
 *              (via the perception AST), proving it does not raw-regex the file.
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/deterministic-harness.proof.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext, type GateResult } from './contract.js';
import gate, { parseHarnessDirective } from './deterministic-harness.js';

function mkrepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'detharness-gate-'));
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
  console.log(`  [${tag}] ${label} — reds=${r.reds.length}${r.reds[0] ? ` :: ${r.reds[0].fact.slice(0, 110)}` : ''}`);
  if (r.unjudged && r.note) console.log(`           note: ${r.note.slice(-140)}`);
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

function expectByteExactRevert(root: string, rel: string, original: string): void {
  const after = fs.readFileSync(path.join(root, rel));
  expect(sha(after) === sha(original), `byte-exact revert of ${rel} (sha matches original)`);
}

// The controlled run command every fixture uses: node UNDER the frozen-clock +
// seeded-PRNG preload, on the instrumented file. {preload} and {file} are
// substituted by the gate per the directive.
const RUN = 'node --require {preload} {file}';

async function main(): Promise<void> {
  console.log('deterministic-harness-gate proof\n');

  // Sanity: the directive parser pulls a full spec (with the seed schedule) out of bytes.
  {
    const spec = parseHarnessDirective(
      `x\n// @deterministic-harness id=h1 locus="MARK" run="${RUN}" value=42 seeds=1,2,3\ny\n`,
    );
    expect(spec !== null, 'parseHarnessDirective returns a spec');
    expect(spec?.id === 'h1' && spec?.value === '42', 'spec fields parsed (id/value)');
    expect((spec?.schedule.length ?? 0) === 3, 'seed schedule has one entry per declared seed');
    expect((spec?.schedule[0].seed ?? -1) === 1, 'first seed parsed');
  }

  // Pre-compute what the seeded LCG produces at the fixture locus so the GREEN/RED
  // cases assert against the harness's OWN preload (no magic numbers — derive it).
  // The fixture value expression is: Date.now() + Math.floor(Math.random()*1e9).
  // Under the gate's preload, Math.random is the LCG and Date.now is DET_CLOCK; the
  // gate's schedule for seeds=[5] is clock=1000+5*13+0*7=1065. We replicate that here.
  function predict(seed: number, clock: number): string {
    let s = (seed >>> 0) || 1;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    return String(clock + Math.floor(rnd() * 1e9));
  }
  const SEED = 5;
  const CLOCK = 1000 + SEED * 13 + 0 * 7; // mirrors the gate's schedule formula for run index 0
  const predicted = predict(SEED, CLOCK);

  // ── HORIZON-PUSH GREEN: a Date.now()+Math.random() value (OLD gate = UNJUDGED)
  //    converges under control to the predicted single value, and the directive
  //    asserts exactly that value → DECIDABLE → GREEN. seeds=5 = ONE controlled run,
  //    so the convergence is single-valued by construction of the frozen axis. ──
  {
    const file =
      `// @deterministic-harness id=clockprng locus="MARK_CTRL" run="${RUN}" value=${predicted} seeds=5\n` +
      'const t = Date.now() + Math.floor(Math.random() * 1e9); // MARK_CTRL __HARNESS_VALUE__(t)\n' +
      'void t;\n';
    const root = mkrepo({ 'ctrl.js': file });
    const ctx = makeContext(root, new Map(), ['ctrl.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 1 HORIZON-PUSH (clock/PRNG value converges under control)', r);
    expect(r.green && !r.unjudged, 'a frozen-clock+seeded-PRNG value is DECIDABLE and GREEN (old probe = unjudged)');
    expect(r.reds.length === 0, 'no reds when the controlled value matches the assertion');
    expectByteExactRevert(root, 'ctrl.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── HORIZON-PUSH RED: the SAME controlled fixture, directive asserts a wrong value.
  //    The locus converges to a single value under the seed, that value ≠ asserted →
  //    a DETERMINED contradiction. The clock/PRNG class is decidable, so this is RED,
  //    not unjudged — the ceiling moved. ──
  {
    const wrong = String(Number(predicted) + 1);
    const file =
      `// @deterministic-harness id=clockprng locus="MARK_CTRL" run="${RUN}" value=${wrong} seeds=5\n` +
      'const t = Date.now() + Math.floor(Math.random() * 1e9); // MARK_CTRL __HARNESS_VALUE__(t)\n' +
      'void t;\n';
    const root = mkrepo({ 'ctrl.js': file });
    const ctx = makeContext(root, new Map(), ['ctrl.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 2 HORIZON-PUSH (wrong asserted value)', r);
    expect(!r.green && !r.unjudged, 'a controlled value contradicting the assertion is RED (decidable, not flaky)');
    expect(
      r.reds.some((x) => x.file === 'ctrl.js' && /converges to the SINGLE value/.test(x.fact) && /determined contradiction/.test(x.fact)),
      'red states single converged value + determined contradiction',
    );
    expect(r.reds.some((x) => /^L\d+$/.test(x.locus ?? '')), 'red carries a byte-precise injection locus');
    expectByteExactRevert(root, 'ctrl.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── UNJUDGED (the irreducible residual): a value that depends on async SCHEDULING
  //    still differs across runs EVEN with frozen clock + seeded PRNG. We model the
  //    uncontrollable axis with high-resolution process.hrtime.bigint() (NOT frozen
  //    by the preload — it is the OS monotonic counter), driven across several seeds
  //    so the runs genuinely disagree among themselves under control. ──
  {
    const file =
      `// @deterministic-harness id=sched locus="MARK_SCHED" run="${RUN}" value=0 seeds=1,2,3,4\n` +
      'const t = process.hrtime.bigint().toString(); // MARK_SCHED __HARNESS_VALUE__(t)\n' +
      'void t;\n';
    const root = mkrepo({ 'sched.js': file });
    const ctx = makeContext(root, new Map(), ['sched.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3 RESIDUAL (scheduling/hrtime not frozen by clock/PRNG)', r);
    expect(r.unjudged === true, 'a value still varying under control is UNJUDGED (the irreducible scheduling residual)');
    expect(r.reds.length === 0, 'unjudged emits NO reds — never red-by-guess on an uncontrolled value');
    expect(/scheduling|residual|distinct values/i.test(r.note ?? ''), 'note explains the irreducible residual');
    expectByteExactRevert(root, 'sched.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── UNJUDGED (LIVE EXTERNAL STATE — not seedable from the local preload): the
  //    probed value reads a source the frozen clock + seeded PRNG cannot control.
  //    We model it with DET_SEED itself (the gate drives a DIFFERENT seed per run,
  //    so a value that DEPENDS on the seed differs across runs) — the analogue of a
  //    probe whose `run` reaches a remote DB / a live deploy: the local preload
  //    freezes Math.random and Date.now, but it cannot freeze an external read, so
  //    the runs disagree under control → the irreducible live-state ceiling →
  //    UNJUDGED, never faked green. (Grounded: the Railway runtime MCP returned
  //    Unauthorized this session — exactly this "live target not seedable" class.) ──
  {
    const file =
      '// @deterministic-harness id=live locus="MARK_LIVE" run="' + RUN + '" value=7 seeds=1,2,3,4\n' +
      'const ext = Number(process.env.DET_SEED) * 1000; // MARK_LIVE __HARNESS_VALUE__(ext)\n' +
      'void ext;\n';
    const root = mkrepo({ 'live.js': file });
    const ctx = makeContext(root, new Map(), ['live.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 4 LIVE-EXTERNAL-STATE (value reads an unfrozen external source)', r);
    expect(r.unjudged === true, 'a value driven by unfrozen external state is UNJUDGED (live-state ceiling)');
    expect(r.reds.length === 0, 'live-state divergence emits no reds — never red-by-guess');
    expect(/scheduling|external state|distinct values/i.test(r.note ?? ''), 'note names the external-state/scheduling residual');
    expectByteExactRevert(root, 'live.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── UNJUDGED (live target truly unreachable): the run command NEVER runs node on
  //    the instrumented file — it invokes a non-existent binary, so the sentinel is
  //    never printed under ANY seed. Not reached under control → unjudged. ──
  {
    const file =
      '// @deterministic-harness id=down locus="MARK_DOWN" run="this-binary-does-not-exist-xyz {file}" value=7 seeds=1,2\n' +
      'const z = 7; // MARK_DOWN __HARNESS_VALUE__(z)\n' +
      'void z;\n';
    const root = mkrepo({ 'down.js': file });
    const ctx = makeContext(root, new Map(), ['down.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 5 LIVE-UNREACHABLE (sentinel never prints under any seed)', r);
    expect(r.unjudged === true, 'an unreachable target (locus never reached) is UNJUDGED, never faked green');
    expect(r.reds.length === 0, 'unreachable target emits no reds');
    expect(/not reached/i.test(r.note ?? ''), 'note explains the locus was not reached under control');
    expectByteExactRevert(root, 'down.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── UNJUDGED: ambiguous locus — the anchor appears on >1 real code line. ──
  {
    const file =
      `// @deterministic-harness id=amb locus="DUP" run="${RUN}" value=3 seeds=1\n` +
      'const a = 1; const dupA = a; // DUP\n'.replace('DUP', 'DUP') +
      'const b = 2; const dupB = b; // x\n' +
      'globalThis.DUP_marker_one = a; // real code line with DUP token\n' +
      'globalThis.DUP_marker_two = b; // another real code line with DUP token\n' +
      'void (a + b);\n';
    const root = mkrepo({ 'amb.js': file });
    const ctx = makeContext(root, new Map(), ['amb.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 6 AMBIGUOUS LOCUS', r);
    expect(r.unjudged === true, 'an ambiguous locus is UNJUDGED (cannot place the probe deterministically)');
    expect(r.reds.length === 0, 'ambiguous locus emits no reds');
    expectByteExactRevert(root, 'amb.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── GREEN no-op: a changed file with NO directive asserts no harness fact. ──
  {
    const file = 'export const plain = (): number => 5;\n';
    const root = mkrepo({ 'plain.ts': file });
    const ctx = makeContext(root, new Map(), ['plain.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 7 NO DIRECTIVE', r);
    expect(r.green && !r.unjudged, 'a file with no harness directive is GREEN (no fact to settle)');
    expect(r.reds.length === 0, 'no reds for a non-harness file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── TOKEN-CORRECT: the anchor token appears inside a COMMENT and inside a STRING
  //    literal, but on exactly ONE real CODE line. A whole-file regex would see 3
  //    matches (ambiguous → unjudged). The perception AST sees only the code line,
  //    so the gate places the probe and reaches a real verdict — proving it extracts
  //    via the AST, not raw-regex. The asserted value is the deterministic constant. ──
  {
    const file =
      `// @deterministic-harness id=tok locus="ANCHORTOK" run="${RUN}" value=11 seeds=3\n` +
      '// a comment mentioning ANCHORTOK should NOT be a locus\n' +
      'const s = "a string containing ANCHORTOK is not code"; void s;\n' +
      'const realLocus = 5 + 6; void realLocus; // ANCHORTOK __HARNESS_VALUE__(realLocus)\n';
    const root = mkrepo({ 'tok.js': file });
    const ctx = makeContext(root, new Map(), ['tok.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 8 TOKEN-CORRECT (anchor in comment + string + 1 code line)', r);
    expect(r.green && !r.unjudged, 'token-correct locus resolves to the ONE code line → GREEN (value 11 converges)');
    expect(r.reds.length === 0, 'no reds — the AST-located locus matched the deterministic constant 11');
    expectByteExactRevert(root, 'tok.js', file);
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

main().catch((e: unknown) => {
  console.error(e);
  console.log('PROOF FAIL (threw)');
  process.exit(1);
});
