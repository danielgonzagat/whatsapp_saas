#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const latticeProof = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-validator-lattice.proof.mjs'), 'utf8');
const realProof = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-real-self-evolution.proof.mjs'), 'utf8');
const harness = fs.readFileSync(path.join(sourceDir, '..', 'atomic-edit-evolution/disproof-corpus-harness.mjs'), 'utf8');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const proofCommand = 'node gates/self-evolution-disproof-consumer.proof.mjs --json';
const failedBranch = source.indexOf('if (failed.length > 0) {');
const failedReceipt = source.indexOf('const rejectionReceipt = buildRealSelfExpansionPromotionReceipt', failedBranch);
const failedRollback = source.indexOf("rollbackEffectStrict(snap, effectsBeforeRejectRollback, 'atomic_expand_self')", failedBranch);
const failedRecord = source.indexOf('recordSelfEvolutionRejection(selfRoot', failedBranch);
const failedReturn = source.indexOf('proof failed:', failedBranch);
const rejectBranch = source.indexOf("promotionReceipt.decision !== 'promote'");
const rejectRollback = source.indexOf("rollbackEffectStrict(snap, effectsBeforeRejectRollback, 'atomic_expand_self')", rejectBranch);
const rejectRecord = source.indexOf('recordSelfEvolutionRejection(selfRoot', rejectBranch);

record(
  'self-evolution disproof consumer is mandatory in atomic_expand_self and the lattice proof',
  source.includes(`{ phase: 'self-evolution-disproof', command: '${proofCommand}' }`) &&
    latticeProof.includes(`'${proofCommand}'`) &&
    latticeProof.includes("'self-evolution-disproof'"),
  {
    inSource: source.includes(`{ phase: 'self-evolution-disproof', command: '${proofCommand}' }`),
    inLatticeCommands: latticeProof.includes(`'${proofCommand}'`),
    inLatticePhases: latticeProof.includes("'self-evolution-disproof'"),
  },
);

record(
  'reject path consumes the NegativeActionProof carrier with a recomputable gate-red witness',
  /function recordSelfEvolutionRejection[\s\S]*requireNegativeActionProof\([\s\S]*action: 'atomic_expand_self:reject_candidate'[\s\S]*disproofWitness: \{ kind: 'gate-red', gate: invariantId, readLoci: \[locusFile\] \}/.test(source),
  {
    hasHelper: source.includes('function recordSelfEvolutionRejection'),
    hasNegativeProof: source.includes("action: 'atomic_expand_self:reject_candidate'"),
    hasGateRedWitness: source.includes("disproofWitness: { kind: 'gate-red', gate: invariantId, readLoci: [locusFile] }"),
  },
);

record(
  'proof-failure branch derives a real rejection receipt before rollback and records the disproval after rollback',
  failedBranch >= 0 && failedReceipt > failedBranch && failedRollback > failedReceipt && failedRecord > failedRollback && failedReturn > failedRecord,
  { failedBranch, failedReceipt, failedRollback, failedRecord, failedReturn },
);

record(
  'promotion-reject branch rolls back candidate bytes then persists rejection archive/corpus evidence',
  rejectBranch >= 0 && rejectRollback > rejectBranch && rejectRecord > rejectRollback && source.includes('selfEvolutionReject=') && source.includes('candidate file effect(s)'),
  { rejectBranch, rejectRollback, rejectRecord },
);

record(
  'disproof corpus append uses the external deterministic harness and canonical .atomic corpus path',
  source.includes('SELF_EVOLUTION_DISPROOF_CORPUS_REL') &&
    source.includes("path.join('.atomic', 'disproof-corpus.jsonl')") &&
    source.includes('DISPROOF_CORPUS_HARNESS_REL') &&
    source.includes("'--append-witness-jsonl'") &&
    source.includes('appendSelfEvolutionDisproofCorpus') &&
    source.includes('atomicWrite(corpusPath') &&
    !source.includes('.disproof-corpus-harness-output'),
  {
    hasCorpusPath: source.includes("path.join('.atomic', 'disproof-corpus.jsonl')"),
    hasHarness: source.includes('DISPROOF_CORPUS_HARNESS_REL'),
    appendMode: source.includes("'--append-witness-jsonl'"),
    atomicWrite: source.includes('atomicWrite(corpusPath'),
    noSourceRootTemp: !source.includes('.disproof-corpus-harness-output'),
  },
);

record(
  'corpus witness schema binds invariant, locus, counterexample, proposal digest, parent/generation, verdict codes, and archive entry sha',
  source.includes('invariantId,') &&
    source.includes('locus: { file: locusFile, region: candidateId }') &&
    source.includes('counterexample:') &&
    source.includes('proposalDigest,') &&
    source.includes('parentSha:') &&
    source.includes('generation:') &&
    source.includes('verdictCodes: rejectionCodes') &&
    source.includes('archiveEntrySha256') &&
    harness.includes('archiveEntrySha256 is required') &&
    harness.includes('verifyCorpusJsonl'),
  {
    harnessRequiresArchive: harness.includes('archiveEntrySha256 is required'),
    harnessVerifies: harness.includes('verifyCorpusJsonl'),
  },
);

record(
  'candidate semantic operator metric is no longer parent-clamped',
  source.includes('const candidateSemanticOperators = selfExpansionSemanticOperatorScore(candidateSource, args.applied.length);') &&
    !source.includes('const candidateSemanticOperators = Math.max(') &&
    realProof.includes('candidate semantic operator score is not parent-clamped'),
  {
    directScore: source.includes('const candidateSemanticOperators = selfExpansionSemanticOperatorScore(candidateSource, args.applied.length);'),
    noMathMax: !source.includes('const candidateSemanticOperators = Math.max('),
    realProofCovers: realProof.includes('candidate semantic operator score is not parent-clamped'),
  },
);

record(
  'reject response feeds the next proposer with a recomputed disproof briefing digest',
  source.includes('function buildSelfEvolutionNextDisproofBriefing') &&
    source.includes("'--verify-corpus-jsonl'") &&
    source.includes("'--select-disproofs'") &&
    source.includes("'--build-briefing'") &&
    (source.includes("mode = 'next-rejection-briefing'") || source.includes("mode: 'next-rejection-briefing'")) &&
    source.includes('nextDisproofBriefing: selfEvolutionReject.nextDisproofBriefing') &&
    source.includes('briefingDigest') &&
    source.includes('Briefing remains proposer guidance'),
  {
    hasHelper: source.includes('function buildSelfEvolutionNextDisproofBriefing'),
    verifiesCorpus: source.includes("'--verify-corpus-jsonl'"),
    selectsDisproofs: source.includes("'--select-disproofs'"),
    buildsBriefing: source.includes("'--build-briefing'"),
    responseExportsBriefing: source.includes('nextDisproofBriefing: selfEvolutionReject.nextDisproofBriefing'),
  },
);

const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
