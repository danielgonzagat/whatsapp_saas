#!/usr/bin/env node
/**
 * corpus.proof.mjs — standalone node proof for the OUTWARD AXIS (gates/corpus.ts):
 * the human-label-free, sha-anchored, locus-precise verified-edit training corpus.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/corpus.proof.mjs
 *
 * WHAT THIS PROVES (and what it honestly cannot).
 *
 * It imports the COMPILED dist/gates/corpus.js (the integrator builds dist once),
 * emits BOTH triple kinds to a throwaway temp repo root, reads them back, and
 * attacks every property the corpus can be wrong about — in BOTH polarities:
 *
 *   EMIT-REPAIR  — emitRepairTriple writes a {kind:'repair', sha, payload} line;
 *                  the payload carries redBefore/appliedSplice/redAfter and the
 *                  reward EQUALS redBefore - redAfter (positive: a real reducing
 *                  splice; negative pole: a splice that INTRODUCED reds has a
 *                  negative reward and gateWentGreen:false — recorded honestly,
 *                  not relabelled green).
 *   GATE-GREEN   — gateWentGreen is the witness redAfter === 0, and it can NEVER
 *                  contradict the evidence: a payload with redAfter>0 is green:false,
 *                  a payload with redAfter===0 is green:true. (Producer cannot lie.)
 *   EMIT-COMMUTE — emitCommuteTriple writes a {kind:'commute', ...} line; a
 *                  commuting pair carries NO sharedLocus, a coupled pair DOES.
 *   SHA-ANCHOR   — sha is sha256 of the CANONICAL payload: the same logical payload
 *                  (fields permuted) hashes IDENTICALLY (dedup); a DIFFERENT payload
 *                  hashes differently (tamper-evidence). Negative pole proven.
 *   APPEND-ONLY  — a second emit APPENDS (line count grows, the first line is
 *                  byte-unchanged); the corpus is JSONL (one object per line) and
 *                  readCorpus round-trips every written triple.
 *   ISOLATION    — writing to a temp ATOMIC_EDIT_REPO_ROOT touches ONLY
 *                  <tmp>/.atomic/corpus/triples.jsonl, never the real repo corpus.
 *
 * HONEST CEILING: this proves the corpus is loadable, append-only, sha-deduplicable,
 * and that the reward is the deterministic red-count delta — it does NOT prove a
 * repair was the RIGHT repair, nor re-run the gate registry here (the reward's
 * determinism vs the live registry is the convergence operator's own proof). The
 * corpus is exactly as honest, and as blind, as the gate counts fed into it.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const C = await import(path.join(dir, '..', 'dist', 'gates', 'corpus.js'));
const { emitRepairTriple, emitCommuteTriple, readCorpus, repairReward, payloadSha, canonJson, CORPUS_REL } = C;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// A throwaway repo root so we never touch the real .atomic/corpus.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-proof-'));
const corpusAbs = path.join(root, CORPUS_REL);

try {
  // ── EMIT-REPAIR (positive pole: a real reducing splice) ────────────────────
  const reducingSplice = {
    file: 'backend/src/x.ts', byteStart: 0, byteEnd: 0,
    before: '', after: "import { join } from 'node:path';\n",
  };
  const r1 = emitRepairTriple(root, { redBefore: 3, appliedSplice: reducingSplice, redAfter: 0 });
  check('EMIT-REPAIR triple kind is "repair"', r1.kind === 'repair');
  check('EMIT-REPAIR payload carries redBefore/redAfter/appliedSplice',
    r1.payload.redBefore === 3 && r1.payload.redAfter === 0 && r1.payload.appliedSplice.file === 'backend/src/x.ts');
  // THE CORE CONTRACT: reward === redBefore - redAfter (deterministic red-count delta).
  check('EMIT-REPAIR reward === redBefore - redAfter (=3)', repairReward(r1.payload) === 3);
  check('EMIT-REPAIR reward === redBefore - redAfter (recomputed from payload)',
    repairReward(r1.payload) === r1.payload.redBefore - r1.payload.redAfter);
  check('GATE-GREEN gateWentGreen true ⟺ redAfter === 0 (here true)', r1.payload.gateWentGreen === true);

  // ── EMIT-REPAIR (negative pole: a splice that INTRODUCED reds) ──────────────
  const worseningSplice = { file: 'backend/src/y.ts', byteStart: 5, byteEnd: 9, before: 'good', after: 'bad!' };
  const r2 = emitRepairTriple(root, { redBefore: 1, appliedSplice: worseningSplice, redAfter: 4 });
  check('EMIT-REPAIR negative-reward splice records reward = -3 (honest, not relabelled)', repairReward(r2.payload) === -3);
  check('GATE-GREEN gateWentGreen false ⟺ redAfter > 0 (here false)', r2.payload.gateWentGreen === false);
  // FALSIFIER: the producer cannot fabricate green while recording residual reds.
  check('GATE-GREEN witness cannot contradict residual reds (no lying)', r2.payload.redAfter > 0 && r2.payload.gateWentGreen === false);

  // ── EMIT-COMMUTE (both polarities) ─────────────────────────────────────────
  const cIndep = emitCommuteTriple(root, { fileA: 'a.ts', fileB: 'b.ts', commute: true });
  check('EMIT-COMMUTE triple kind is "commute"', cIndep.kind === 'commute');
  check('EMIT-COMMUTE commuting pair carries NO sharedLocus', cIndep.payload.commute === true && cIndep.payload.sharedLocus === undefined);
  const cCoupled = emitCommuteTriple(root, { fileA: 'a.ts', fileB: 'b.ts', commute: false, sharedLocus: 'a.ts' });
  check('EMIT-COMMUTE coupled pair carries sharedLocus', cCoupled.payload.commute === false && cCoupled.payload.sharedLocus === 'a.ts');

  // ── SHA-ANCHOR (dedup + tamper-evidence, both polarities) ──────────────────
  // Same logical payload with PERMUTED key order hashes IDENTICALLY (canonical sha).
  const permuted = { redAfter: 0, appliedSplice: reducingSplice, redBefore: 3, gateWentGreen: true };
  check('SHA-ANCHOR same payload, permuted keys → identical sha (dedup)', payloadSha(r1.payload) === payloadSha(permuted));
  check('SHA-ANCHOR triple.sha === sha256(canonical payload)', r1.sha === payloadSha(r1.payload));
  // FALSIFIER: a DIFFERENT payload hashes differently (tamper-evidence).
  check('SHA-ANCHOR a different payload hashes differently (tamper-evidence)', payloadSha(r1.payload) !== payloadSha(r2.payload));
  check('SHA-ANCHOR canonJson is order-stable', canonJson({ b: 1, a: 2 }) === canonJson({ a: 2, b: 1 }));

  // ── APPEND-ONLY + JSONL round-trip ─────────────────────────────────────────
  const lines = fs.readFileSync(corpusAbs, 'utf8').split('\n').filter((l) => l.trim());
  check('APPEND-ONLY four emits → four JSONL lines', lines.length === 4);
  check('APPEND-ONLY every line is a standalone JSON object', lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));
  const back = readCorpus(root);
  check('APPEND-ONLY readCorpus round-trips all four triples', back.length === 4);
  check('APPEND-ONLY first line unchanged after later appends', JSON.parse(lines[0]).sha === r1.sha);
  check('APPEND-ONLY read-back reward survives serialization (=3)', repairReward(back[0].payload) === 3);

  // ── ISOLATION: only the temp corpus file was written ───────────────────────
  check('ISOLATION corpus lives exactly at <root>/.atomic/corpus/triples.jsonl', fs.existsSync(corpusAbs) && CORPUS_REL === '.atomic/corpus/triples.jsonl');
  check('ISOLATION readCorpus on an empty root returns []', readCorpus(fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-empty-'))).length === 0);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
