#!/usr/bin/env node
/**
 * mutation-bench-v2.mjs — AtomicBench v2: a versão que sobrevive ao próprio painel.
 *
 * Correções sobre o v1, dirigidas pelas REFUTAÇÕES do painel adversarial wf_1fcf4f07
 * (registradas em docs/evidence/atomic-evidence-dossier-2026-06-09.md):
 *
 *  R-v4 (determinismo): o corpus agora vem de um COMMIT ANCORADO (`git ls-tree -r -l`
 *    + `git show <anchor>:<path>`), nunca do working tree vivo. O resultado grava
 *    anchorCommit; mesma âncora ⇒ saída byte-idêntica (provado por dupla execução).
 *    A auto-minagem morre por construção: outputs do bench não existem no commit
 *    ancorado e, ainda assim, o diretório do bench é excluído do pool.
 *  R-v5 (interpretação): este bench mede ENFORCEMENT (o veredito do juiz declarado é
 *    aplicado pré-disco sem vazamento), NUNCA acurácia do juiz — exceto no braço
 *    JSON, onde um árbitro independente (JSON.parse) também julga cada proposta e o
 *    desacordo juiz×árbitro é REPORTADO (não assumido zero). O check "base válida"
 *    do v1 era vácuo (validate(b,b) é sempre ok por desenho relativo) — removido.
 *    Gramáticas cegas (parser não distingue quebrado canônico) ficam fora de TODOS
 *    os numeradores, inclusive o benigno (v1 inflava o benigno com 22 admissões
 *    grátis de gramáticas cegas).
 *
 * O braço controle segue sendo o teto vs escritor-sem-feedback — declarado, não
 * vendido como baseline de agente real.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCRATCH = path.join(HERE, '.scratch-v2');
const ENGINE = path.join(ROOT, 'scripts/mcp/atomic-edit/dist/engine.js');

const EXT_GRAMMARS = Object.freeze({
  '.ts': 'ts', '.tsx': 'ts', '.js': 'js', '.mjs': 'js',
  '.css': 'css', '.html': 'html', '.sql': 'sql', '.json': 'json',
});
const PER_GRAMMAR = 40;
const MIN_BYTES = 200;
const MAX_BYTES = 120_000;
// exclusões por PREFIXO de path no commit (o bench-dir sai por construção)
const SKIP_PREFIXES = ['scripts/mcp/atomic-edit-bench/', 'graphify-out/', 'coverage/'];
const SKIP_SEGMENTS = ['node_modules/', '/dist/', '/.next/', '/coverage/', '/build/'];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const offsetFor = (key, len) => (len <= 1 ? 0 : sha(key).readUInt32BE(0) % len);

function collectFilesAt(anchor) {
  // -l inclui o tamanho do blob: filtra por tamanho SEM ler conteúdo
  const lines = git('ls-tree', '-r', '-l', anchor).trim().split('\n');
  const byGrammar = {};
  for (const line of lines) {
    // <mode> blob <sha> <size>\t<path>
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
    (byGrammar[g] ??= []).push(rel);
  }
  const sampled = {};
  for (const [g, files] of Object.entries(byGrammar)) {
    files.sort();
    const n = Math.min(PER_GRAMMAR, files.length);
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(files[Math.floor((i * files.length) / n)]);
    sampled[g] = { population: files.length, files: [...new Set(out)] };
  }
  return sampled;
}

const MUTATIONS = Object.freeze({
  unbalance(text) {
    const idx = Math.max(text.lastIndexOf('}'), text.lastIndexOf(')'), text.lastIndexOf(']'), text.lastIndexOf('>'));
    if (idx < 0) return null;
    return text.slice(0, idx) + text.slice(idx + 1);
  },
  truncate(text) {
    if (text.length < 64) return null;
    return text.slice(0, Math.floor(text.length * 0.73));
  },
  midspanDelete(text, file) {
    if (text.length < 64) return null;
    const off = 1 + offsetFor(`${file}|midspan`, text.length - 32);
    return text.slice(0, off) + text.slice(off + 17);
  },
  garbageInsert(text, file) {
    const off = offsetFor(`${file}|garbage`, text.length);
    return text.slice(0, off) + '@#%({[' + text.slice(off);
  },
  benign(text, file, grammar) {
    if (grammar === 'ts' || grammar === 'js') return text + '\n// atomic-bench benign marker\n';
    if (grammar === 'css') return text + '\n/* atomic-bench benign marker */\n';
    if (grammar === 'html') return text + '\n<!-- atomic-bench benign marker -->\n';
    if (grammar === 'sql') return text + '\n-- atomic-bench benign marker\n';
    if (grammar === 'json') {
      try {
        return JSON.stringify(JSON.parse(text), null, 2) + '\n';
      } catch {
        return null;
      }
    }
    return null;
  },
});

/** Árbitro independente do braço JSON (não-circular): o juiz concorda com JSON.parse? */
function jsonArbiter(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const eng = await import(ENGINE);
  const anchor = git('rev-parse', process.env.BENCH_ANCHOR ?? 'HEAD').trim();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });

  const sampled = collectFilesAt(anchor);
  const result = {
    kind: 'atomic-mutation-bench-v2',
    anchorCommit: anchor,
    design:
      'corpus = blobs do commit ancorado (git ls-tree/show; working tree NUNCA é lido) ⇒ mesma âncora = saída byte-idêntica; ' +
      'mede ENFORCEMENT do juiz declarado (não acurácia), exceto braço JSON com árbitro independente JSON.parse; ' +
      'gramáticas cegas excluídas de TODOS os numeradores; controle = teto vs escritor-sem-feedback (declarado)',
    perGrammar: {},
    totals: { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, controlPersistedInvalid: 0, controlPersistedValid: 0 },
    benign: { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, falsePositiveExamples: [] },
    jsonArbiter: { judged: 0, judgeArbiterDisagreements: 0, disagreementExamples: [] },
    parserBlindGrammars: [],
    skippedNotApplicable: 0,
  };

  for (const [grammar, { population, files }] of Object.entries(sampled)) {
    const g = { population, sampledFiles: files.length, parserBlind: false, classes: {} };
    for (const cls of Object.keys(MUTATIONS)) {
      g.classes[cls] = { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, controlPersistedInvalid: 0, controlPersistedValid: 0 };
    }

    const judged = []; // bufferiza para decidir cegueira ANTES de somar aos totais
    for (const rel of files) {
      let before;
      try {
        before = git('show', `${anchor}:${rel}`);
      } catch {
        continue;
      }
      for (const [cls, mutate] of Object.entries(MUTATIONS)) {
        const after = mutate(before, rel, grammar);
        if (after === null || after === before) {
          result.skippedNotApplicable += 1;
          continue;
        }
        const verdict = eng.validate(rel, before, after);
        const scratchFile = path.join(SCRATCH, crypto.createHash('sha256').update(`${rel}|${cls}`).digest('hex').slice(0, 24) + path.extname(rel));
        fs.writeFileSync(scratchFile, after, 'utf8');
        const persisted = fs.readFileSync(scratchFile, 'utf8');
        const post = eng.validate(rel, before, persisted);
        judged.push({ rel, cls, verdictOk: verdict.ok === true, postOk: post.ok === true, introduced: verdict.introduced ?? null });
        if (grammar === 'json' && cls !== 'benign') {
          result.jsonArbiter.judged += 1;
          const arbiterValid = jsonArbiter(after);
          const judgeValid = verdict.ok === true;
          if (arbiterValid !== judgeValid) {
            result.jsonArbiter.judgeArbiterDisagreements += 1;
            if (result.jsonArbiter.disagreementExamples.length < 10) {
              result.jsonArbiter.disagreementExamples.push({ file: rel, cls, judgeValid, arbiterValid });
            }
          }
        }
      }
    }

    // cegueira derivada da EVIDÊNCIA: zero recusas em TODAS as classes quebradoras
    const breakingRefusals = judged.filter((j) => j.cls !== 'benign' && !j.verdictOk).length;
    g.parserBlind = breakingRefusals === 0;
    if (g.parserBlind) result.parserBlindGrammars.push(grammar);

    for (const j of judged) {
      const bucket = g.classes[j.cls];
      bucket.proposals += 1;
      if (j.verdictOk) bucket.atomicAdmitted += 1;
      else bucket.atomicRefused += 1;
      if (j.postOk) bucket.controlPersistedValid += 1;
      else bucket.controlPersistedInvalid += 1;
      if (g.parserBlind) continue; // gramática cega: fora de TODOS os numeradores
      if (j.cls === 'benign') {
        result.benign.proposals += 1;
        if (j.verdictOk) result.benign.atomicAdmitted += 1;
        else {
          result.benign.atomicRefused += 1;
          if (result.benign.falsePositiveExamples.length < 10) {
            result.benign.falsePositiveExamples.push({ file: j.rel, grammar, introduced: j.introduced });
          }
        }
      } else {
        result.totals.proposals += 1;
        if (j.verdictOk) result.totals.atomicAdmitted += 1;
        else result.totals.atomicRefused += 1;
        if (j.postOk) result.totals.controlPersistedValid += 1;
        else result.totals.controlPersistedInvalid += 1;
      }
    }
    result.perGrammar[grammar] = g;
  }

  fs.rmSync(SCRATCH, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n');
  process.exit(1);
});
