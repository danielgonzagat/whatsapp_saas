#!/usr/bin/env node
/**
 * real-refusal-harvester.mjs — III.a' (lado-ledger): converte as RECUSAS REAIS
 * já produzidas pelo atomic em produção (exec-ledger kind:"refused" e
 * bypass-ledger blockedByDenyHook:true) no corpus de disprovas hash-encadeado
 * do Movimento III. Primeira ponte instância-real → gradiente: nenhum dado
 * sintético, nenhuma política scriptada — só o que o envelope de fato recusou.
 *
 * HONESTIDADE DE ESCOPO: estas são recusas da SUPERFÍCIE DE FERRAMENTAS
 * (atomic_exec / deny-hook), NÃO rejeições do caminho de promoção do
 * atomic_expand_self (III.a engine-side, sob lock concorrente). O corpus
 * resultante é gradiente real de paredes reais, mas de outra família de
 * paredes; o consumidor engine-side continua pendente e este header só pode
 * ser enfraquecido quando ele existir.
 *
 * Determinismo: saída é função pura dos textos de ledger + archiveEntrySha256.
 * Sem Date.now, sem aleatoriedade. Geração = índice do balde de hora UTC do ts
 * real do evento (ordenado, denso a partir de 1) — dá ao III.d um eixo
 * temporal REAL para a validação por previsão.
 *
 * Réplica local de buildHitRecord: o builder de HIT não é exportado pelo
 * kernel; a cópia abaixo é byte-idêntica em forma e ordem de chaves, e o
 * juiz final é SEMPRE verifyCorpusJsonl do kernel — se a réplica derivar,
 * a cadeia REPROVA (drift é detectado, nunca silencioso).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildWitnessRecord,
  verifyCorpusJsonl,
  wallKey,
} from './disproof-corpus-harness.mjs';

const SCHEMA_VERSION = 1;
const HIT_KIND = 'atomic-disproof-wall-hit';
const HOUR_MS = 3600000;
const SHAPE_MAX = 100;
const SAMPLE_MAX = 160;
const REASON_MAX = 140;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function recordHash(body) {
  const copy = { ...body };
  delete copy.recordSha256;
  return canonicalSha256(copy);
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function truncate(text, max) {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** Réplica verbatim (forma + ordem de chaves) do builder interno do kernel. */
function buildHitRecordReplica({ previousRecord, targetRecord, proposalDigest, archiveEntrySha256, generation }) {
  const body = {
    kind: HIT_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: asNumber(previousRecord.sequence, 0) + 1,
    previousRecordSha256: recordHash(previousRecord),
    wallKey: targetRecord.wallKey,
    targetRecordSha256: targetRecord.recordSha256,
    proposalDigest,
    generation: asNumber(generation, 0),
    archiveEntrySha256,
  };
  return { ...body, recordSha256: recordHash(body) };
}

/**
 * Forma semântica do comando: colapsa whitespace, hex>=8→H, dígitos→N.
 * Comandos que diferem só em sufixos numéricos/hashes caem na MESMA parede
 * (ex.: .smoke-exec-unproven.70273.txt e .78452.txt); payloads distintos
 * permanecem paredes distintas dentro do mesmo cluster invariantId::head.
 */
export function commandShape(command) {
  return String(command ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[0-9a-f]{8,}/gi, 'H')
    .replace(/\d+/g, 'N')
    .slice(0, SHAPE_MAX);
}

export function commandHead(command) {
  const first = String(command ?? '').trim().split(/\s+/)[0] ?? '';
  const base = first.split('/').pop() ?? first;
  return base.length > 0 ? base : 'desconhecido';
}

/** Família decidível da recusa do exec-ledger, derivada de reason+commandClass. */
export function classifyExecRefusal({ reason = '', commandClass = '' }) {
  const r = String(reason);
  if (/governance/i.test(r)) return 'governance-file-write';
  if (commandClass === 'external-or-host-effect' || /external|host-effect|broker/i.test(r)) return 'external-or-host-effect';
  if (/proveEffect/i.test(r)) return 'effect-proof-required';
  if (commandClass === 'read-only') return 'read-only-sandbox';
  return 'other';
}

const REPAIR_HINT_BY_FAMILY = {
  'effect-proof-required': 'adicione proveEffect:true e um effectRoot pequeno; efeito de shell não provado não é byte-correto-por-construção',
  'governance-file-write': 'arquivos sob governança só mudam pelas superfícies atômicas (atomic_expand_self / atomic_edit), nunca por escrita de shell',
  'external-or-host-effect': 'efeito externo/host não é aprovável por prova de filesystem; use a superfície dedicada ou peça operação humana',
  'read-only-sandbox': 'o sandbox read-only negou; rode a variante com proveEffect+effectRoot ou divida o comando',
  other: null,
};

/** Mapeia 1 linha refused do exec-ledger → witnessArgs (sem previousRecord). */
export function mapExecRefusal(entry, { archiveEntrySha256 }) {
  if (!isRecord(entry) || entry.kind !== 'refused') return null;
  if (!nonEmptyString(entry.command) || !nonEmptyString(entry.reason)) return null;
  const family = classifyExecRefusal(entry);
  const head = commandHead(entry.command);
  const shape = commandShape(entry.command);
  const hint = REPAIR_HINT_BY_FAMILY[family];
  return {
    ts: asNumber(entry.ts, 0),
    invariantId: `atomic-exec.refusal.${family}`,
    locus: { file: `exec/${head}`, region: shape },
    counterexample: {
      source: 'exec-ledger',
      commandClass: String(entry.commandClass ?? ''),
      commandShape: shape,
      sample: truncate(entry.command, SAMPLE_MAX),
      reasonHead: truncate(entry.reason, REASON_MAX),
      cwdTail: String(entry.cwd ?? '').split('/').slice(-2).join('/'),
    },
    proposalDigest: sha256Text(`${asNumber(entry.ts, 0)}|${entry.command}`),
    verdictCodes: [family],
    ...(hint ? { repairHint: hint } : {}),
    archiveEntrySha256,
  };
}

/** Mapeia 1 linha blockedByDenyHook:true (estrita) do bypass-ledger → witnessArgs. */
export function mapBypassEvent(entry, { archiveEntrySha256 }) {
  if (!isRecord(entry) || entry.blockedByDenyHook !== true) return null;
  if (entry.strictAtomicOnly !== true) return null;
  const tool = nonEmptyString(entry.tool) ? entry.tool : 'desconhecido';
  const target = nonEmptyString(entry.target) ? entry.target : '';
  const category = nonEmptyString(entry.category) ? entry.category : 'sem-categoria';
  const equivalent = nonEmptyString(entry.atomicEquivalent) ? entry.atomicEquivalent : null;
  return {
    ts: asNumber(entry.ts, 0),
    invariantId: `deny-hook.blocked.${category}`,
    locus: { file: `tool/${tool}`, region: target },
    counterexample: {
      source: 'deny-hook-ledger',
      tool,
      target,
      category,
      atomicEquivalent: equivalent,
    },
    proposalDigest: sha256Text(`${asNumber(entry.ts, 0)}|${tool}|${target}|${category}`),
    verdictCodes: ['blocked-by-deny-hook'],
    ...(equivalent ? { repairHint: `chamada nativa bloqueada; use ${equivalent}` } : {}),
    archiveEntrySha256,
  };
}

function parseJsonlLines(text) {
  const lines = String(text ?? '').split('\n');
  const parsed = [];
  let invalidJson = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    try {
      const value = JSON.parse(line);
      if (isRecord(value)) parsed.push(value);
      else invalidJson += 1;
    } catch {
      invalidJson += 1;
    }
  }
  return { parsed, invalidJson };
}

/**
 * harvest — pipeline puro: ledgers → eventos → geração (hora UTC densa) →
 * cadeia witness/hit com dedup semântico por wallKey → corpus verificado pelo
 * KERNEL. Sem caps silenciosos: stats reconciliam cada linha de entrada.
 */
export function harvest({ execLedgerText = '', bypassLedgerText = '', archiveEntrySha256, parentSha = null }) {
  if (!nonEmptyString(archiveEntrySha256)) {
    return { ok: false, error: 'archiveEntrySha256 é obrigatório (toda parede tem endereço na linhagem real)' };
  }
  const exec = parseJsonlLines(execLedgerText);
  const denyLedger = parseJsonlLines(bypassLedgerText);
  const events = [];
  let execRefused = 0;
  let execSkippedFields = 0;
  let bypassBlockedStrict = 0;
  let bypassSkippedNonStrict = 0;
  for (const entry of exec.parsed) {
    if (entry.kind !== 'refused') continue;
    execRefused += 1;
    const mapped = mapExecRefusal(entry, { archiveEntrySha256 });
    if (mapped) events.push(mapped);
    else execSkippedFields += 1;
  }
  for (const entry of denyLedger.parsed) {
    if (entry.blockedByDenyHook !== true) continue;
    if (entry.strictAtomicOnly !== true) {
      bypassSkippedNonStrict += 1;
      continue;
    }
    bypassBlockedStrict += 1;
    const mapped = mapBypassEvent(entry, { archiveEntrySha256 });
    if (mapped) events.push(mapped);
  }
  events.sort((a, b) => a.ts - b.ts || a.proposalDigest.localeCompare(b.proposalDigest));
  const buckets = [...new Set(events.map((event) => Math.floor(event.ts / HOUR_MS)))].sort((a, b) => a - b);
  const generationOf = new Map(buckets.map((bucket, index) => [bucket, index + 1]));

  const records = [];
  const wallIndex = new Map();
  let previousRecord = null;
  let witnesses = 0;
  let hits = 0;
  for (const event of events) {
    const generation = generationOf.get(Math.floor(event.ts / HOUR_MS));
    const key = wallKey(event.invariantId, event.locus);
    const existing = wallIndex.get(key);
    let record;
    if (existing) {
      record = buildHitRecordReplica({
        previousRecord,
        targetRecord: existing,
        proposalDigest: event.proposalDigest,
        archiveEntrySha256,
        generation,
      });
      hits += 1;
    } else {
      const { ts, ...witnessArgs } = event;
      record = buildWitnessRecord({ ...witnessArgs, generation, parentSha, previousRecord });
      wallIndex.set(key, record);
      witnesses += 1;
    }
    records.push(record);
    previousRecord = record;
  }
  const corpusText = records.length === 0 ? '' : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const chain = verifyCorpusJsonl(corpusText);
  if (chain.ok !== true) {
    return { ok: false, error: `corpus colhido REPROVADO pelo kernel (drift da réplica?): ${chain.error}` };
  }
  const byInvariant = {};
  for (const record of records) {
    if (record.kind !== 'atomic-disproof-witness-record') continue;
    byInvariant[record.invariantId] = (byInvariant[record.invariantId] ?? 0) + 1;
  }
  return {
    ok: true,
    corpusText,
    chain,
    stats: {
      exec: { parsedLines: exec.parsed.length, invalidJson: exec.invalidJson, refused: execRefused, skippedFields: execSkippedFields },
      denyLedger: { parsedLines: denyLedger.parsed.length, invalidJson: denyLedger.invalidJson, blockedStrict: bypassBlockedStrict, skippedNonStrict: bypassSkippedNonStrict },
      events: events.length,
      witnesses,
      hits,
      walls: chain.wallCount,
      generations: buckets.length,
      byInvariant,
    },
    invariantIds: Object.keys(byInvariant).sort(),
  };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

const SELF_TEST_EXEC = [
  '{"ts":3600000,"kind":"refused","reason":"mutable-or-unknown command requires proveEffect:true (or rollbackOnNonZero:true) under Y admission","commandClass":"mutable-or-unknown","command":"node -e \'fs.writeFileSync(\\".tmp.111.txt\\")\'","cwd":"/repo"}',
  '{"ts":7200000,"kind":"refused","reason":"mutable-or-unknown command requires proveEffect:true (or rollbackOnNonZero:true) under Y admission","commandClass":"mutable-or-unknown","command":"node -e \'fs.writeFileSync(\\".tmp.222.txt\\")\'","cwd":"/repo"}',
  '{"ts":10800000,"kind":"refused","reason":"refused: governance-protected file write via shell","commandClass":"mutable-or-unknown","command":"echo x > scripts/mcp/atomic-edit/server.ts","cwd":"/repo"}',
  '{"ts":10800001,"kind":"ok-not-a-refusal","command":"ls"}',
].join('\n');

const SELF_TEST_BYPASS = [
  '{"ts":3600500,"tool":"Bash","category":"bash-exec","atomicEquivalent":"atomic_exec","blockedByDenyHook":true,"strictAtomicOnly":true,"target":"sed"}',
  '{"ts":3600600,"tool":"Bash","category":"bash-exec","atomicEquivalent":"atomic_exec","blockedByDenyHook":true,"strictAtomicOnly":false,"target":"awk"}',
].join('\n');

function cliSelfTest() {
  const result = harvest({
    execLedgerText: SELF_TEST_EXEC,
    bypassLedgerText: SELF_TEST_BYPASS,
    archiveEntrySha256: sha256Text('self-test-archive-entry'),
  });
  if (result.ok !== true) return { ok: false, error: `self-test harvest falhou: ${result.error}` };
  const expect = (cond, label) => (cond ? null : label);
  const failures = [
    expect(result.stats.events === 4, 'eventos != 4 (3 exec refused + 1 bloqueio estrito)'),
    expect(result.stats.witnesses === 3, 'witnesses != 3 (forma N dedupa .tmp.111/.tmp.222)'),
    expect(result.stats.hits === 1, 'hits != 1'),
    expect(result.stats.denyLedger.skippedNonStrict === 1, 'não-estrito não foi excluído'),
    expect(result.stats.generations === 3, 'baldes de hora != 3'),
    expect(result.chain.ok === true, 'cadeia reprovada'),
  ].filter(Boolean);
  if (failures.length > 0) return { ok: false, error: failures.join('; ') };
  const tampered = result.corpusText.replace('atomic-exec.refusal', 'atomic-exec.FORJADO');
  const tamperedVerify = verifyCorpusJsonl(tampered);
  if (tamperedVerify.ok === true) return { ok: false, error: 'FALHA: corpus adulterado verificou (forja aceita)' };
  return {
    ok: true,
    stats: result.stats,
    forgedRejected: true,
    corpusSha256: sha256Text(result.corpusText),
  };
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return {
        ok: true,
        modes: ['--help', '--self-test', '--harvest'],
        stdin: 'JSON {execLedgerText, bypassLedgerText, archiveEntrySha256, parentSha?} — NUNCA JSONL cru',
      };
    }
    if (mode === '--self-test') return cliSelfTest();
    const input = parseJsonInput(stdinText);
    if (mode === '--harvest') return harvest(input);
    return { ok: false, error: `modo desconhecido do harvester: ${mode}` };
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
  const needsInput = !['--help', '--self-test'].includes(mode);
  const stdinText = needsInput ? fs.readFileSync(0, 'utf8') : '';
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok === false ? 1 : 0; // exit() truncava stdout >64KiB em pipe (ver disproof-corpus-harness)
}
