#!/usr/bin/env node
/**
 * mutation-bench.mjs — AtomicBench v1: benchmark CONTROLADO de infalibilidade sintática.
 *
 * Pergunta medida: dado o MESMO conjunto de edições propostas (4 classes que quebram
 * sintaxe + 1 classe benigna), quantos estados inválidos chegam ao disco em cada braço?
 *
 *  - BRAÇO ATOMIC: a proposta é julgada pelo validador REAL do engine
 *    (dist/engine.js validate(file, before, after) — o mesmo juiz de todas as
 *    9.3k operações de produção). !ok ⇒ nada é escrito (pré-disco).
 *  - BRAÇO CONTROLE: a proposta é escrita incondicionalmente numa cópia-scratch
 *    (fs.writeFileSync — o modus operandi de patch textual sem validação) e o
 *    estado persistido é então classificado.
 *
 * Honestidade do desenho (declarada, não escondida):
 *  - "inválido" é RELATIVO À BATERIA DECLARADA (o parser do engine) — exatamente o
 *    escopo da garantia atomic; não é correção universal (Rice intacto).
 *  - mutações são sintéticas mas determinísticas (offsets por sha256(path|classe);
 *    zero aleatoriedade ⇒ qualquer terceiro re-executa byte-idêntico).
 *  - a classe BENIGNA mede a taxa de falso-positivo: recusar tudo zeraria quebras
 *    trivialmente; o braço atomic precisa ADMITIR o benigno para o resultado valer.
 *  - gramáticas cujo parser real não distingue bom/ruim são reportadas como
 *    parserBlind e EXCLUÍDAS da afirmação (não contadas como vitória).
 *
 * Saída: JSON no stdout. Scratch apagado ao final; nenhum byte fora do dir do bench.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCRATCH = path.join(HERE, '.scratch');
const ENGINE = path.join(ROOT, 'scripts/mcp/atomic-edit/dist/engine.js');

const EXT_GRAMMARS = Object.freeze({
  '.ts': 'ts', '.tsx': 'ts', '.js': 'js', '.mjs': 'js',
  '.css': 'css', '.html': 'html', '.sql': 'sql', '.json': 'json',
});
const PER_GRAMMAR = 40;
const MIN_BYTES = 200;
const MAX_BYTES = 120_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.atomic', 'coverage', 'build', '.scratch']);

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
const offsetFor = (key, len) => (len <= 1 ? 0 : sha(key).readUInt32BE(0) % len);

function collectFiles() {
  const byGrammar = {};
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.well-known') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      const g = EXT_GRAMMARS[path.extname(e.name)];
      if (!g) continue;
      let size;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (size < MIN_BYTES || size > MAX_BYTES) continue;
      (byGrammar[g] ??= []).push(full);
    }
  };
  walk(ROOT);
  // amostragem determinística: ordena e pega PER_GRAMMAR igualmente espaçados
  const sampled = {};
  for (const [g, files] of Object.entries(byGrammar)) {
    files.sort();
    const n = Math.min(PER_GRAMMAR, files.length);
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(files[Math.floor((i * files.length) / n)]);
    sampled[g] = [...new Set(out)];
  }
  return sampled;
}

/** Mutações determinísticas. Retorna null quando a classe não se aplica ao conteúdo. */
const MUTATIONS = Object.freeze({
  // remove o ÚLTIMO fechador estrutural — desbalanceia
  unbalance(text) {
    const idx = Math.max(text.lastIndexOf('}'), text.lastIndexOf(')'), text.lastIndexOf(']'), text.lastIndexOf('>'));
    if (idx < 0) return null;
    return text.slice(0, idx) + text.slice(idx + 1);
  },
  // corta o arquivo em ~73% — quase sempre mid-token/mid-bloco
  truncate(text) {
    if (text.length < 64) return null;
    return text.slice(0, Math.floor(text.length * 0.73));
  },
  // deleta um span de 17 bytes a partir de offset derivado do hash — rasga tokens
  midspanDelete(text, file) {
    if (text.length < 64) return null;
    const off = 1 + offsetFor(`${file}|midspan`, text.length - 32);
    return text.slice(0, off) + text.slice(off + 17);
  },
  // injeta lixo não-fechado num offset derivado do hash
  garbageInsert(text, file) {
    const off = offsetFor(`${file}|garbage`, text.length);
    return text.slice(0, off) + '@#%({[' + text.slice(off);
  },
  // BENIGNA por gramática — precisa ser admitida para o bench valer
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

async function main() {
  const eng = await import(ENGINE);
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });

  const sampled = collectFiles();
  const result = {
    kind: 'atomic-mutation-bench-v1',
    design: 'mesmas propostas nos 2 braços; atomic = engine.validate pré-disco; controle = writeFileSync incondicional; inválido é relativo à bateria declarada (parser real por gramática); mutações determinísticas por sha256 — re-executável byte-idêntico',
    perGrammar: {},
    totals: { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, controlPersistedInvalid: 0, controlPersistedValid: 0 },
    benign: { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, falsePositiveExamples: [] },
    parserBlindGrammars: [],
    skippedNotApplicable: 0,
  };

  for (const [grammar, files] of Object.entries(sampled)) {
    // sonda de cegueira: partindo de uma base VÁLIDA mínima, o parser desta
    // gramática acusa um quebrado canônico? (before='' mascara introdução —
    // defeito da v1 da sonda que rotulou json como cego enquanto as medições
    // por arquivo recusavam 40/40 unbalance; base válida elimina o falso rótulo)
    const PROBE_GOOD = { ts: 'const a = 1;\n', js: 'const a = 1;\n', css: 'a { color: red; }\n', html: '<div></div>\n', sql: 'SELECT 1;\n', json: '{"a":1}\n' };
    const PROBE_BAD = { ts: 'const a = {;\n', js: 'const a = {;\n', css: 'a { color: ;\n', html: '<div><span></div>\n', sql: 'SELEC 1;;;(\n', json: '{ "a": \n' };
    const ext = grammar === 'ts' ? '.ts' : grammar === 'js' ? '.js' : '.' + grammar;
    const probe = eng.validate(`probe${ext}`, PROBE_GOOD[grammar], PROBE_BAD[grammar]);
    const parserBlind = probe.ok === true;
    if (parserBlind) result.parserBlindGrammars.push(grammar);

    const g = { files: files.length, parserBlind, classes: {} };
    for (const cls of Object.keys(MUTATIONS)) {
      g.classes[cls] = { proposals: 0, atomicAdmitted: 0, atomicRefused: 0, controlPersistedInvalid: 0, controlPersistedValid: 0 };
    }

    for (const abs of files) {
      const rel = path.relative(ROOT, abs);
      let before;
      try {
        before = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      // só entram arquivos cuja base é válida pela bateria (senão não medimos introdução)
      const base = eng.validate(rel, before, before);
      if (base.ok !== true) continue;

      for (const [cls, mutate] of Object.entries(MUTATIONS)) {
        const after = mutate(before, rel, grammar);
        if (after === null || after === before) {
          result.skippedNotApplicable += 1;
          continue;
        }
        const isBenign = cls === 'benign';
        const bucket = g.classes[cls];
        bucket.proposals += 1;

        // BRAÇO ATOMIC: julga ANTES do disco com o validador real de produção
        const verdict = eng.validate(rel, before, after);
        if (verdict.ok === true) bucket.atomicAdmitted += 1;
        else bucket.atomicRefused += 1;

        // BRAÇO CONTROLE: escreve incondicionalmente, depois classifica o que persistiu
        const scratchFile = path.join(SCRATCH, crypto.createHash('sha256').update(`${rel}|${cls}`).digest('hex').slice(0, 24) + path.extname(rel));
        fs.writeFileSync(scratchFile, after, 'utf8');
        const persisted = fs.readFileSync(scratchFile, 'utf8');
        const post = eng.validate(rel, before, persisted);
        if (post.ok === true) bucket.controlPersistedValid += 1;
        else bucket.controlPersistedInvalid += 1;

        if (isBenign) {
          result.benign.proposals += 1;
          if (verdict.ok === true) result.benign.atomicAdmitted += 1;
          else {
            result.benign.atomicRefused += 1;
            if (result.benign.falsePositiveExamples.length < 10) {
              result.benign.falsePositiveExamples.push({ file: rel, grammar, introduced: verdict.introduced ?? null });
            }
          }
        } else if (!parserBlind) {
          result.totals.proposals += 1;
          if (verdict.ok === true) result.totals.atomicAdmitted += 1;
          else result.totals.atomicRefused += 1;
          if (post.ok === true) result.totals.controlPersistedValid += 1;
          else result.totals.controlPersistedInvalid += 1;
        }
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
