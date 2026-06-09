#!/usr/bin/env node
/**
 * lesson.proof.mjs — prova executável do III.d:
 *   L1: cluster >=3 com condição extraível vira lei VALIDADA POR PREVISÃO
 *       temporal out-of-sample (treino explica 100%, teste prevê >=2);
 *   L2: cluster pequeno (<3) é DESCARTADO com razão;
 *   L3: cluster cujo "futuro" a condição não prevê é DESCARTADO (sobreajuste);
 *   L4: lei forjada (1 byte adulterado) é REJEITADA por recálculo;
 *   L5: lei sem neverAGate:true é REJEITADA (a lei jamais vira gate);
 *   L6: leis fluem para o briefing como L1-priority (integração III.c).
 * Exit 1 em qualquer falha. Dados sintéticos: provam o mecanismo, não a tese.
 */
import { clusterWitnesses, consolidate, parseLessonsJsonl, synthesizeLessonRule } from './lesson-harness.mjs';
import { appendWitnessJsonl, buildBriefing } from './disproof-corpus-harness.mjs';
import * as crypto from 'node:crypto';

const sha = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

// Corpus sintético: 5 colisões byte-floor (gens 1-5, removals 300..500 > cap 220)
// em loci DISTINTOS (sem dedup) + 2 colisões public-contract (cluster pequeno).
let corpus = { corpusText: '' };
const wall = (invariantId, region, generation, counterexample) => ({
  invariantId,
  locus: { file: 'sandbox/task1-dedup-under-byte-cap.txt', region },
  counterexample,
  proposalDigest: sha(`prop-${invariantId}-${region}-${generation}`),
  generation,
  verdictCodes: [`gate.${invariantId}`],
  archiveEntrySha256: sha(`arch-${generation}`),
});
for (let generation = 1; generation <= 5; generation += 1) {
  corpus = appendWitnessJsonl({
    corpusText: corpus.corpusText,
    witnessArgs: wall('sandbox.byte-floor', `removal-site-${generation}`, generation, { removedByteCount: 250 + generation * 50, byteCap: 220 }),
  });
  if (corpus.ok !== true) throw new Error(`setup append failed: ${corpus.error}`);
}
for (let generation = 1; generation <= 2; generation += 1) {
  corpus = appendWitnessJsonl({
    corpusText: corpus.corpusText,
    witnessArgs: wall('sandbox.public-contract', `contract-site-${generation}`, generation, { missingLine: 'export { a, b };' }),
  });
}

// L1 — consolidação: byte-floor (5 membros, condição removal-over-cap) vira lei validada
const result = consolidate({ corpusText: corpus.corpusText });
check('L1a.consolidate-ok', result.ok === true);
const law = result.accepted.find((lesson) => lesson.invariantId === 'sandbox.byte-floor');
check('L1b.byte-floor-law-accepted', Boolean(law), JSON.stringify(result.accepted.map((l) => l.lessonId)));
check('L1c.law-validated-by-prediction', law?.validation?.testPredicted === '3/3' || law?.validation?.testPredicted === '2/2', JSON.stringify(law?.validation));
check('L1d.law-statement-carries-cap', typeof law?.statement === 'string' && law.statement.includes('220'), law?.statement);
check('L1e.law-never-a-gate', law?.neverAGate === true);

// L2 — cluster pequeno descartado com razão
const smallDiscard = result.discarded.find((d) => d.clusterKey.startsWith('sandbox.public-contract'));
check('L2a.small-cluster-discarded', Boolean(smallDiscard), JSON.stringify(result.discarded));

// L3 — sobreajuste: cluster cujo futuro a condição não prevê é descartado.
// 3 witnesses byte-floor de treino (removals > cap) + 2 futuros com removedByteCount
// ABAIXO do cap (a condição extraída não os prevê) → lei morre.
const overfitCluster = {
  clusterKey: 'sandbox.byte-floor::sandbox/overfit.txt',
  members: [
    wall('sandbox.byte-floor', 'r1', 1, { removedByteCount: 400, byteCap: 220 }),
    wall('sandbox.byte-floor', 'r2', 2, { removedByteCount: 380, byteCap: 220 }),
    wall('sandbox.byte-floor', 'r3', 3, { removedByteCount: 350, byteCap: 220 }),
    wall('sandbox.byte-floor', 'r4', 4, { removedByteCount: 10, byteCap: 220 }),
    wall('sandbox.byte-floor', 'r5', 5, { removedByteCount: 12, byteCap: 220 }),
  ].map((args, index) => ({ ...args, recordSha256: sha(`fake-${index}`), kind: 'atomic-disproof-witness-record' })),
};
const overfit = synthesizeLessonRule({ cluster: overfitCluster, splitGeneration: 3 });
check('L3a.overfit-law-discarded', overfit.ok === false && overfit.discarded === true && String(overfit.reason).includes('sobreajuste'), overfit.reason);

// L4 — lei forjada rejeitada por recálculo
const tamperedLessons = result.lessonsText.replace('220', '999');
const tamperedVerify = parseLessonsJsonl(tamperedLessons);
check('L4a.forged-law-rejected', tamperedVerify.ok === false, tamperedVerify.error);

// L5 — lei sem neverAGate rejeitada (mesmo com hash recalculado corretamente)
const stripped = JSON.parse(JSON.stringify(law));
stripped.neverAGate = false;
delete stripped.recordSha256;
stripped.recordSha256 = crypto.createHash('sha256').update(JSON.stringify(stripped)).digest('hex');
const strippedVerify = parseLessonsJsonl(JSON.stringify(stripped) + '\n');
check('L5a.gateless-doctrine-enforced', strippedVerify.ok === false && String(strippedVerify.error).includes('neverAGate'), strippedVerify.error);

// L6 — integração III.c: leis entram no briefing como camada L1 prioritária
const briefing = buildBriefing({ selected: [], lessons: [{ statement: law.statement, witnessCount: law.witnessCount }] });
check('L6a.law-flows-into-briefing', briefing.ok === true && briefing.text.includes('LEI:') && briefing.text.includes('220'), briefing.briefingDigest);

const failed = checks.filter((c) => !c.ok);
const out = {
  ok: failed.length === 0,
  gate: 'lesson-synthesis',
  checks,
  failedCount: failed.length,
  honestCeiling:
    'Mecanismo de consolidação apenas (dados sintéticos). Famílias de condição cobertas: removal-over-cap, fixture-loss, wall-presence. Leis de outras famílias estruturais exigem extensão validada. A lei orienta o propositor e JAMAIS vira gate.',
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
process.exit(out.ok ? 0 : 1);
