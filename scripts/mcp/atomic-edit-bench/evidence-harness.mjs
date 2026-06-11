#!/usr/bin/env node
/**
 * evidence-harness.mjs — agregador determinístico de evidência de produção do atomic.
 *
 * Lê APENAS dados já materializados (.atomic/traces/*.json, .atomic/exec-ledger.jsonl,
 * .atomic/bypass-ledger.jsonl) e consolida os três eixos mensuráveis da régua
 * "mais rápido / mais econômico / mais infalível":
 *
 *  - INFALIBILIDADE: quantas operações persistidas deixaram o arquivo com erro de
 *    sintaxe (syntaxErrorsAfter>0 sobre base limpa) — a afirmação-alvo é ZERO;
 *    quantos comandos mutantes foram recusados ANTES de tocar o disco; quantos
 *    bypasses o deny-hook bloqueou.
 *  - ECONOMIA: distribuição do fator de expansão evitado (chars que o agente NÃO
 *    precisou reescrever porque a edição é sub-linha/char-level) e bytes líquidos.
 *  - VELOCIDADE: percentis de duração dos comandos no envelope.
 *
 * Saída: JSON único no stdout. Nenhuma escrita em disco. Nenhuma amostragem:
 * varre 100% dos registros; caps explícitos viram campos *Skipped (sem teto
 * silencioso). Determinístico dado o estado dos ledgers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TRACES_DIR = path.join(ROOT, '.atomic/traces');
const EXEC_LEDGER = path.join(ROOT, '.atomic/exec-ledger.jsonl');
const BYPASS_LEDGER = path.join(ROOT, '.atomic/bypass-ledger.jsonl');

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeTraces() {
  const files = fs.readdirSync(TRACES_DIR).filter((f) => f.endsWith('.json'));
  const out = {
    totalOps: files.length,
    parsedOps: 0,
    unparsableOps: 0,
    byOperation: {},
    syntaxValidatedOps: 0,
    syntaxBreaksPersisted: 0, // alvo: 0 — op persistida que deixou erros novos de sintaxe
    syntaxBreaksPersistedExamples: [],
    preexistingDirtyOps: 0, // arquivo já tinha erros antes (não conta como quebra introduzida)
    expansion: { samples: 0, ge2x: 0, ge10x: 0, ge100x: 0, totalIntentionChars: 0, totalSurfaceChars: 0 },
    negativeActionProofs: 0,
    filesTouched: new Set(),
  };
  for (const f of files) {
    let t;
    try {
      t = JSON.parse(fs.readFileSync(path.join(TRACES_DIR, f), 'utf8'));
    } catch {
      out.unparsableOps += 1;
      continue;
    }
    out.parsedOps += 1;
    const op = t.operation ?? t.op ?? 'unknown';
    out.byOperation[op] = (out.byOperation[op] ?? 0) + 1;
    if (t.target?.file) out.filesTouched.add(t.target.file);
    else if (t.file) out.filesTouched.add(t.file);
    const v = t.validation;
    if (v && typeof v.syntaxErrorsBefore === 'number' && typeof v.syntaxErrorsAfter === 'number') {
      out.syntaxValidatedOps += 1;
      if (v.syntaxErrorsBefore > 0) out.preexistingDirtyOps += 1;
      else if (v.syntaxErrorsAfter > v.syntaxErrorsBefore) {
        out.syntaxBreaksPersisted += 1;
        if (out.syntaxBreaksPersistedExamples.length < 10) out.syntaxBreaksPersistedExamples.push(f);
      }
    }
    const m = t.metrics ?? {};
    const intention = typeof m.changedChars === 'number' ? m.changedChars : null;
    const surface = typeof m.lineRewriteSurfaceChars === 'number' ? m.lineRewriteSurfaceChars : null;
    const factor = typeof m.expansionFactorAvoided === 'number' ? m.expansionFactorAvoided : null;
    if (factor !== null) {
      out.expansion.samples += 1;
      if (factor >= 2) out.expansion.ge2x += 1;
      if (factor >= 10) out.expansion.ge10x += 1;
      if (factor >= 100) out.expansion.ge100x += 1;
    }
    if (intention !== null && surface !== null) {
      out.expansion.totalIntentionChars += intention;
      out.expansion.totalSurfaceChars += surface;
    }
    if (t.negativeActionProof) out.negativeActionProofs += 1;
  }
  out.filesTouched = out.filesTouched.size;
  return out;
}

function summarizeExecLedger() {
  const out = {
    totalRecords: 0,
    unparsableRecords: 0,
    okTrue: 0,
    okFalseNonZeroExit: 0,
    refusedPreSpawn: 0, // recusa ANTES de criar o processo: nada tocou o disco
    refusalReasons: {},
    effectProvenRuns: 0,
    rolledBackRuns: 0,
    sandboxActiveRuns: 0,
    durationsMs: [],
  };
  // schema real do ledger (verificado): registros discriminados por `kind` —
  // exec (rodou; exitCode real), refused (recusa PRÉ-SPAWN com `reason`),
  // spawn-error, timeout. Não existe campo `ok` no ledger.
  out.byKind = {};
  const text = fs.readFileSync(EXEC_LEDGER, 'utf8');
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    out.totalRecords += 1;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      out.unparsableRecords += 1;
      continue;
    }
    const kind = String(r.kind ?? 'unknown');
    out.byKind[kind] = (out.byKind[kind] ?? 0) + 1;
    if (kind === 'refused') {
      out.refusedPreSpawn += 1;
      const key = String(r.reason ?? 'unspecified').slice(0, 96);
      out.refusalReasons[key] = (out.refusalReasons[key] ?? 0) + 1;
    } else if (kind === 'exec') {
      if (r.exitCode === 0) out.okTrue += 1;
      else out.okFalseNonZeroExit += 1;
      if (typeof r.durationMs === 'number') out.durationsMs.push(r.durationMs);
    }
    if (r.effect) out.effectProvenRuns += 1;
    if (r.rolledBack === true) out.rolledBackRuns += 1;
    if (r.sandbox?.active === true) out.sandboxActiveRuns += 1;
  }
  out.durationsMs.sort((a, b) => a - b);
  const d = out.durationsMs;
  out.duration = { n: d.length, p50: percentile(d, 50), p90: percentile(d, 90), p99: percentile(d, 99), maxMs: d[d.length - 1] ?? null };
  delete out.durationsMs;
  // só as 12 razões de recusa mais frequentes no relatório (o resto agregado)
  const entries = Object.entries(out.refusalReasons).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 12);
  const restCount = entries.slice(12).reduce((acc, [, n]) => acc + n, 0);
  out.refusalReasons = Object.fromEntries(top);
  out.refusalReasonsOther = restCount;
  return out;
}

function summarizeBypassLedger() {
  const out = { totalRecords: 0, preventedByDenyHook: 0, silentlyAllowedBypasses: 0, unparsableRecords: 0 };
  let text;
  try {
    text = fs.readFileSync(BYPASS_LEDGER, 'utf8');
  } catch {
    return { ...out, missing: true };
  }
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    out.totalRecords += 1;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      out.unparsableRecords += 1;
      continue;
    }
    if (r.blockedByDenyHook === true || r.preventedByDenyHook === true) out.preventedByDenyHook += 1;
    else if (r.silentlyAllowed === true || r.bypassed === true) out.silentlyAllowedBypasses += 1;
  }
  return out;
}

const result = {
  kind: 'atomic-evidence-dossier',
  scope: 'producao-real-deste-repo (ledgers/traces materializados; zero sintetico)',
  caveat:
    'Evidencia observacional de USO REAL, nao benchmark controlado: sem braco-controle nesta consolidacao. ' +
    'Traces cobrem operacoes PERSISTIDAS; recusas de edicao pre-disco nao geram trace e estao subcontadas aqui.',
  traces: summarizeTraces(),
  execLedger: summarizeExecLedger(),
  bypassLedger: summarizeBypassLedger(),
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
