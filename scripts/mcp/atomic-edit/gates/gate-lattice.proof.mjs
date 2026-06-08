/**
 * gates/gate-lattice.proof.mjs — GAP #2 proof: the self-improving Gate Lattice is REAL.
 *
 * This proof drives the REAL engine module (engine-gate-registry.js, compiled to dist
 * by the integration build exactly like every other gates/*.proof.mjs) plus the REAL
 * executable GateModule (insecure-transport-gate.mjs, run as-authored — it is a leaf
 * ESM with no deps), in an ISOLATED temp repo so it never touches the live .atomic. It
 * asserts every load-bearing claim of the gap, none mocked:
 *
 *  1. THE EXECUTABLE GATE IS A REAL FACT, not a descriptor. insecure-transport-gate
 *     reds an edit that INTRODUCES `http://api.example-bank.com` (after, not before),
 *     GREENS localhost / private / w3.org-schema hosts, and GREENS a pre-existing
 *     insecure URL that the edit did not introduce (NEW-only delta). The gate exports
 *     `gate(ctx){return {id,status,fact}}` — we call it, we do not interpret intent.
 *
 *  2. THE MONOTONIC ADMISSION VERIFIER IS REAL (the old no-op is fixed).
 *     verifyMonotonicAdmission ADMITS a candidate gate that reds NONE of a known-good
 *     corpus, and REFUSES a candidate that reds one of them (returns ok:false with the
 *     exact conflict). This is the check the CLI's old admitGate could never perform
 *     (it read t.gateVerdict.requiresConvergence — a field absent on RegistryRun).
 *
 *  3. THE ENGINE WRITE PATH CONSULTS THE REGISTRY (an admitted gate BLOCKS).
 *     With the gate ADMITTED into .atomic/gates/registry.json, runRegistryGatesOverEditSync
 *     (the byte-floor twin server-helpers-io.atomicWrite calls) returns green:false +
 *     a red for a violating edit, and green:true for a clean one. An EMPTY registry is
 *     a transparent no-op (green:true, zero gates ran) — the additivity guarantee.
 *
 *  4. THE GAP SIGNAL IS "all-gates-passed vs prod-broke", not "ops without a verdict".
 *     detectIncidentCoverageGap intersects a recorded prod incident with a GREEN trace
 *     and returns that exact green-but-broken edit as the witness corpus; with no
 *     incident recorded it reports hasGap:false.
 *
 * Run AFTER a build (the integration phase compiles src → dist):
 *   node scripts/mcp/atomic-edit/gates/gate-lattice.proof.mjs
 * (DO NOT run mid-lattice — a concurrent build corrupts the shared dist.)
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
// dir = scripts/mcp/atomic-edit/gates ; dist lives at scripts/mcp/atomic-edit/dist
const distDir = path.join(dir, '..', 'src', 'dist');
const engine = await import(pathToFileURL(path.join(distDir, 'engine-gate-registry.js')).href);
const {
  runRegistryGatesOverEditSync,
  verifyMonotonicAdmission,
  detectIncidentCoverageGap,
  loadRegistry,
  saveRegistry,
} = engine;

// The REAL gate module, imported as-authored (leaf ESM, no deps → runs directly).
const gateMod = await import(pathToFileURL(path.join(dir, 'insecure-transport-gate.mjs')).href);
const insecureGate = typeof gateMod.gate === 'function' ? gateMod : gateMod.default;

let failures = 0;
function expect(cond, msg) {
  if (cond) console.log(`  [PASS] ${msg}`);
  else { failures += 1; console.log(`  [FAIL] ${msg}`); }
}

// ── isolated temp repo so the proof never touches the live .atomic ──
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-gate-lattice-'));
const gatePath = path.join(dir, 'insecure-transport-gate.mjs'); // absolute → loaded directly by the engine

function ctx(file, before, after) {
  return { file, before, after, repoRoot };
}

console.log('# 1. the executable GateModule states a real, NEW-only byte fact');
{
  const red = insecureGate.gate(ctx('src/api.ts', 'const x = 1;\n', "const url = 'http://api.example-bank.com/charge';\n"));
  expect(red.status === 'red' && red.id === 'insecure-transport', 'reds an INTRODUCED insecure http:// URL to a public host');

  const local = insecureGate.gate(ctx('src/dev.ts', '', "const url = 'http://localhost:3000/health';\n"));
  expect(local.status === 'green', 'greens http://localhost (exonerated dev host)');

  const schema = insecureGate.gate(ctx('src/xml.ts', '', "const ns = 'http://www.w3.org/2000/svg';\n"));
  expect(schema.status === 'green', 'greens http://www.w3.org schema/namespace URI (not transport)');

  const pre = insecureGate.gate(
    ctx('src/legacy.ts', "const u = 'http://api.example-bank.com/v1';\n", "const u = 'http://api.example-bank.com/v1';\nconst y = 2;\n"),
  );
  expect(pre.status === 'green', 'greens a PRE-EXISTING insecure URL the edit did not introduce (NEW-only delta)');
}

console.log('# 2. the monotonic admission verifier is real (admits clean, refuses regressive)');
{
  // a known-good corpus of GREEN edits (no insecure URL anywhere)
  const corpus = [
    { file: 'src/a.ts', before: '', after: "export const a = 'https://safe.example.com';\n", operationId: 'op_a' },
    { file: 'src/b.ts', before: 'const b = 1;\n', after: 'const b = 1;\nconst c = 2;\n', operationId: 'op_b' },
  ];
  const okV = verifyMonotonicAdmission(insecureGate, corpus, repoRoot);
  expect(okV.ok === true && okV.checked === 2, 'ADMITS a gate that reds none of the known-good corpus (checked all)');

  // a corpus that CONTAINS an edit the candidate would red → non-monotonic
  const regressiveCorpus = [
    ...corpus,
    { file: 'src/c.ts', before: '', after: "const u = 'http://api.example-bank.com/x';\n", operationId: 'op_c' },
  ];
  const badV = verifyMonotonicAdmission(insecureGate, regressiveCorpus, repoRoot);
  expect(badV.ok === false && badV.conflicts.length === 1 && badV.conflicts[0].operationId === 'op_c',
    'REFUSES admission when the gate would red a previously-green corpus edit (names the conflict)');
}

console.log('# 3. the engine write path consults the registry (admitted gate BLOCKS; empty = no-op)');
{
  // empty registry → transparent no-op
  const emptyRun = runRegistryGatesOverEditSync(ctx('src/api.ts', '', "const u = 'http://api.example-bank.com/y';\n"), repoRoot);
  expect(emptyRun.green === true && emptyRun.ran.length === 0, 'EMPTY registry is a no-op (green, zero gates ran) — additivity');

  // admit the gate into the isolated repo's registry, by absolute modulePath
  const reg = loadRegistry(repoRoot);
  reg.gates.push({ id: 'insecure-transport', modulePath: gatePath, intent: 'red introduced insecure-transport URLs', monotonic: true, admittedAgainst: 0, admittedAt: new Date().toISOString() });
  saveRegistry(repoRoot, reg);

  const blocked = runRegistryGatesOverEditSync(ctx('src/api.ts', '', "const u = 'http://api.example-bank.com/charge';\n"), repoRoot);
  expect(blocked.green === false && blocked.reds.some((r) => r.id === 'insecure-transport'),
    'an ADMITTED gate makes the write path RED a violating edit (it would block at the byte floor)');

  const clean = runRegistryGatesOverEditSync(ctx('src/api.ts', '', "const u = 'https://api.example-bank.com/charge';\n"), repoRoot);
  expect(clean.green === true && clean.ran.includes('insecure-transport'),
    'the same admitted gate GREENS a clean https:// edit (ran, did not block)');
}

console.log('# 4. the gap signal is all-gates-passed vs prod-broke');
{
  // record a GREEN trace for a file, then an incident on that same file
  const tracesDir = path.join(repoRoot, '.atomic', 'traces');
  fs.mkdirSync(tracesDir, { recursive: true });
  const greenFile = 'src/charge.ts';
  const greenAbs = path.join(repoRoot, greenFile);
  fs.mkdirSync(path.dirname(greenAbs), { recursive: true });
  const afterBytes = "export function charge(){ return fetch('http://pay.internal/charge'); }\n";
  fs.writeFileSync(greenAbs, afterBytes);
  const crypto = await import('node:crypto');
  const afterSha = crypto.createHash('sha256').update(afterBytes).digest('hex');
  fs.writeFileSync(path.join(tracesDir, 'op_green.json'), JSON.stringify({
    operationId: 'op_green', file: greenFile, afterSha256: afterSha,
    gateVerdict: { green: true, reds: [], didBlock: false }, // all built-in gates passed
    byteEffect: { beforeContent: '', afterContent: afterBytes },
  }));

  // no incident yet → no proven gap
  expect(detectIncidentCoverageGap(repoRoot).hasGap === false, 'no incident recorded → hasGap:false (a missing verdict is NOT a defect)');

  // record a prod incident on that green file
  const incDir = path.join(repoRoot, '.atomic', 'incidents');
  fs.mkdirSync(incDir, { recursive: true });
  fs.writeFileSync(path.join(incDir, 'incidents.jsonl'), JSON.stringify({ file: greenFile, symptom: 'charge endpoint timed out in prod' }) + '\n');

  const gap = detectIncidentCoverageGap(repoRoot);
  expect(gap.hasGap === true && gap.greenButBroken.length === 1 && gap.greenButBroken[0].file === greenFile,
    'a prod incident on a GREEN edit surfaces it as the green-but-broken witness corpus (the real gap)');
}

// ── cleanup ──
try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n${failures === 0 ? 'OK' : 'FAIL'} — gate-lattice proof (${failures} failure(s))`);
process.exit(failures === 0 ? 0 : 1);
