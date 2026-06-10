#!/usr/bin/env node
/**
 * judge-latency.mjs — eixo "mais rápido": quanto custa o juiz pré-disco?
 *
 * Mede o wall-clock de engine.validate(file, before, after) — o preço pago POR
 * EDIÇÃO para a garantia de 0 estados sintáticos inválidos em disco — sobre o
 * mesmo corpus ancorado do bench v2 (git show, working tree intocado).
 *
 * Honestidade do desenho:
 *  - mede SÓ o juiz sintático clássico; gates adicionais (lint/typecheck/lattice)
 *    custam mais e não estão incluídos — declarado;
 *  - after = mutação benigna (caminho feliz, o caso quente de produção);
 *  - warm-up de 3 chamadas excluído (JIT/grammar load); p50/p90/p99 por gramática
 *    e por balde de tamanho;
 *  - âncora gravada; mesmo corpus ⇒ mesma carga (tempos variam por máquina, é
 *    medição física, não determinística — declarado).
 */
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const ENGINE = path.join(ROOT, 'scripts/mcp/atomic-edit/dist/engine.js');

const EXT_GRAMMARS = Object.freeze({
  '.ts': 'ts', '.tsx': 'ts', '.js': 'js', '.mjs': 'js',
  '.css': 'css', '.html': 'html', '.sql': 'sql', '.json': 'json',
});
const PER_GRAMMAR = 40;
const MIN_BYTES = 200;
const MAX_BYTES = 120_000;
const SKIP_PREFIXES = ['scripts/mcp/atomic-edit-bench/', 'graphify-out/', 'coverage/'];
const SKIP_SEGMENTS = ['node_modules/', '/dist/', '/.next/', '/coverage/', '/build/'];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function benign(text, grammar) {
  if (grammar === 'ts' || grammar === 'js') return text + '\n// bench marker\n';
  if (grammar === 'css') return text + '\n/* bench marker */\n';
  if (grammar === 'html') return text + '\n<!-- bench marker -->\n';
  if (grammar === 'sql') return text + '\n-- bench marker\n';
  if (grammar === 'json') {
    try {
      return JSON.stringify(JSON.parse(text), null, 2) + '\n';
    } catch {
      return null;
    }
  }
  return null;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  return { n: ms.length, p50: percentile(ms, 50), p90: percentile(ms, 90), p99: percentile(ms, 99), maxMs: ms[ms.length - 1] ?? null };
}

const eng = await import(ENGINE);
const anchor = git('rev-parse', process.env.BENCH_ANCHOR ?? 'HEAD').trim();

const lines = git('ls-tree', '-r', '-l', anchor).trim().split('\n');
const byGrammar = {};
for (const line of lines) {
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const rel = line.slice(tab + 1);
  const meta = line.slice(0, tab).split(/\s+/);
  if (meta[1] !== 'blob') continue;
  const size = Number(meta[3]);
  if (!Number.isFinite(size) || size < MIN_BYTES || size > MAX_BYTES) continue;
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;
  if (SKIP_SEGMENTS.some((s) => ('/' + rel).includes(s))) continue;
  const g = EXT_GRAMMARS[path.extname(rel)];
  if (!g) continue;
  (byGrammar[g] ??= []).push({ rel, size });
}

const all = [];
for (const [grammar, files] of Object.entries(byGrammar)) {
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  const n = Math.min(PER_GRAMMAR, files.length);
  const picked = [];
  for (let i = 0; i < n; i += 1) picked.push(files[Math.floor((i * files.length) / n)]);
  for (const { rel, size } of new Set(picked)) {
    let before;
    try {
      before = git('show', `${anchor}:${rel}`);
    } catch {
      continue;
    }
    const after = benign(before, grammar);
    if (after === null) continue;
    all.push({ rel, grammar, size, before, after });
  }
}

// warm-up: carrega gramáticas/JIT fora da medição
for (const s of all.slice(0, 3)) eng.validate(s.rel, s.before, s.after);

const samples = [];
for (const s of all) {
  const t0 = process.hrtime.bigint();
  eng.validate(s.rel, s.before, s.after);
  const t1 = process.hrtime.bigint();
  samples.push({ grammar: s.grammar, size: s.size, ms: Number(t1 - t0) / 1e6 });
}

const perGrammar = {};
for (const g of Object.keys(byGrammar)) perGrammar[g] = summarize(samples.filter((s) => s.grammar === g));
const buckets = {
  'ate-2KB': summarize(samples.filter((s) => s.size <= 2048)),
  '2-16KB': summarize(samples.filter((s) => s.size > 2048 && s.size <= 16384)),
  '16-120KB': summarize(samples.filter((s) => s.size > 16384)),
};

process.stdout.write(
  JSON.stringify(
    {
      kind: 'atomic-judge-latency',
      anchorCommit: anchor,
      caveat:
        'mede apenas o juiz sintatico classico (engine.validate) no caminho benigno; gates adicionais custam mais; tempos sao fisicos (variam por maquina), corpus e determinístico pela ancora',
      overall: summarize(samples),
      perGrammar,
      sizeBuckets: buckets,
      corpusSha256: crypto.createHash('sha256').update(all.map((s) => s.rel).join('\n'), 'utf8').digest('hex'),
    },
    null,
    2,
  ) + '\n',
);
