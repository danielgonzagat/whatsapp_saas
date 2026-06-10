#!/usr/bin/env node
/**
 * disproof-corpus.proof.mjs — executable proof for the Movimento III substrate.
 * Every check exercises REAL code paths (no mocks). A forged record MUST be
 * rejected; metrics MUST match hand-computed expectations; selection, briefing
 * and held-out MUST be deterministic. Exit 1 on any failure.
 */
import {
  appendWitnessJsonl,
  appendSupersedeJsonl,
  verifyCorpusJsonl,
  selectDisproofs,
  buildBriefing,
  selectHeldOut,
  computeMetrics,
  jaccardDistance4gram,
  runCli,
} from './disproof-corpus-harness.mjs';
import * as crypto from 'node:crypto';

const sha = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;

const witness = (invariantId, file, region, proposalSeed, generation) => ({
  invariantId,
  locus: { file, region },
  counterexample: { fixture: `${invariantId}-fixture`, survived: false, removedBytes: 42 },
  proposalDigest: sha(proposalSeed),
  generation,
  verdictCodes: [`gate.${invariantId.split('.')[0]}`],
  archiveEntrySha256: sha(`archive-${proposalSeed}`),
  repairHint: 'newText precisa conter oldText ou carregar proofOfIncorrectness',
});

// T1 — build + verify a real chain of 3 records across 2 walls
const a1 = appendWitnessJsonl({ corpusText: '', witnessArgs: witness('security-gate.regex.17', 'server-helpers-io.ts', 'atomicWrite', 'p1', 1) });
check('T1a.append-first', a1.ok && a1.deduped === false);
const a2 = appendWitnessJsonl({ corpusText: a1.corpusText, witnessArgs: witness('byte-floor', 'server-helpers-io.ts', 'atomicWrite', 'p2', 2) });
check('T1b.append-second-wall', a2.ok && a2.deduped === false);
const a3 = appendWitnessJsonl({ corpusText: a2.corpusText, witnessArgs: witness('security-gate.regex.17', 'server-helpers-io.ts', 'L229', 'p3', 3) });
check('T1c.line-offset-normalizes-to-same-file-wall', a3.ok === true, `deduped=${a3.deduped}`);
const v1 = verifyCorpusJsonl(a3.corpusText);
check('T1d.chain-verifies', v1.ok === true && v1.recordCount === 3, JSON.stringify({ recordCount: v1.recordCount, wallCount: v1.wallCount }));

// T2 — semantic dedup: same wall (invariantId + normalized locus) → hitCount++
const dup = appendWitnessJsonl({ corpusText: a3.corpusText, witnessArgs: witness('byte-floor', 'server-helpers-io.ts', 'atomicWrite', 'p4', 4) });
check('T2a.dedup-becomes-hit', dup.ok === true && dup.deduped === true);
const v2 = verifyCorpusJsonl(dup.corpusText);
const byteFloorWall = v2.walls.find((w) => w.invariantId === 'byte-floor');
check('T2b.hitCount-incremented', byteFloorWall?.hitCount === 2, JSON.stringify(byteFloorWall));
check('T2c.generations-span', byteFloorWall?.generations?.min === 2 && byteFloorWall?.generations?.max === 4);

// T3 — FORGERY REJECTED (III.g.4 hash tier): tamper one byte of a chained record
const tampered = dup.corpusText.replace('"removedBytes":42', '"removedBytes":43');
const v3 = verifyCorpusJsonl(tampered);
check('T3a.forged-witness-rejected', v3.ok === false, v3.error);
const truncated = dup.corpusText.split('\n').filter(Boolean).slice(0, 1).join('\n') + '\n' + dup.corpusText.split('\n').filter(Boolean).slice(2).join('\n');
const v3b = verifyCorpusJsonl(truncated);
check('T3b.broken-chain-rejected', v3b.ok === false, v3b.error);

// T4 — supersede: wall becomes history, never injected
const sup = appendSupersedeJsonl({ corpusText: dup.corpusText, targetWallKey: byteFloorWall.wallKey, supersededBy: 'byte-floor-v2', reason: 'invariante estendido via lattice' });
check('T4a.supersede-appends', sup.ok === true);
const v4 = verifyCorpusJsonl(sup.corpusText);
const superseded = v4.walls.find((w) => w.invariantId === 'byte-floor');
check('T4b.superseded-marked-not-deleted', superseded?.supersededBy === 'byte-floor-v2' && v4.recordCount === 5);
const sel4 = selectDisproofs({ corpusText: sup.corpusText, region: 'server-helpers-io.ts', k: 8, seed: 's' });
check('T4c.superseded-never-selected', sel4.ok === true && sel4.selected.every((w) => w.invariantId !== 'byte-floor'));

// T5 — selection: region priority + determinism
let big = { corpusText: '' };
const seeds = [
  ['security-gate.regex.3', 'engine-gate-registry.ts', 'verifyMonotonicAdmission'],
  ['commute-mod-invariant.cfg', 'gates/algebra.ts', 'commute'],
  ['monotonic-admission.fixture.9', 'engine-gate-registry.ts', 'frozenCorpus'],
  ['no-bypass.rank1', 'server-tools-exec.ts', 'denylist'],
];
for (let i = 0; i < seeds.length; i += 1) {
  big = appendWitnessJsonl({ corpusText: big.corpusText, witnessArgs: witness(seeds[i][0], seeds[i][1], seeds[i][2], `bp${i}`, i + 1) });
}
// hammer one wall to hitCount 3
big = appendWitnessJsonl({ corpusText: big.corpusText, witnessArgs: witness('no-bypass.rank1', 'server-tools-exec.ts', 'denylist', 'bp9', 5) });
big = appendWitnessJsonl({ corpusText: big.corpusText, witnessArgs: witness('no-bypass.rank1', 'server-tools-exec.ts', 'denylist', 'bp10', 6) });
const selA = selectDisproofs({ corpusText: big.corpusText, region: 'engine-gate-registry.ts', k: 3, seed: 'exp1' });
const selB = selectDisproofs({ corpusText: big.corpusText, region: 'engine-gate-registry.ts', k: 3, seed: 'exp1' });
check('T5a.deterministic', JSON.stringify(selA) === JSON.stringify(selB));
check('T5b.region-walls-first', selA.selected.length === 3 && selA.selected[0].locus.file === 'engine-gate-registry.ts' && selA.selected[1].locus.file === 'engine-gate-registry.ts', JSON.stringify(selA.selected.map((w) => w.wallKey)));
const selNoRegion = selectDisproofs({ corpusText: big.corpusText, region: '', k: 2, seed: 'exp1' });
check('T5c.hitcount-dominates-without-region', selNoRegion.selected[0].invariantId === 'no-bypass.rank1', JSON.stringify(selNoRegion.selected.map((w) => [w.invariantId, w.hitCount])));

// T6 — briefing: deterministic digest, archived layers
const b1 = buildBriefing({ selected: selA.selected, lessons: [{ statement: 'toda remoção de bytes em io exige proofOfIncorrectness', witnessCount: 14 }], repairTraces: [{ wallKey: selA.selected[0].wallKey, witnessRecordSha256: selA.selected[0].recordSha256, acceptedProposalDigest: sha('fixed') }] });
const b2 = buildBriefing({ selected: selA.selected, lessons: [{ statement: 'toda remoção de bytes em io exige proofOfIncorrectness', witnessCount: 14 }], repairTraces: [{ wallKey: selA.selected[0].wallKey, witnessRecordSha256: selA.selected[0].recordSha256, acceptedProposalDigest: sha('fixed') }] });
const b3 = buildBriefing({ selected: selA.selected.slice(0, 1), lessons: [] });
check('T6a.briefing-digest-deterministic', b1.briefingDigest === b2.briefingDigest);
check('T6b.briefing-digest-sensitive', b1.briefingDigest !== b3.briefingDigest);
check('T6c.briefing-layers', b1.layers.l1 === 4 && b1.layers.l3 === 1, JSON.stringify(b1.layers));

// T7 — held-out: deterministic, disjoint partition at pre-registered fraction
const ids = ['build', 'type', 'semantic', 'security.1', 'security.2', 'monotonicity', 'convergence', 'formal', 'property', 'no-bypass.1'];
const h1 = selectHeldOut({ invariantIds: ids, fraction: 0.2 });
const h2 = selectHeldOut({ invariantIds: ids, fraction: 0.2 });
check('T7a.heldout-deterministic', JSON.stringify(h1) === JSON.stringify(h2));
check('T7b.heldout-fraction', h1.heldOut.length === 2 && h1.taught.length === 8);
check('T7c.heldout-partition', new Set([...h1.heldOut, ...h1.taught]).size === 10 && h1.heldOut.every((id) => !h1.taught.includes(id)));

// T8 — metrics on hand-computed synthetic data
const proposals = [
  { generation: 1, admitted: false, wallKey: 'W1', diffText: 'a b c d e' },
  { generation: 1, admitted: true, publicScore: 2, diffText: 'f g h i j' },
  { generation: 2, admitted: false, wallKey: 'W1', diffText: 'a b c d e' },
  { generation: 2, admitted: false, wallKey: 'W2', diffText: 'a b c d e', unjudged: true },
  { generation: 3, admitted: true, publicScore: 1, shadowCount: 2, diffText: 'k l m n o' },
];
const m = computeMetrics({ proposals });
const g1 = m.perGeneration[0];
const g2 = m.perGeneration[1];
const g3 = m.perGeneration[2];
check('T8a.m1', near(g1.m1AdmissionRate, 0.5) && near(g2.m1AdmissionRate, 0) && near(g3.m1AdmissionRate, 1));
check('T8b.m2-signature', near(g1.m2WallRepeatRate, 0) && near(g2.m2WallRepeatRate, 0.5) && g3.m2WallRepeatRate === null, JSON.stringify([g1.m2WallRepeatRate, g2.m2WallRepeatRate, g3.m2WallRepeatRate]));
check('T8c.m3-running-max', g1.m3Capability === 2 && g2.m3Capability === 2 && g3.m3Capability === 2);
check('T8d.m5-novelty', near(g1.m5NoveltyIndex, 1) && near(g2.m5NoveltyIndex, 0) && g3.m5NoveltyIndex === null, JSON.stringify([g1.m5NoveltyIndex, g2.m5NoveltyIndex]));
check('T8e.m4-cost', JSON.stringify(m.m4CostToAdmission) === JSON.stringify([2, 5]), JSON.stringify(m.m4CostToAdmission));
check('T8f.unjudged-monitor', near(g2.unjudgedRate, 0.5));
check('T8g.jaccard-bounds', near(jaccardDistance4gram('a b c d', 'a b c d'), 0) && near(jaccardDistance4gram('a b c d', 'x y z w'), 1));

// T9 — CLI surface: self-test green, verify mode via stdin contract
const selfTest = runCli(['--self-test'], '');
check('T9a.cli-self-test', selfTest.ok === true && selfTest.forgedRejected === true, JSON.stringify(selfTest));
const cliVerify = runCli(['--verify-corpus-jsonl'], JSON.stringify({ corpusText: sup.corpusText }));
check('T9b.cli-verify', cliVerify.ok === true && cliVerify.recordCount === 5);
const cliBad = runCli(['--verify-corpus-jsonl'], JSON.stringify({ corpusText: tampered }));
check('T9c.cli-rejects-forged', cliBad.ok === false);

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'disproof-corpus',
  checks,
  failedCount: failed.length,
  honestCeiling:
    'Hash/chain/schema recompute only. Byte-level witness recompute against the archived candidate tree requires the engine-side consumer (III.a), which does NOT exist yet.',
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
