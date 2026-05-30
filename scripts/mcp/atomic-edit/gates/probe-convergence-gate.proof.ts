/**
 * gates/probe-convergence-gate.proof.ts — standalone tsx proof for the
 * probe-convergence (DAP-dissolved) gate.
 *
 * Builds REAL on-disk fixture files and drives the gate's full transaction —
 * snapshot → instrument-at-locus → run a REAL `/bin/bash -c "node …"` TWICE →
 * revert-byte-exact — with NO mock of fs, child_process, or the run. The fixtures
 * carry an inline `@probe-convergence` directive (the gate's self-driving spec),
 * exactly as a real changed file would. Then it asserts:
 *
 *   RED      — a file whose locus IS deterministically reached, but the directive
 *              asserts reached=false → the observed reached-bit contradicts the
 *              assertion → a precise GateRed.
 *   RED      — a file whose locus is reached with a deterministic value, but the
 *              directive asserts a DIFFERENT value → value-mismatch GateRed.
 *   GREEN    — the SAME file, with the directive asserting the TRUE reached-bit
 *              (and matching value) → converges green, zero reds.
 *   GREEN    — a locus that genuinely is NOT reached (guarded by a false branch)
 *              with reached=false asserted → the absence is a determined fact.
 *   UNJUDGED — a NON-DETERMINISTIC run (prints Date.now()/Math.random at the locus)
 *              → the two runs disagree → not a single-valued fact → the honest
 *              ceiling (race/clock/flaky/live-state), never red/green-by-guess.
 *   BYTE-EXACT REVERT — after every run, the fixture file's bytes are identical to
 *              the originals (the ephemeral instrumentation was fully reverted).
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/probe-convergence-gate.proof.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext, type GateResult } from './contract.js';
import gate, { parseProbeDirective } from './probe-convergence-gate.js';

function mkrepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-gate-'));
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

/** Assert the fixture file is byte-identical to its original content after a gate run. */
function expectByteExactRevert(root: string, rel: string, original: string): void {
  const after = fs.readFileSync(path.join(root, rel));
  expect(sha(after) === sha(original), `byte-exact revert of ${rel} (sha matches original)`);
}

async function main(): Promise<void> {
  console.log('probe-convergence-gate proof\n');

  // Sanity: the directive parser pulls a full spec out of bytes.
  {
    const spec = parseProbeDirective(
      'x\n// @probe-convergence id=p1 locus="MARK" run="node {file}" reached=true value=42\ny\n',
    );
    expect(spec !== null, 'parseProbeDirective returns a spec');
    expect(spec?.id === 'p1' && spec?.reached === true && spec?.value === '42', 'spec fields parsed (id/reached/value)');
  }

  // ── CASE 1: RED — locus IS reached deterministically, but directive asserts reached=false ──
  {
    const file =
      '// @probe-convergence id=reach1 locus="MARK_REACHED" run="node {file}" reached=false\n' +
      'function go() {\n' +
      '  // MARK_REACHED — this line always runs\n' +
      '  return 1;\n' +
      '}\n' +
      'go();\n';
    const root = mkrepo({ 'reached.js': file });
    const ctx = makeContext(root, new Map(), ['reached.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 1 (reached but asserts reached=false)', r);
    expect(!r.green && !r.unjudged, 'contradicted reached-bit is RED');
    expect(r.reds.some((x) => x.file === 'reached.js' && /REACHED/.test(x.fact)), 'red names file + states control REACHED');
    expect(r.reds.some((x) => /^L\d+$/.test(x.locus ?? '')), 'red carries a byte-precise injection locus');
    expectByteExactRevert(root, 'reached.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 2: GREEN — SAME file, directive asserts the TRUE reached-bit ──
  {
    const file =
      '// @probe-convergence id=reach1 locus="MARK_REACHED" run="node {file}" reached=true\n' +
      'function go() {\n' +
      '  // MARK_REACHED — this line always runs\n' +
      '  return 1;\n' +
      '}\n' +
      'go();\n';
    const root = mkrepo({ 'reached.js': file });
    const ctx = makeContext(root, new Map(), ['reached.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 2 (reached, asserts reached=true)', r);
    expect(r.green && !r.unjudged, 'true reached-bit converges GREEN');
    expect(r.reds.length === 0, 'no reds when the fact matches the assertion');
    expectByteExactRevert(root, 'reached.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3: RED — reached with a deterministic VALUE that mismatches the assertion ──
  // The author marks the in-scope expression with __PROBE_VALUE__(<expr>) on the
  // anchor line; the gate prints whatever it resolves to (here, 7).
  {
    const file =
      '// @probe-convergence id=val1 locus="MARK_VAL" run="node {file}" reached=true value=9\n' +
      'const x = 3 + 4; // MARK_VAL __PROBE_VALUE__(x)\n' +
      'void x;\n';
    const root = mkrepo({ 'value.js': file });
    const ctx = makeContext(root, new Map(), ['value.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3 (value 7 observed, asserts value=9)', r);
    expect(!r.green && !r.unjudged, 'value mismatch is RED');
    expect(r.reds.some((x) => /value '7'/.test(x.fact) && /asserts value='9'/.test(x.fact)), 'red states observed 7 vs asserted 9');
    expectByteExactRevert(root, 'value.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3b: GREEN — same value probe, now the assertion matches the observed value ──
  {
    const file =
      '// @probe-convergence id=val1 locus="MARK_VAL" run="node {file}" reached=true value=7\n' +
      'const x = 3 + 4; // MARK_VAL __PROBE_VALUE__(x)\n' +
      'void x;\n';
    const root = mkrepo({ 'value.js': file });
    const ctx = makeContext(root, new Map(), ['value.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3b (value 7 observed, asserts value=7)', r);
    expect(r.green && !r.unjudged, 'matching value converges GREEN');
    expectByteExactRevert(root, 'value.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 4: GREEN — a locus genuinely NOT reached (false branch) with reached=false ──
  // The injected print sits inside a branch that never executes, so the sentinel
  // never appears in BOTH runs → observed reached=false → matches the assertion.
  {
    const file =
      '// @probe-convergence id=unreached1 locus="MARK_DEAD" run="node {file}" reached=false\n' +
      'function go(flag) {\n' +
      '  if (flag) {\n' +
      '    return 1; // MARK_DEAD — only runs when flag is truthy\n' +
      '  }\n' +
      '  return 0;\n' +
      '}\n' +
      'go(false);\n';
    const root = mkrepo({ 'dead.js': file });
    const ctx = makeContext(root, new Map(), ['dead.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 4 (dead branch, asserts reached=false)', r);
    expect(r.green && !r.unjudged, 'a genuinely-unreached locus with reached=false is GREEN');
    expect(r.reds.length === 0, 'no reds — the absence of control flow is a determined fact');
    expectByteExactRevert(root, 'dead.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 5: UNJUDGED (the honest ceiling) — NON-DETERMINISTIC value at the locus ──
  // The probed expression is Date.now()+Math.random(): the two runs disagree, so
  // the gate refuses to settle on a single-valued fact. This is the brutal ceiling.
  {
    const file =
      '// @probe-convergence id=flaky1 locus="MARK_FLAKY" run="node {file}" reached=true value=123\n' +
      'const t = Date.now() + Math.floor(Math.random() * 1e9); // MARK_FLAKY __PROBE_VALUE__(t)\n' +
      'void t;\n';
    const root = mkrepo({ 'flaky.js': file });
    const ctx = makeContext(root, new Map(), ['flaky.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 5 (non-deterministic value)', r);
    expect(r.unjudged === true, 'non-deterministic execution is UNJUDGED (the honest ceiling)');
    expect(r.reds.length === 0, 'unjudged emits NO reds — never red-by-guess');
    expect(/non-deterministic/i.test(r.note ?? ''), 'note explains the non-determinism ceiling');
    expectByteExactRevert(root, 'flaky.js', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 6: GREEN (no-op) — a changed file with NO directive asserts no fact ──
  {
    const file = 'export const plain = (): number => 5;\n';
    const root = mkrepo({ 'plain.ts': file });
    const ctx = makeContext(root, new Map(), ['plain.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 6 (no directive)', r);
    expect(r.green && !r.unjudged, 'a file with no probe directive is GREEN (no fact to settle)');
    expect(r.reds.length === 0, 'no reds for a non-probe file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 7: UNJUDGED — ambiguous locus (anchor matches >1 line) cannot be placed ──
  {
    const file =
      '// @probe-convergence id=amb1 locus="DUP" run="node {file}" reached=true\n' +
      'const a = 1; // DUP\n' +
      'const b = 2; // DUP\n' +
      'void (a + b);\n';
    const root = mkrepo({ 'amb.js': file });
    const ctx = makeContext(root, new Map(), ['amb.js']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 7 (ambiguous locus)', r);
    expect(r.unjudged === true, 'an ambiguous locus is UNJUDGED (cannot place the probe)');
    expect(r.reds.length === 0, 'ambiguous locus emits no reds');
    expectByteExactRevert(root, 'amb.js', file);
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
