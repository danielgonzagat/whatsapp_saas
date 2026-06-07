#!/usr/bin/env node
/**
 * proof-carrying.proof.mjs — standalone node proof for GAP #1: PROOF-CARRYING EDITS
 * with RE-EXECUTION. It proves the five deliverables the strong claim requires, over
 * the COMPILED re-exec core (dist/engine-proof-reexec.js) — the SAME functions the
 * producer uses to BUILD a proof and the verifier uses to CHECK it (no drift-prone
 * second re-implementation):
 *
 *   (1) RE-EXEC      — reexecValidate re-runs engine.validate over the embedded before/
 *                       after snapshot; an HONEST verdict reproduces, a FORGED verdict
 *                       (recorded ok:true over content that actually regresses) is caught,
 *                       and a SWAPPED after-content is caught.
 *   (2) MERKLE       — buildMerkleProof emits a leaf + inclusion path that verifyMerkleProof
 *                       re-derives the root from; tampering the leaf or a path sibling breaks
 *                       it; every leaf in a multi-op session is independently provable.
 *   (3) gateRunId    — gateRunIdOf is deterministic (same triple → same id), collision-free
 *                       across distinct verdicts/content, and re-attribution-proof.
 *   (4) SEAL         — sealState/verifySeal bind the whole proof; editing ANY sealed field
 *                       (root/leaf/gateRunId/chainHash/reexec) breaks the recompute. Self
 *                       seals reproduce keylessly; env seals need the shared key.
 *   (5) DECISION TREE — decisionTreeOf flattens a RegistryRun into one node per gate with
 *                       name + ran/red/unjudged/notApplicable + fact.
 *
 * Run (DO NOT run mid-lattice — a concurrent build corrupts the shared dist):
 *   node scripts/mcp/atomic-edit/build.mjs \
 *     && node scripts/mcp/atomic-edit/gates/proof-carrying.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED module, so it runs anywhere the server runs.)
 * Pure in-memory: no repo state, no .atomic writes — every input is constructed here.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
// The re-exec core compiles to src/dist/; this proof lives in gates/, a sibling of src/.
// Try the canonical src/dist first, then a flat ../dist, so the proof runs under either layout.
const candidates = [
  path.join(dir, '..', 'src', 'dist', 'engine-proof-reexec.js'),
  path.join(dir, '..', 'dist', 'engine-proof-reexec.js'),
];
const distPath = candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
const rx = await import(pathToFileURL(distPath).href);
const {
  buildSnapshot,
  reexecValidate,
  merkleRoot,
  buildMerkleProof,
  verifyMerkleProof,
  gateRunIdOf,
  decisionTreeOf,
  sealState,
  verifySeal,
  buildReexecProofBody,
} = rx;

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

const greenVerdict = (ran) => ({ green: true, reds: [], notApplicable: [], unjudged: [], ran });

// ── (1) RE-EXEC: re-run engine.validate over the embedded snapshot ──────────────────
{
  // An honest TS edit: valid before, valid after → validate ok, recorded verdict reproduces.
  const before = 'export const x = 1;\n';
  const after = 'export const x = 2;\n';
  const snap = buildSnapshot('a.ts', before, after);
  // Recompute the canonical recorded validation the producer would store.
  const recorded = { language: 'ts', before: 0, after: 0, ok: true };
  const r1 = reexecValidate(snap, recorded, snap.afterSha256);
  check('R1: honest edit re-executes and verdict reproduces', r1.reproduces === true && r1.verdictReproduces === true);
  check('R1b: re-exec recomputed validate is ok over valid content', r1.recomputed.ok === true);

  // A FORGED verdict: the after-content actually REGRESSES (introduces a syntax error),
  // but the producer recorded ok:true. Re-exec re-runs validate and catches the lie.
  const badAfter = 'export const y = (;\n'; // broken TS
  const snapBad = buildSnapshot('b.ts', before, badAfter);
  const forged = { language: 'ts', before: 0, after: 0, ok: true }; // claims clean
  const r2 = reexecValidate(snapBad, forged, snapBad.afterSha256);
  check('R2: forged ok:true over regressing content does NOT reproduce', r2.reproduces === false);
  check('R2b: re-exec independently sees the regression (recomputed.ok false)', r2.recomputed.ok === false);

  // A SWAPPED after-content: the embedded snapshot.after no longer hashes to the recorded
  // afterSha256 the chain binds → caught even before validate runs.
  const r3 = reexecValidate(snap, recorded, 'f'.repeat(64));
  check('R3: swapped after-content (hash != recorded afterSha256) is caught', r3.reproduces === false && r3.afterContentOk === false);
}

// ── (2) MERKLE proof of the session snapshot ────────────────────────────────────────
{
  // A 3-op session (odd count → exercises the duplicate-last-node path).
  const leaves = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const root = merkleRoot(leaves);
  check('M0: root is a 64-hex sha256', typeof root === 'string' && /^[0-9a-f]{64}$/.test(root));

  // Every leaf is independently provable: its inclusion path re-derives the SAME root.
  let allMembersVerify = true;
  for (let i = 0; i < leaves.length; i += 1) {
    const proof = buildMerkleProof(leaves, i);
    if (proof.root !== root) allMembersVerify = false;
    if (!verifyMerkleProof(proof)) allMembersVerify = false;
    if (proof.leafIndex !== i || proof.leafCount !== leaves.length) allMembersVerify = false;
  }
  check('M1: every session leaf verifies against the root (incl. odd duplicate path)', allMembersVerify);

  // Tamper the leaf → the re-derived root no longer matches.
  const p = buildMerkleProof(leaves, 1);
  const tamperedLeaf = { ...p, leaf: 'd'.repeat(64) };
  check('M2: tampered leaf no longer re-derives the root', verifyMerkleProof(tamperedLeaf) === false);

  // Tamper a path sibling → the re-derived root no longer matches.
  const tamperedPath = { ...p, path: p.path.map((s, i) => (i === 0 ? { ...s, sibling: 'e'.repeat(64) } : s)) };
  check('M3: tampered path sibling no longer re-derives the root', tamperedPath.path.length === 0 || verifyMerkleProof(tamperedPath) === false);

  // A single-op session: root commits to one leaf, path is empty, still verifies.
  const single = buildMerkleProof(['a'.repeat(64)], 0);
  check('M4: single-op session verifies with an empty path', verifyMerkleProof(single) === true && single.leafCount === 1);
}

// ── (3) Dedicated cryptographic gateRunId per gated op ──────────────────────────────
{
  const verdict = greenVerdict(['syntax', 'connection']);
  const after = 'a'.repeat(64);
  const parent = 'p'.repeat(64);
  const id1 = gateRunIdOf(verdict, after, parent);
  const id2 = gateRunIdOf(verdict, after, parent);
  check('G0: gateRunId is grun_-prefixed sha256', typeof id1 === 'string' && /^grun_[0-9a-f]{64}$/.test(id1));
  check('G1: gateRunId is deterministic (same triple → same id)', id1 === id2);

  // Distinct content → distinct id (no collision).
  const id3 = gateRunIdOf(verdict, 'b'.repeat(64), parent);
  check('G2: different after-content → different gateRunId', id1 !== id3);

  // Distinct verdict → distinct id (a verdict cannot be silently re-attributed).
  const id4 = gateRunIdOf(greenVerdict(['syntax']), after, parent);
  check('G3: different verdict → different gateRunId', id1 !== id4);

  // Distinct parent → distinct id (positional binding in the chain).
  const id5 = gateRunIdOf(verdict, after, 'q'.repeat(64));
  check('G4: different parent → different gateRunId', id1 !== id5);
}

// ── (4) SEAL of the final state, verified by verify-proof ───────────────────────────
{
  const input = {
    merkleRoot: 'r'.repeat(64),
    leaf: 'l'.repeat(64),
    gateRunId: 'grun_' + '0'.repeat(64),
    chainHash: 'c'.repeat(64),
    reexec: { language: 'ts', before: 0, after: 0, ok: true },
  };
  const seal = sealState(input, false); // self-sealed (keyless, reproducible)
  check('S0: seal is hmac-sha256, self-keyed by default', seal.alg === 'hmac-sha256' && seal.keyId === 'self');
  const v0 = verifySeal(input, seal);
  check('S1: self seal recomputes for any verifier (no shared secret)', v0.ok === true);

  // Edit ANY sealed field → the seal no longer recomputes.
  const v1 = verifySeal({ ...input, merkleRoot: 'X'.repeat(64) }, seal);
  check('S2: edited merkleRoot breaks the seal', v1.ok === false);
  const v2 = verifySeal({ ...input, gateRunId: 'grun_' + 'f'.repeat(64) }, seal);
  check('S3: edited gateRunId breaks the seal', v2.ok === false);
  const v3 = verifySeal({ ...input, chainHash: 'd'.repeat(64) }, seal);
  check('S4: edited chainHash breaks the seal', v3.ok === false);
  const v4 = verifySeal({ ...input, reexec: { language: 'ts', before: 0, after: 1, ok: false } }, seal);
  check('S5: edited reexec verdict bits break the seal', v4.ok === false);
}

// ── (5) The full per-gate decision tree ─────────────────────────────────────────────
{
  const run = {
    green: false,
    reds: [{ gate: 'security-gate', file: 'x.ts', locus: '12:4', fact: 'introduced a hardcoded secret' }],
    notApplicable: ['prisma-reference-gate'],
    unjudged: ['type-soundness-gate (threw: overlay compile failed)'],
    unjudgedEvidence: [{ gate: 'type-soundness-gate', reason: 'threw: overlay compile failed', affectedFiles: ['x.ts'] }],
    ran: ['security-gate', 'binding-gate', 'prisma-reference-gate', 'type-soundness-gate'],
  };
  const tree = decisionTreeOf(run);
  const byGate = new Map(tree.map((n) => [n.gate + ':' + n.decision, n]));
  check('D0: decision tree has one node per ran gate (+ folded extras)', tree.length >= 4);
  check('D1: red gate captured with its fact + locus', byGate.has('security-gate:red') && byGate.get('security-gate:red').locus === '12:4');
  check('D2: applied-clean gate is green', byGate.has('binding-gate:green'));
  check('D3: notApplicable gate captured', byGate.has('prisma-reference-gate:notApplicable'));
  check('D4: unjudged gate captured with its reason', byGate.has('type-soundness-gate:unjudged') && /overlay compile failed/.test(byGate.get('type-soundness-gate:unjudged').fact));
  check('D5: empty/absent verdict → empty tree', decisionTreeOf(null).length === 0 && decisionTreeOf(undefined).length === 0);
}

// ── END-TO-END: buildReexecProofBody assembles a body the verifier checks field-for-field ──
{
  const before = 'export function f() { return 1; }\n';
  const after = 'export function f() { return 2; }\n';
  const snap = buildSnapshot('e2e.ts', before, after);
  const leaves = ['00'.repeat(32), snap.afterSha256, 'ff'.repeat(32)];
  const verdict = greenVerdict(['syntax', 'binding-gate']);
  const validation = { language: 'ts', before: 0, after: 0, ok: true };
  const chainHash = 'c'.repeat(64);
  const parent = 'p'.repeat(64);
  const body = buildReexecProofBody({
    snapshot: snap,
    sessionAfterLeaves: leaves,
    leafIndex: 1,
    gateVerdict: verdict,
    parentSha256: parent,
    chainHash,
    validation,
    preferEnvKey: false,
  });
  check('E0: body is versioned atomic-proof-reexec/v2', body.reexecVersion === 'atomic-proof-reexec/v2');

  // (1) the verifier re-runs validate over the body's snapshot → reproduces.
  const re = reexecValidate(body.snapshot, validation, snap.afterSha256);
  check('E1: embedded snapshot re-executes + verdict reproduces', re.reproduces === true);

  // (2) the verifier re-derives the Merkle root from the embedded leaf + path.
  check('E2: embedded Merkle proof verifies (member 1/3)', verifyMerkleProof(body.merkle) === true && body.merkle.leafIndex === 1);

  // (3) the verifier recomputes the gateRunId over the bound triple.
  check('E3: embedded gateRunId recomputes', gateRunIdOf(verdict, snap.afterSha256, parent) === body.gateRunId);

  // (4) the verifier recomputes the seal over the canonical final-state body.
  const sealInput = {
    merkleRoot: body.merkle.root,
    leaf: body.merkle.leaf,
    gateRunId: body.gateRunId,
    chainHash,
    reexec: { language: validation.language, before: validation.before, after: validation.after, ok: validation.ok },
  };
  check('E4: embedded seal verifies over the canonical body', verifySeal(sealInput, body.seal).ok === true);

  // (5) the decision tree is carried in the body.
  check('E5: body carries the per-gate decision tree', Array.isArray(body.decisionTree) && body.decisionTree.length === verdict.ran.length);

  // Tamper test: editing the embedded chainHash the seal binds breaks E4's recompute.
  check('E6: tampering the sealed chainHash breaks the seal', verifySeal({ ...sealInput, chainHash: 'X'.repeat(64) }, body.seal).ok === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
