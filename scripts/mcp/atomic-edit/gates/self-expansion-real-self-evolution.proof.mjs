#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const latticeProof = fs.readFileSync(path.join(sourceDir, 'gates/self-expansion-validator-lattice.proof.mjs'), 'utf8');
const results = [];
const realProofCommand = 'node gates/self-expansion-real-self-evolution.proof.mjs --json';

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const proofRunIndex = source.indexOf('const proofs = await runProofCommands(proofCommands);');
const failedIndex = source.indexOf('const failed = proofs.filter((p) => !p.ok);');
const effectsBeforePromotionIndex = source.indexOf('const effectsBeforePromotion = diffEffect(snap);');
const candidateSnapIndex = source.indexOf('const candidateSnap = captureEffectSnapshot(selfRoot);');
const receiptIndex = source.indexOf('const promotionReceipt = buildRealSelfExpansionPromotionReceipt');
const rejectIndex = source.indexOf("promotionReceipt.decision !== 'promote'");
const archiveIndex = source.indexOf('const selfEvolutionArchive = appendRealSelfExpansionArchive');
const responseIndex = source.indexOf('selfEvolution: {');

record(
  'real self-evolution proof is mandatory in the runtime lattice and in the lattice proof fixture',
  source.includes(`{ phase: 'self-evolution-real', command: '${realProofCommand}' }`) &&
    latticeProof.includes(`'${realProofCommand}'`) &&
    latticeProof.includes("'self-evolution-real'"),
);
record(
  'PromotionReceipt is built only after the proof lattice has run and requested effects were checked',
  proofRunIndex >= 0 &&
    failedIndex > proofRunIndex &&
    effectsBeforePromotionIndex > failedIndex &&
    candidateSnapIndex > effectsBeforePromotionIndex &&
    receiptIndex > candidateSnapIndex,
  { proofRunIndex, failedIndex, effectsBeforePromotionIndex, candidateSnapIndex, receiptIndex },
);
record(
  'real promotion derives facts from parent snapshot, candidate snapshot, actual proof results, commands, effects, and intent',
  source.includes('function buildRealSelfExpansionPromotionReceipt') &&
    source.includes('parentSnap: EffectSnapshot') &&
    source.includes('candidateSnap: EffectSnapshot') &&
    source.includes('effectsBeforePromotion: FileEffect[]') &&
    source.includes('proofs: ProofCommandResult[]') &&
    source.includes('snapshotFileText(args.parentSnap') &&
    source.includes('snapshotFileText(args.candidateSnap') &&
    source.includes('proofGateFacts(args.proofs, requiredCommands)') &&
    source.includes('effectDigest: sha256(stableJson(args.effectsBeforePromotion))'),
);
record(
  'candidate required gates are parsed from candidate source and missing/failed actual proof commands fail closed',
  source.includes('mandatorySelfExpansionCommandsFromSource(candidateSource)') &&
    source.includes('const requiredCommands = Array.from(new Set([...args.proofCommands, ...candidateRequiredCommands]))') &&
    source.includes("status: proof?.ok === true ? 'passed' : proof ? 'failed' : 'missing'") &&
    source.includes('requiredGates'),
);
record(
  'promotion uses the Darwin harness receipt mode and verifies the receipt by recomputation',
  source.includes("runSelfEvolutionHarness('--receipt'") &&
    source.includes("runSelfEvolutionHarness('--verify-receipt', { receipt })") &&
    source.includes('self-evolution harness did not return a receipt object'),
);
record(
  'candidate semantic operator score is not parent-clamped',
  source.includes('const candidateSemanticOperators = selfExpansionSemanticOperatorScore(candidateSource, args.applied.length);') &&
    !source.includes('const candidateSemanticOperators = Math.max('),
  {
    directScore: source.includes('const candidateSemanticOperators = selfExpansionSemanticOperatorScore(candidateSource, args.applied.length);'),
    noMathMax: !source.includes('const candidateSemanticOperators = Math.max('),
  },
);
record(
  'promotion reject is fail-closed and rolls back the edited tree instead of accepting a benchmark-only failure',
  rejectIndex > receiptIndex &&
    source.includes("rollbackEffectStrict(snap, effectsBeforeRejectRollback, 'atomic_expand_self')") &&
    source.includes('self-evolution promotion rejected'),
  { rejectIndex, receiptIndex },
);
record(
  'promotion archive is hash-chained by the Darwin harness and persisted through atomicWrite under self-expansion admission',
  archiveIndex > rejectIndex &&
    source.includes("runSelfEvolutionHarness('--append-archive-jsonl'") &&
    source.includes('withSelfExpansionAdmission(() => atomicWrite(archivePath') &&
    source.includes('SELF_EVOLUTION_ARCHIVE_REL') &&
    source.includes('SELF_EVOLUTION_ARCHIVE_ID'),
  { archiveIndex, rejectIndex },
);
record(
  'response exposes PromotionReceipt/archive and an admission label that names the Darwin-Godel promotion',
  responseIndex > archiveIndex &&
    source.includes('promotionReceipt,') &&
    source.includes('archive: selfEvolutionArchive') &&
    source.includes('self-expansion-validator-lattice-green-and-darwin-godel-promoted'),
  { responseIndex, archiveIndex },
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
