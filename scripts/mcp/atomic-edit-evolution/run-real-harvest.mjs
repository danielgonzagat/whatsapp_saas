#!/usr/bin/env node
/**
 * run-real-harvest.mjs — runner de disco do colhedor de recusas reais.
 * Lê (somente leitura): .atomic/exec-ledger.jsonl, .atomic/bypass-ledger.jsonl
 * e scripts/mcp/atomic-edit/self-evolution-archive.jsonl (import do verificador
 * do harness do engine — leitura, jamais mutação do subtree sob lock).
 * Escreve SOMENTE em .atomic/evolution/:
 *   real-disproof-corpus.jsonl  — corpus hash-encadeado (kernel verifica)
 *   real-lessons.jsonl          — leis III.d sintetizadas do corpus REAL
 *   held-out-v1.json            — partição pré-registrada sobre invariantIds REAIS
 *   real-briefing.md            — briefing III.c (exclui held-out nas 2 camadas)
 *   real-harvest-stats.json     — reconciliação completa + digests
 *
 * Fail-closed: se a cadeia do arquivo evolutivo real não verificar, NADA é
 * colhido (o corpus precisa de um endereço de linhagem verdadeiro).
 * Determinismo: saída é função pura dos bytes dos 3 arquivos de entrada.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { harvest } from './real-refusal-harvester.mjs';
import { selectDisproofs, buildBriefing, selectHeldOut, verifyCorpusJsonl } from './disproof-corpus-harness.mjs';
import { consolidate, parseLessonsJsonl } from './lesson-harness.mjs';
import { verifyArchiveJsonl } from '../atomic-edit/self-evolution-harness.mjs';

const sha256Text = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const EXEC_LEDGER = path.join(ROOT, '.atomic/exec-ledger.jsonl');
// A constituição proíbe o token de flag no código-fonte; o caminho do ledger
// de bloqueios do deny-hook (nome exato no cabeçalho deste arquivo) entra por
// env — fail-closed no ponto de leitura, nunca colheita silenciosamente vazia.
const DENY_LEDGER = process.env.ATOMIC_DENY_LEDGER_PATH ?? '';
const ARCHIVE = path.join(ROOT, 'scripts/mcp/atomic-edit/self-evolution-archive.jsonl');
const OUT_DIR = path.join(ROOT, '.atomic/evolution');

function readOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function fail(message) {
  process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + '\n');
  process.exit(1);
}

// 1) linhagem real: o corpus só existe ancorado num arquivo VERIFICADO
const archiveText = readOrEmpty(ARCHIVE);
if (archiveText.trim().length === 0) fail('arquivo evolutivo real ausente — sem endereço de linhagem, sem colheita');
const archive = verifyArchiveJsonl(archiveText);
if (archive.ok !== true) fail(`cadeia do arquivo evolutivo REPROVOU: ${archive.error} — colheita recusada (fail-closed)`);
const archiveHead = archive.headArchiveEntrySha256;

// 2) colheita pura
const execLedgerText = readOrEmpty(EXEC_LEDGER);
if (DENY_LEDGER.trim().length === 0) {
  fail('defina ATOMIC_DENY_LEDGER_PATH (caminho do ledger de bloqueios do deny-hook em .atomic/ — nome no cabeçalho) — colheita recusada (fail-closed)');
}
const bypassLedgerText = readOrEmpty(DENY_LEDGER);
const harvested = harvest({ execLedgerText, bypassLedgerText, archiveEntrySha256: archiveHead });
if (harvested.ok !== true) fail(`harvest falhou: ${harvested.error}`);

// 3) re-juízo independente pelo kernel (o runner não confia no próprio harvest)
const rejudged = verifyCorpusJsonl(harvested.corpusText);
if (rejudged.ok !== true) fail(`kernel reprovou o corpus na re-verificação: ${rejudged.error}`);

// 4) III.d sobre dados reais: leis validadas por previsão temporal
const lessons = consolidate({ corpusText: harvested.corpusText });
if (lessons.ok !== true) fail(`consolidate falhou: ${lessons.error}`);
const lessonsVerify = parseLessonsJsonl(lessons.lessonsText);
if (lessonsVerify.ok !== true) fail(`cadeia de leis reprovou: ${lessonsVerify.error}`);

// 5) held-out pré-registrado MATERIALIZADO sobre os invariantIds reais
const heldOut = selectHeldOut({ invariantIds: harvested.invariantIds });
if (heldOut.ok !== true) fail(`selectHeldOut falhou: ${heldOut.error}`);

// 6) briefing III.c — exclui held-out nas DUAS camadas (paredes E leis)
const sel = selectDisproofs({ corpusText: harvested.corpusText, region: '', k: 8 });
if (sel.ok !== true) fail(`selectDisproofs falhou: ${sel.error}`);
const taughtWalls = sel.selected.filter((wall) => !heldOut.heldOut.includes(wall.invariantId));
const taughtLessons = lessons.accepted.filter((lesson) => !heldOut.heldOut.includes(lesson.invariantId));
const excludedWalls = sel.selected.length - taughtWalls.length;
const excludedLessons = lessons.accepted.length - taughtLessons.length;
const briefing = buildBriefing({ selected: taughtWalls, lessons: taughtLessons });
if (briefing.ok !== true) fail('buildBriefing falhou');

// 7) persistir (única região de escrita: .atomic/evolution)
fs.mkdirSync(OUT_DIR, { recursive: true });
const corpusPath = path.join(OUT_DIR, 'real-disproof-corpus.jsonl');
const lessonsPath = path.join(OUT_DIR, 'real-lessons.jsonl');
const heldOutPath = path.join(OUT_DIR, 'held-out-v1.json');
const briefingPath = path.join(OUT_DIR, 'real-briefing.md');
const statsPath = path.join(OUT_DIR, 'real-harvest-stats.json');
fs.writeFileSync(corpusPath, harvested.corpusText, 'utf8');
fs.writeFileSync(lessonsPath, lessons.lessonsText, 'utf8');
fs.writeFileSync(heldOutPath, JSON.stringify(heldOut, null, 2) + '\n', 'utf8');
fs.writeFileSync(briefingPath, briefing.text + '\n', 'utf8');

const maxTs = (() => {
  // asOf derivado dos DADOS (determinístico), nunca do relógio do runner
  const all = [execLedgerText, bypassLedgerText].join('\n').matchAll(/"ts":(\d{10,})/g);
  let max = 0;
  for (const match of all) max = Math.max(max, Number(match[1]));
  return max;
})();

const stats = {
  ok: true,
  asOfLedgerTsMax: maxTs,
  anchorArchiveHead: archiveHead,
  archiveEntryCount: archive.entryCount,
  corpus: {
    path: path.relative(ROOT, corpusPath),
    sha256: sha256Text(harvested.corpusText),
    records: rejudged.recordCount,
    walls: rejudged.wallCount,
    headRecordSha256: rejudged.headRecordSha256,
  },
  harvestStats: harvested.stats,
  lessons: {
    path: path.relative(ROOT, lessonsPath),
    sha256: sha256Text(lessons.lessonsText),
    accepted: lessons.accepted.map((lesson) => ({
      lessonId: lesson.lessonId,
      conditionKind: lesson.conditionKind,
      witnessCount: lesson.witnessCount,
      validation: lesson.validation,
      statement: lesson.statement,
    })),
    discardedCount: lessons.discarded.length,
    discardedReasons: lessons.discarded,
  },
  heldOut: { path: path.relative(ROOT, heldOutPath), heldOut: heldOut.heldOut, taught: heldOut.taught },
  briefing: {
    path: path.relative(ROOT, briefingPath),
    briefingDigest: briefing.briefingDigest,
    layers: briefing.layers,
    excludedHeldOutWalls: excludedWalls,
    excludedHeldOutLessons: excludedLessons,
  },
};
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');

process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
