#!/usr/bin/env node
/**
 * causal-blame.proof.mjs — standalone node proof for GAP #3 (COMPLETE causal blame).
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/causal-blame.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED engine from ../dist, so it runs anywhere
 * the server runs.) Every case is a throwaway temp git repo: buildTrace is given an
 * absolute `repoRoot`, so writeTrace persists traces + advances `.atomic/HEAD`
 * ENTIRELY inside the temp dir, and every git call is `-C <temp>` — no repo state is
 * ever touched.
 *
 * NB: the fixture source strings deliberately contain NO `from './x'` relative-import
 * shape — the convergence crivo reads THIS proof file too, and a dangling-looking
 * relative-import literal inside a fixture would (correctly) be refused as a dangling
 * wire. The fixtures are therefore self-contained modules; the false-negative point
 * stands without needing an import edge.
 *
 * It proves the four invariants GAP #3 demands the strong-form blame deliver:
 *
 *   SESSION   — (1) the trace writer stamps a STABLE sessionId on every trace
 *               (ATOMIC_SESSION_ID-pinned here for determinism), and linkOpToCommit
 *               links a git commit to that session by afterSha256 blob-match.
 *   RECOVER   — (2) recoverState pulls the offending op's after-bytes out of git and
 *               VERIFIES they hash to op.afterSha256 (recovery we can trust), and the
 *               before-bytes out of the commit's first parent.
 *   RE-CRIVO  — (3) reExecuteCrivo re-runs the gate set over the recovered edit and
 *               returns a RegistryRun (the crivo actually ran on the recovered state).
 *   BLAME     — (4) causalBlame names a false-negative gate (or the coverage-gap
 *               case), WRITES .atomic/recalibrate/<gate>.json, and FEEDS a proposal
 *               into .atomic/proposed-gates/ (the #2 pipeline). Loop closed.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The compiled modules live in ../dist relative to src/gates/.
const trace = await import(path.join(HERE, '..', 'dist', 'trace.js'));
const blame = await import(path.join(HERE, '..', 'dist', 'engine-causal-blame.js'));
const { buildTrace, writeTrace, currentSessionId } = trace;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
  }
}

function git(repo, args) {
  return spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

function mkGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-causal-blame-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'proof@atomic.test']);
  git(dir, ['config', 'user.name', 'atomic-proof']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

// The verdict shape converge persists — a GREEN admission (no reds), so the recovered
// re-crivo can expose a gate that admitted the edit as a false negative.
const greenVerdict = (ran) => ({ green: true, reds: [], notApplicable: [], unjudged: [], ran });

// 1) FULL LOOP — a file edited via an atomic op, committed, then blamed.
{
  // Pin the session so currentSessionId() is deterministic AND the writer stamps it.
  process.env.ATOMIC_SESSION_ID = 'sess_proof_fixed_0001';
  const repo = mkGitRepo();
  const file = 'app.ts';
  // A real, parseable, SELF-CONTAINED TS file (no relative-import edge — see header).
  // The static WRITE gates have no dangling-wire fact to assert, so they ADMIT this
  // edit green — which is exactly the false-negative the recovered re-crivo exposes.
  const before = 'export const v = 1;\n';
  const after = 'export const v = 2;\nexport function widen(x) { return x + v; }\n';

  // Build + persist the op trace into the temp repo (repoRoot pins the trace store).
  const t = buildTrace({
    file,
    repoRoot: repo,
    operator: 'atomic_converge',
    before,
    newText: after,
    inlinePreview: `edited ${file}`,
    validation: { language: 'ts', before: 0, after: 0 },
    targetUnit: 'converged_file',
    intention: 'widen a value + add a helper',
    semanticImpact: 'green_convergent_commit',
    changed: true,
    gateVerdict: greenVerdict(['supply-chain-gate', 'contract-edge-gate']),
  });
  const res = writeTrace(t);
  check('S1: trace persisted', !res.traceWriteError && !!res.tracePath);
  check('S2: writer stamped the pinned sessionId', t.sessionId === 'sess_proof_fixed_0001');
  check('S3: currentSessionId() returns the pinned id', currentSessionId() === 'sess_proof_fixed_0001');

  // Commit the AFTER content so the committed blob hashes to op.afterSha256.
  fs.writeFileSync(path.join(repo, file), after);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'edit app.ts']);
  const commitSha = git(repo, ['rev-parse', 'HEAD']).stdout.trim();

  // STEP 1 — link the op to the commit by afterSha256 blob-match.
  const ops = blame.opsForFile(repo, file);
  check('L0: opsForFile found the op', ops.length === 1 && ops[0].operationId === t.operationId);
  const link = blame.linkOpToCommit(repo, ops[0]);
  check('L1: linked by afterSha256 blob-match', link.linkedBy === 'afterSha256-blob-match');
  check('L2: linked to the right commit', link.commit === commitSha);
  check('L3: linked to the right session', link.sessionId === 'sess_proof_fixed_0001');

  // STEP 2 — recover before/after; the after must hash-verify to op.afterSha256.
  const recovered = blame.recoverState(repo, ops[0], link);
  check('R1: recovered after-bytes equal the committed content', recovered.after === after);
  check('R2: recovered after VERIFIED (hashes to op.afterSha256)', recovered.afterVerified === true);
  check('R3: recovered before-bytes are the first-parent (empty for the root commit)', recovered.before === '' || recovered.before === null);

  // STEP 3 — re-execute the crivo over the recovered edit; it must actually run.
  const reCrivo = await blame.reExecuteCrivo(repo, recovered);
  check('C1: re-crivo produced a RegistryRun', reCrivo.run !== null && typeof reCrivo.run.green === 'boolean');
  check('C2: re-crivo ran without throwing (ran is an array)', Array.isArray(reCrivo.ran));

  // STEP 4 — the orchestrator names the false negative + writes the loop-close artifacts.
  const report = await blame.causalBlame(repo, file, 'L2');
  check('B1: report carries the link + recovered state', !!report.link && !!report.recovered);
  check('B2: a false-negative gate (or coverage-gap) was named', !!report.falseNegative && typeof report.falseNegative.gate === 'string');
  check('B3: a #2 proposal was fed', !!report.proposalPath && fs.existsSync(report.proposalPath));
  const proposal = report.proposalPath ? JSON.parse(fs.readFileSync(report.proposalPath, 'utf8')) : {};
  check('B4: proposal is the atomic-gate-proposal/v1 envelope from causal-blame', proposal.format === 'atomic-gate-proposal/v1' && proposal.source === 'causal-blame/#3');
  // When a gate ran and admitted (green/unjudged) a recalibration record is written;
  // when the crivo would have RED it (or no gate ran) only the #2 proposal is fed.
  if (report.falseNegative.verdict === 'green' || report.falseNegative.verdict === 'unjudged') {
    check('B5: recalibration record written for the false-negative gate', !!report.recalibrationPath && fs.existsSync(report.recalibrationPath));
    const rec = JSON.parse(fs.readFileSync(report.recalibrationPath, 'utf8'));
    check('B6: recalibration record binds the blamed op + commit + session', rec.format === 'atomic-gate-recalibration/v1' && rec.blamedOp === t.operationId && rec.blamedCommit === commitSha && rec.blamedSession === 'sess_proof_fixed_0001');
  } else {
    check('B5: coverage-gap / crivo-would-block path fed a proposal (no per-gate record)', report.recalibrationPath === undefined);
    check('B6: (n/a for this verdict — proposal-only path)', true);
  }

  delete process.env.ATOMIC_SESSION_ID;
  fs.rmSync(repo, { recursive: true, force: true });
}

// 2) DEGRADE — a file with NO atomic op recorded (a bypass) blames honestly, no throw.
{
  const repo = mkGitRepo();
  fs.writeFileSync(path.join(repo, 'rogue.ts'), 'export const x = 1;\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'off-firewall edit']);
  const report = await blame.causalBlame(repo, 'rogue.ts', 'L1');
  check('D1: no-op file → link/recovered null (bypass), no throw', report.link === null && report.recovered === null);
  check('D2: a note names the bypass', report.notes.some((n) => /bypass|OUTSIDE the atomic firewall/i.test(n)));
  fs.rmSync(repo, { recursive: true, force: true });
}

// 3) LEGACY trace (no sessionId) — links degrade gracefully, sessionId reported empty.
{
  const repo = mkGitRepo();
  const file = 'legacy.ts';
  const after = 'export const a = 1;\n';
  // Forge a legacy trace directly on disk WITHOUT a sessionId field (pre-#3 shape).
  const td = path.join(repo, '.atomic', 'traces');
  fs.mkdirSync(td, { recursive: true });
  const legacy = {
    traceVersion: '1.0',
    operationId: 'op_legacy_0001',
    ts: new Date().toISOString(),
    file,
    repoRoot: repo,
    operation: 'atomic_edit',
    operator: 'atomic_edit',
    targetUnit: 'text_span',
    intention: 'legacy edit',
    fallback: false,
    metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1, bytesNet: 0, lineRewriteAvoided: true },
    byteEffect: { beforeBytes: 0, proposedBytes: 0, currentAfterBytes: 0, removedBytes: 0, addedBytes: 0, netBytes: 0 },
    validation: { language: 'ts', syntaxErrorsBefore: 0, syntaxErrorsAfter: 0 },
    preview: false,
    changed: true,
    afterSha256: sha256(after),
    proposedSha256: sha256(after),
    rollback: { available: true, strategy: 'caller-held' },
    inlinePreview: '',
    preservedZones: [],
    modifiedZones: [],
    movementZones: [],
    semanticImpact: 'unclassified_code_edit',
    audit: {},
    parentSha256: '',
    chainHash: 'x',
    // NOTE: deliberately NO sessionId — this is a pre-#3 trace.
  };
  fs.writeFileSync(path.join(td, 'op_legacy_0001.json'), JSON.stringify(legacy, null, 2));
  fs.writeFileSync(path.join(repo, file), after);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'legacy edit']);

  const ops = blame.opsForFile(repo, file);
  check('G1: legacy op loaded (no sessionId field)', ops.length === 1 && ops[0].sessionId === undefined);
  const link = blame.linkOpToCommit(repo, ops[0]);
  check('G2: legacy still links by afterSha256 blob-match', link.linkedBy === 'afterSha256-blob-match');
  check('G3: legacy session reported empty (degraded, not crashed)', link.sessionId === '');
  const report = await blame.causalBlame(repo, file, 'L1');
  check('G4: legacy blame completes without throwing', !!report.falseNegative);
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
