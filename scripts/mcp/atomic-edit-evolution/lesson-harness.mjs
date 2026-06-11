#!/usr/bin/env node
/**
 * lesson-harness.mjs — III.d: consolidação de witnesses em LessonRules.
 * Instância é memória; lei é conhecimento. A cada K gerações, clusters de
 * witnesses (mesmo invariantId + mesma região) com >=3 membros viram uma
 * LessonRule — VALIDADA POR PREVISÃO TEMPORAL out-of-sample: a lei é
 * construída só com as gerações <= split e precisa prever >=2 colisões das
 * gerações posteriores. Lei que não prevê é sobreajuste e é DESCARTADA com
 * razão registrada.
 *
 * TETO ABSOLUTO (III.d.5): a lei é heurística aprendida e JAMAIS vira gate.
 * Este módulo não exporta nenhuma superfície de registro de gate — o portão
 * só executa invariantes provados; a lei só orienta o propositor.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCorpusJsonl, verifyCorpusJsonl } from './disproof-corpus-harness.mjs';

const SCHEMA_VERSION = 1;
const LESSON_KIND = 'atomic-lesson-rule';
const MIN_CLUSTER_SIZE = 3;
const MIN_PREDICTED = 2;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordHash(body) {
  const copy = { ...body };
  delete copy.recordSha256;
  return canonicalSha256(copy);
}

function witnessRecords(corpusText) {
  return parseCorpusJsonl(corpusText).records.filter((record) => record.kind === 'atomic-disproof-witness-record');
}

function clusterKey(record) {
  return `${record.invariantId}::${record.locus.file}`;
}

/** Agrupa witnesses por invariante + região; só clusters >= MIN_CLUSTER_SIZE são elegíveis a lei. */
export function clusterWitnesses({ corpusText }) {
  const verified = verifyCorpusJsonl(corpusText);
  if (verified.ok !== true) return { ok: false, error: `corpus rejected: ${verified.error}` };
  const clusters = new Map();
  for (const record of witnessRecords(corpusText)) {
    const key = clusterKey(record);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(record);
  }
  return {
    ok: true,
    clusters: [...clusters.entries()].map(([key, members]) => ({ clusterKey: key, size: members.length, eligible: members.length >= MIN_CLUSTER_SIZE, members })),
  };
}

/**
 * Extrai a CONDIÇÃO decidível da lei a partir dos contra-exemplos do cluster.
 * Hoje cobre as famílias estruturais do sandbox/engine; cluster sem condição
 * extraível gera lei "presença-de-parede" (mais fraca, ainda validável).
 */
function extractCondition(members) {
  const byteCaps = members.map((m) => m.counterexample?.byteCap).filter((v) => typeof v === 'number');
  if (byteCaps.length === members.length && byteCaps.length > 0) {
    const cap = Math.min(...byteCaps);
    return {
      kind: 'removal-over-cap',
      cap,
      predict: (witness) => asNumber(witness.counterexample?.removedByteCount, -1) > cap,
    };
  }
  const fixtureLists = members.map((m) => m.counterexample?.lostFixtures).filter(Array.isArray);
  if (fixtureLists.length === members.length && fixtureLists.length > 0) {
    return {
      kind: 'fixture-loss',
      predict: (witness) => Array.isArray(witness.counterexample?.lostFixtures) && witness.counterexample.lostFixtures.length > 0,
    };
  }
  return { kind: 'wall-presence', predict: () => true };
}

/**
 * Sintetiza e VALIDA uma LessonRule por previsão temporal:
 * constrói com members de generation <= splitGeneration, prevê os posteriores.
 * Retorna {ok:false, discarded:true, reason} quando a lei não prevê (sobreajuste).
 */
export function synthesizeLessonRule({ cluster, splitGeneration, previousLesson = null }) {
  if (!isRecord(cluster) || !Array.isArray(cluster.members)) return { ok: false, error: 'cluster.members is required' };
  const members = [...cluster.members].sort((a, b) => asNumber(a.generation, 0) - asNumber(b.generation, 0));
  if (members.length < MIN_CLUSTER_SIZE) {
    return { ok: false, discarded: true, reason: `cluster size ${members.length} < ${MIN_CLUSTER_SIZE} (instância demais, lei de menos)` };
  }
  const split = asNumber(splitGeneration, asNumber(members[Math.floor(members.length / 2) - 1]?.generation, 0));
  const trainSet = members.filter((m) => asNumber(m.generation, 0) <= split);
  const testSet = members.filter((m) => asNumber(m.generation, 0) > split);
  if (trainSet.length < 2 || testSet.length < MIN_PREDICTED) {
    return { ok: false, discarded: true, reason: `split inviável: train=${trainSet.length} test=${testSet.length} (precisa train>=2, test>=${MIN_PREDICTED})` };
  }
  const condition = extractCondition(trainSet);
  const explained = trainSet.filter((m) => condition.predict(m)).length;
  if (explained !== trainSet.length) {
    return { ok: false, discarded: true, reason: `lei não explica todos os membros de treino (${explained}/${trainSet.length})` };
  }
  const predicted = testSet.filter((m) => condition.predict(m)).length;
  if (predicted < MIN_PREDICTED) {
    return { ok: false, discarded: true, reason: `lei não prevê o futuro: ${predicted}/${testSet.length} colisões posteriores previstas (mínimo ${MIN_PREDICTED}) — sobreajuste` };
  }
  const sample = trainSet[0];
  const statementByKind = {
    'removal-over-cap': `toda edição em ${sample.locus.file} que remove mais de ${condition.cap} bytes num passo viola ${sample.invariantId}`,
    'fixture-loss': `toda edição em ${sample.locus.file} que perde uma fixture de contrato viola ${sample.invariantId}`,
    'wall-presence': `edições na região ${sample.locus.file} colidem recorrentemente com ${sample.invariantId} — sonde antes de propor`,
  };
  const body = {
    kind: LESSON_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: previousLesson ? asNumber(previousLesson.sequence, 0) + 1 : 1,
    previousRecordSha256: previousLesson ? recordHash(previousLesson) : null,
    lessonId: `lesson:${cluster.clusterKey}:v${previousLesson ? asNumber(previousLesson.sequence, 0) + 1 : 1}`,
    clusterKey: cluster.clusterKey,
    invariantId: sample.invariantId,
    conditionKind: condition.kind,
    ...(condition.kind === 'removal-over-cap' ? { cap: condition.cap } : {}),
    statement: statementByKind[condition.kind],
    witnessCount: members.length,
    evidence: members.map((m) => m.recordSha256),
    validation: {
      splitGeneration: split,
      trainExplained: `${explained}/${trainSet.length}`,
      testPredicted: `${predicted}/${testSet.length}`,
    },
    neverAGate: true,
  };
  return { ok: true, lesson: { ...body, recordSha256: recordHash(body) } };
}

export function verifyLessonRule(lesson, previousLesson = null) {
  if (!isRecord(lesson)) return { ok: false, error: 'lesson must be an object' };
  if (lesson.kind !== LESSON_KIND) return { ok: false, error: 'lesson kind mismatch' };
  if (lesson.neverAGate !== true) return { ok: false, error: 'lesson must carry neverAGate:true (a lei jamais vira gate)' };
  const recomputed = recordHash(lesson);
  if (lesson.recordSha256 !== recomputed) return { ok: false, error: `lesson recordSha256 mismatch; declared ${lesson.recordSha256}, recomputed ${recomputed}` };
  const previousSha = previousLesson ? recordHash(previousLesson) : null;
  if ((lesson.previousRecordSha256 ?? null) !== previousSha) return { ok: false, error: 'lesson chain break' };
  return { ok: true, recordSha256: recomputed };
}

/** Consolidação completa: clusteriza, sintetiza e valida; retorna leis + descartes com razão. */
export function consolidate({ corpusText, lessonsText = '' }) {
  const clustered = clusterWitnesses({ corpusText });
  if (clustered.ok !== true) return clustered;
  const existing = parseLessonsJsonl(lessonsText);
  if (existing.ok !== true) return existing;
  let previousLesson = existing.lessons.length > 0 ? existing.lessons[existing.lessons.length - 1] : null;
  const accepted = [];
  const discarded = [];
  let nextLessonsText = String(lessonsText ?? '').trimEnd();
  for (const cluster of clustered.clusters) {
    if (existing.lessons.some((lesson) => lesson.clusterKey === cluster.clusterKey)) continue;
    if (!cluster.eligible) {
      // Sem caps silenciosos: cluster pequeno é DESCARTADO com razão registrada.
      discarded.push({ clusterKey: cluster.clusterKey, reason: `cluster size ${cluster.size} < ${MIN_CLUSTER_SIZE} (instância demais, lei de menos)` });
      continue;
    }
    const result = synthesizeLessonRule({ cluster, previousLesson });
    if (result.ok === true) {
      accepted.push(result.lesson);
      previousLesson = result.lesson;
      nextLessonsText = `${nextLessonsText.length === 0 ? '' : `${nextLessonsText}\n`}${JSON.stringify(result.lesson)}`;
    } else {
      discarded.push({ clusterKey: cluster.clusterKey, reason: result.reason ?? result.error });
    }
  }
  nextLessonsText = nextLessonsText.length === 0 ? '' : `${nextLessonsText}\n`;
  return { ok: true, accepted, discarded, lessonsText: nextLessonsText };
}

export function parseLessonsJsonl(text) {
  const lines = String(text ?? '').split('\n');
  const lessons = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return { ok: false, error: `lessons line ${index + 1} invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    const verified = verifyLessonRule(parsed, previous);
    if (verified.ok !== true) return { ok: false, error: `lesson ${index + 1} rejected: ${verified.error}` };
    lessons.push(parsed);
    previous = parsed;
  }
  return { ok: true, lessons };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') return { ok: true, modes: ['--help', '--cluster-witnesses', '--consolidate', '--verify-lessons-jsonl'], minClusterSize: MIN_CLUSTER_SIZE, minPredicted: MIN_PREDICTED };
    const input = parseJsonInput(stdinText);
    if (mode === '--cluster-witnesses') return clusterWitnesses(input);
    if (mode === '--consolidate') return consolidate(input);
    if (mode === '--verify-lessons-jsonl') return parseLessonsJsonl(input.lessonsText ?? input.text ?? input);
    return { ok: false, error: `unknown lesson harness mode: ${mode}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isCliMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliMain()) {
  const mode = process.argv[2] ?? '--help';
  const stdinText = mode === '--help' ? '' : fs.readFileSync(0, 'utf8');
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok === false ? 1 : 0; // exit() truncava stdout >64KiB em pipe (ver disproof-corpus-harness)
}
