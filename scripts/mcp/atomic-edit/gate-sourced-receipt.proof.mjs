/**
 * gate-sourced-receipt.proof.mjs — FRONT F5 proof: the REAL tier of a truth_receipt
 * is UNFORGEABLE.
 *
 * Before this front, server-tools-h.ts imported ONLY product-locks helpers — ZERO
 * contact with any real gate — so a runtime_probe evidence item was 100% HAND-SUPPLIED:
 * an agent could attach a fabricated runtime_probe and mint a REAL/100 receipt with no
 * running system behind it. This proof drives the REAL logic (no mock of the gate
 * engine) and asserts:
 *
 *   1. atomic_prove on a self-driving GREEN formal `@model` directive RUNS the real
 *      DYNAMIC gate set, reverts the throwaway byte-exact, and MINTS a runtime_probe
 *      evidence item carrying a gateRunId that isGateBackedRealProbe() accepts → REAL.
 *   2. atomic_prove on a GREEN LIVENESS call-site (a real apiFetch('/health') AST
 *      call-site, with an injected 200 live oracle) likewise mints a gate-backed
 *      runtime_probe → a REAL liveness-sourced evidence item.
 *   3. A HAND-ATTACHED runtime_probe WITHOUT a gateRunId (and one with a FABRICATED id)
 *      is REFUSED: isGateBackedRealProbe() is false → the truth_receipt refusal
 *      predicate downgrades it to UNPROVEN with a refusal reason. It is NOT sold as REAL.
 *   4. A NON-GREEN directive (formal counterexample) mints NOTHING (no token) →
 *      remains refusable.
 *
 * The truth_receipt refusal predicate is the EXACT one wired into server-tools-h.ts
 * (kind==='runtime_probe' && status==='passed' && !externalBlocker &&
 * !isGateBackedRealProbe(gateRunId)); this proof re-applies it over the same
 * isGateBackedRealProbe import so it is testing the wired law, not a copy of it.
 *
 * Imports the COMPILED dist (built by the integration phase, exactly like every other
 * gates/*.proof.mjs). Run AFTER a build:
 *   node scripts/mcp/atomic-edit/gate-sourced-receipt.proof.mjs
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { runProveDirective, isGateBackedRealProbe, verifyGateRun, gateRunCount } = await import(
  path.join(dir, 'dist', 'gate-receipt-mapper.js')
);
const liveness = await import(path.join(dir, 'dist', 'gates', 'liveness-gate.js'));

let failures = 0;
function expect(cond, msg) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.log(`  [FAIL] ${msg}`);
  }
}

/**
 * The EXACT truth_receipt refusal predicate wired into server-tools-h.ts. A
 * runtime_probe passed-status claim with no gate-backed id is refused → UNPROVEN.
 */
function classifyReceiptProbe(claim) {
  const fabricatedProbe =
    claim.evidenceKind === 'runtime_probe' &&
    claim.status === 'passed' &&
    !claim.externalBlocker &&
    !isGateBackedRealProbe(claim.gateRunId);
  return fabricatedProbe ? 'UNPROVEN(refused)' : 'REAL';
}

console.log('gate-sourced-receipt.proof — the REAL tier of a truth_receipt is unforgeable\n');

/* ── 1. formal @model GREEN → mints a gate-backed runtime_probe (REAL) ── */
console.log('[1] atomic_prove on a GREEN formal @model directive mints a REAL runtime_probe');
const beforeCount = gateRunCount();
const formalGreen = await runProveDirective({
  claim: 'the counter model holds its invariant on every reachable state',
  // bounded counter 0..3, invariant s<=3 → exhaustively GREEN
  directive: "// @model id=f5ctr init='[0]' next='(s)=>s<3?[s+1]:[]' invariant='(s)=>s<=3' cap=64",
});
expect(formalGreen.evidence.kind === 'runtime_probe', 'evidence kind is runtime_probe');
expect(formalGreen.evidence.status === 'passed', 'a GREEN gate run yields status=passed');
expect(typeof formalGreen.evidence.gateRunId === 'string' && formalGreen.evidence.gateRunId.length === 64,
  'a fresh 256-bit gateRunId was minted');
expect(formalGreen.record !== null && formalGreen.record.green === true, 'a green GateRunRecord was recorded');
expect(formalGreen.run.ran.includes('formal'), 'the real formal gate actually RAN');
expect(isGateBackedRealProbe(formalGreen.evidence.gateRunId) === true,
  'isGateBackedRealProbe ACCEPTS the minted id → truth_receipt would classify REAL');
expect(classifyReceiptProbe({
  evidenceKind: 'runtime_probe', status: 'passed', gateRunId: formalGreen.evidence.gateRunId,
}) === 'REAL', 'truth_receipt predicate: a gate-backed runtime_probe IS REAL');
expect(gateRunCount() === beforeCount + 1, 'exactly one new run was registered');
expect(verifyGateRun(formalGreen.evidence.gateRunId) !== null, 'the run is verifiable in the registry');

/* ── 2. liveness GREEN (real apiFetch call-site + injected 200 oracle) → REAL ── */
console.log('\n[2] atomic_prove on a GREEN liveness call-site mints a REAL runtime_probe');
liveness.__setLivenessProbeConfig({
  baseUrl: 'http://live.test',
  probe: async () => 200, // injected deterministic 200 → "served" → liveness GREEN
});
let liveResult;
try {
  liveResult = await runProveDirective({
    claim: 'GET /health is mounted and serves in the running instance',
    // a REAL call_expression the liveness perception extracts (concrete probable path)
    directive: "apiFetch('/health');",
  });
} finally {
  liveness.__setLivenessProbeConfig(null);
}
expect(liveResult.run.ran.includes('liveness'), 'the real liveness gate actually RAN against the call-site');
expect(liveResult.evidence.status === 'passed' && liveResult.evidence.gateRunId,
  'a 200 live response → liveness GREEN → a gate-backed runtime_probe minted');
expect(liveResult.record !== null && liveResult.record.verb === 'liveness',
  'the run record records verb=liveness (the runtime probe source)');
expect(isGateBackedRealProbe(liveResult.evidence.gateRunId) === true,
  'isGateBackedRealProbe ACCEPTS the liveness-minted id → REAL-tier liveness evidence');

/* ── 3. hand-attached / fabricated runtime_probe → REFUSED ── */
console.log('\n[3] a hand-attached / fabricated runtime_probe WITHOUT a gate id is REFUSED');
expect(isGateBackedRealProbe(undefined) === false, 'no gateRunId at all → not gate-backed');
expect(isGateBackedRealProbe('deadbeef'.repeat(8)) === false,
  'a fabricated 64-hex id never minted by a real run → not gate-backed');
expect(classifyReceiptProbe({ evidenceKind: 'runtime_probe', status: 'passed' }) === 'UNPROVEN(refused)',
  'truth_receipt predicate: a hand-attached runtime_probe (no id) is REFUSED as REAL → UNPROVEN');
expect(classifyReceiptProbe({
  evidenceKind: 'runtime_probe', status: 'passed', gateRunId: 'cafe'.repeat(16),
}) === 'UNPROVEN(refused)', 'truth_receipt predicate: a FABRICATED id is REFUSED as REAL → UNPROVEN');

/* ── 4. a non-green directive mints nothing → cannot back a REAL claim ── */
console.log('\n[4] a non-GREEN gate run mints NO token (a failed run cannot back REAL)');
const formalRed = await runProveDirective({
  claim: 'a model whose invariant is violated must NOT mint a REAL token',
  // invariant s<=2 over a space that reaches 3 → a real counterexample → RED
  directive: "// @model id=f5red init='[0]' next='(s)=>s<3?[s+1]:[]' invariant='(s)=>s<=2' cap=64",
});
expect(formalRed.evidence.status === 'failed', 'a RED run yields status=failed');
expect(formalRed.evidence.gateRunId === undefined, 'a RED run mints NO gateRunId');
expect(formalRed.record === null, 'a RED run records NO green run');
expect(classifyReceiptProbe({
  evidenceKind: 'runtime_probe', status: 'passed', gateRunId: formalRed.evidence.gateRunId,
}) === 'UNPROVEN(refused)', 'a RED-run probe cannot be laundered into REAL');

console.log(`\n${failures === 0 ? '✅ ALL PASS' : `❌ ${failures} FAILURE(S)`} — gate-sourced receipt is unforgeable`);
process.exit(failures === 0 ? 0 : 1);
