/**
 * gates/formal-gate.proof.ts — standalone tsx proof for the formal (bounded
 * model-checking, TLA+/TLC-dissolved) gate.
 *
 * Builds REAL on-disk fixture files carrying an inline `@model` directive (the
 * gate's self-driving spec) and drives the gate's full transaction — compile a
 * harness into os.tmpdir → run a REAL `node` BFS enumeration TWICE → clean up —
 * with NO mock of fs, child_process, or the enumeration. Then it asserts:
 *
 *   RED      — a finite counter model (states 0..∞ via s→[s+1] gated to stop, with
 *              invariant s<=4) whose reachable space DOES contain a state violating
 *              the invariant → a concrete COUNTEREXAMPLE state is the red witness.
 *   GREEN    — the SAME shape but the invariant holds on EVERY reachable state
 *              (s<=5 over a closure that stops at 5) → ∀ s ∈ Reachable. INV(s),
 *              bounded for-all certainty, zero reds.
 *   GREEN    — a genuinely CLOSED small space (mod-4 ring s→[(s+1)%4]) with an
 *              invariant true on all 4 states → the closure closes at 4 states and
 *              all satisfy → green (a real, fully-enumerated for-all).
 *   UNJUDGED — a model whose reachable space EXCEEDS a tiny cap before closing →
 *              CAP → too large to exhaustively enumerate within the bound → cannot
 *              claim ∀ → honest unjudged, never green-by-assumption.
 *   UNJUDGED — a NON-DETERMINISTIC transition (Math.random successor) → the two
 *              runs disagree → not a single-valued for-all fact → the honest
 *              ceiling, never red/green-by-guess.
 *   UNJUDGED — a MALFORMED / unrunnable model (next is not a function) → ERR →
 *              honest unjudged.
 *   GREEN    — a changed file with NO `@model` directive asserts no for-all fact.
 *   READ-ONLY — the fixture source file's bytes are sha256-identical after every
 *              gate run (the gate never mutates the repo tree — firewall law).
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/formal-gate.proof.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext, type GateResult } from './contract.js';
import gate, { parseModelDirective } from './formal-gate.js';

function mkrepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formal-gate-'));
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

/** Assert the fixture source file is byte-identical to its original content (gate is read-only on the repo). */
function expectReadOnly(root: string, rel: string, original: string): void {
  const after = fs.readFileSync(path.join(root, rel));
  expect(sha(after) === sha(original), `read-only on repo: ${rel} bytes identical after the model check`);
}

async function main(): Promise<void> {
  console.log('formal-gate proof\n');

  // Sanity: the directive parser pulls a full model spec out of bytes.
  {
    const spec = parseModelDirective(
      "x\n// @model id=m1 init='[0]' next='(s)=>s<3?[s+1]:[]' invariant='(s)=>s<3' cap=64\ny\n",
    );
    expect(spec !== null, 'parseModelDirective returns a spec');
    expect(
      spec?.id === 'm1' && spec?.init === '[0]' && spec?.cap === 64 && /s\+1/.test(spec?.next ?? ''),
      'spec fields parsed (id/init/next/invariant/cap)',
    );
  }

  // ── CASE 1: RED — a reachable state violates the invariant (concrete counterexample) ──
  // states 0→1→2→3→4→5 (stops at 5); invariant asserts s<=4, but state 5 is reached.
  {
    const file =
      "// @model id=cex1 init='[0]' next='(s)=>s<5?[s+1]:[]' invariant='(s)=>s<=4' cap=64\n" +
      'export const counter = (n: number): number => n + 1;\n';
    const root = mkrepo({ 'counter.ts': file });
    const ctx = makeContext(root, new Map(), ['counter.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 1 (invariant s<=4, state 5 reachable)', r);
    expect(!r.green && !r.unjudged, 'a reachable invariant violation is RED');
    expect(r.reds.some((x) => x.file === 'counter.ts' && /counterexample/.test(x.fact)), 'red names file + calls it a counterexample');
    expect(r.reds.some((x) => /state 5\b/.test(x.fact)), 'red carries the CONCRETE counterexample state (5)');
    expect(r.reds.some((x) => x.locus === 'cex1'), 'red locus is the model id');
    expectReadOnly(root, 'counter.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 2: GREEN — invariant holds on EVERY reachable state (bounded for-all) ──
  // SAME closure (0..5), invariant s<=5 → holds for all 6 reachable states.
  {
    const file =
      "// @model id=fa1 init='[0]' next='(s)=>s<5?[s+1]:[]' invariant='(s)=>s<=5' cap=64\n" +
      'export const counter = (n: number): number => n + 1;\n';
    const root = mkrepo({ 'counter.ts': file });
    const ctx = makeContext(root, new Map(), ['counter.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 2 (invariant s<=5 over closure 0..5)', r);
    expect(r.green && !r.unjudged, 'invariant true on every reachable state converges GREEN (∀ s. INV(s))');
    expect(r.reds.length === 0, 'no reds when the bounded for-all holds');
    expectReadOnly(root, 'counter.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 3: GREEN — a genuinely CLOSED ring (mod-4) fully enumerated, all satisfy ──
  // s→[(s+1)%4] from {0} reaches exactly {0,1,2,3}; invariant s>=0 && s<4 holds on all.
  {
    const file =
      "// @model id=ring1 init='[0]' next='(s)=>[(s+1)%4]' invariant='(s)=>s>=0 && s<4' cap=64\n" +
      'export const tick = (s: number): number => (s + 1) % 4;\n';
    const root = mkrepo({ 'ring.ts': file });
    const ctx = makeContext(root, new Map(), ['ring.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 3 (mod-4 ring, invariant 0<=s<4)', r);
    expect(r.green && !r.unjudged, 'a fully-enumerated closed ring with a holding invariant is GREEN');
    expect(r.reds.length === 0, 'no reds — the entire 4-state closure was walked');
    expectReadOnly(root, 'ring.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 4: UNJUDGED — reachable space exceeds a tiny cap before closing ──
  // s→[s+1] never terminates; with cap=8 the visited set blows past the bound → CAP.
  {
    const file =
      "// @model id=big1 init='[0]' next='(s)=>[s+1]' invariant='(s)=>s>=0' cap=8\n" +
      'export const grow = (n: number): number => n + 1;\n';
    const root = mkrepo({ 'big.ts': file });
    const ctx = makeContext(root, new Map(), ['big.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 4 (unbounded growth, cap=8)', r);
    expect(r.unjudged === true, 'a space exceeding the cap is UNJUDGED (cannot claim ∀ past the bound)');
    expect(r.reds.length === 0, 'cap-exceeded emits NO reds — never green/red-by-assumption');
    expect(/exceeded cap/i.test(r.note ?? ''), 'note explains the bound ceiling');
    expectReadOnly(root, 'big.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 5: UNJUDGED (the honest ceiling) — NON-DETERMINISTIC transition relation ──
  // The reachable closure is always exactly TWO states {0, X}, but the VALUE X is a
  // fresh random integer each run, so the two exhaustive enumerations reach the same
  // SIZE yet a DIFFERENT state SET. The gate's order-independent set fingerprint
  // (not just the count) detects the disagreement → not a single-valued for-all fact
  // → unjudged (the race/clock/live-state ceiling). Collision probability ≈ 1e-9.
  {
    const file =
      "// @model id=nd1 init='[0]' next='(s)=>s===0?[1+Math.floor(Math.random()*1000000000)]:[]' invariant='(s)=>s>=0' cap=200000\n" +
      'export const flaky = (n: number): number => n + 1;\n';
    const root = mkrepo({ 'flaky.ts': file });
    const ctx = makeContext(root, new Map(), ['flaky.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 5 (non-deterministic successors)', r);
    expect(r.unjudged === true, 'a non-deterministic model is UNJUDGED (the honest ceiling)');
    expect(r.reds.length === 0, 'non-determinism emits NO reds — never red-by-guess');
    expect(/non-deterministic/i.test(r.note ?? ''), 'note explains the non-determinism ceiling');
    expectReadOnly(root, 'flaky.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 6: UNJUDGED — a malformed / unrunnable model (next is not a function) ──
  {
    const file =
      "// @model id=bad1 init='[0]' next='42' invariant='(s)=>true' cap=64\n" +
      'export const x = (): number => 1;\n';
    const root = mkrepo({ 'bad.ts': file });
    const ctx = makeContext(root, new Map(), ['bad.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 6 (malformed next)', r);
    expect(r.unjudged === true, 'an unrunnable model is UNJUDGED');
    expect(r.reds.length === 0, 'malformed model emits no reds');
    expect(/unrunnable/i.test(r.note ?? ''), 'note states the model is unrunnable');
    expectReadOnly(root, 'bad.ts', file);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 7: GREEN (no-op) — a changed file with NO @model directive asserts no fact ──
  {
    const file = 'export const plain = (): number => 5;\n';
    const root = mkrepo({ 'plain.ts': file });
    const ctx = makeContext(root, new Map(), ['plain.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 7 (no directive)', r);
    expect(r.green && !r.unjudged, 'a file with no @model directive is GREEN (no for-all fact to settle)');
    expect(r.reds.length === 0, 'no reds for a non-model file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // ── CASE 8: GREEN — a richer state shape (objects) fully enumerated ──
  // A 2-bit flag pair toggled independently: 4 reachable states {a,b ∈ {0,1}};
  // invariant: a and b are always 0 or 1 → holds on the entire closure.
  {
    const file =
      "// @model id=bits1 init='[{\"a\":0,\"b\":0}]' " +
      "next='(s)=>[{a:1-s.a,b:s.b},{a:s.a,b:1-s.b}]' " +
      "invariant='(s)=>(s.a===0||s.a===1)&&(s.b===0||s.b===1)' cap=64\n" +
      'export const toggle = (): number => 0;\n';
    const root = mkrepo({ 'bits.ts': file });
    const ctx = makeContext(root, new Map(), ['bits.ts']);
    const r = (await gate.run(ctx)) as GateResult;
    show('CASE 8 (object state, 4-state closure)', r);
    expect(r.green && !r.unjudged, 'an object-valued finite model with a holding invariant is GREEN');
    expect(r.reds.length === 0, 'no reds — all 4 reachable {a,b} states satisfy the invariant');
    expectReadOnly(root, 'bits.ts', file);
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
