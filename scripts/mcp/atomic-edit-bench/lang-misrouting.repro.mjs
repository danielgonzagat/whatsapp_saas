#!/usr/bin/env node
/**
 * lang-misrouting.repro.mjs — witness executável do capability-gap descoberto
 * pelo AtomicBench v1 (2026-06-09): engine.validate — o juiz sintático dos
 * operadores clássicos (atomic_replace_text, atomic_create_file, …) — roteia
 * .sql e .css para o parser JAVASCRIPT e .html para 'generic' (sem parser),
 * embora as gramáticas reais (sql/css/html via wasm) existam no engine
 * universal (lang-bridge/native-bridge).
 *
 * Consequências provadas aqui, byte-a-byte:
 *  F1 (.sql, falso-POSITIVO): appendar `SELECT 1;` válido a uma migration real
 *     é RECUSADO (vira "erro de JS" novo); appendar comentário `--` idem;
 *     `/* ... *\/` é aceito porque é comentário VÁLIDO EM JS.
 *  F2 (.css, falso-VERDE): truncar METADE de um css válido é ADMITIDO — o
 *     floor de erros-before (centenas de "erros JS" num css são constantes)
 *     mascara qualquer quebra real.
 *  F3 (.html, cegueira): language='generic', 0 erros sempre — sem juiz.
 *
 * Correção mora em scripts/mcp/atomic-edit/** (sob lock de outro front no
 * momento da descoberta): validate() deve rotear ext→gramática real, como o
 * caminho universal já faz. Quando consertado, este witness imprime
 * defectPresent:false nos três e vira candidato a regression-proof.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eng = await import(path.join(ROOT, 'scripts/mcp/atomic-edit/dist/engine.js'));

function firstFile(ext) {
  const skip = new Set(['node_modules', '.git', 'dist', '.next', '.atomic', '.scratch']);
  const stack = [ROOT];
  const found = [];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (full.endsWith(ext)) {
        const size = fs.statSync(full).size;
        if (size > 200 && size < 100_000) found.push(full);
      }
    }
  }
  found.sort();
  return found[0] ?? null;
}

const out = { kind: 'lang-misrouting-witness', cases: {} };

// F1 — .sql roteado para JS: SELECT válido recusado
const sqlAbs = firstFile('.sql');
if (sqlAbs) {
  const rel = path.relative(ROOT, sqlAbs);
  const before = fs.readFileSync(sqlAbs, 'utf8');
  const validSelect = eng.validate(rel, before, before + '\nSELECT 1;\n');
  const jsBlockComment = eng.validate(rel, before, before + '\n/* js-style */\n');
  out.cases.sqlFalsePositive = {
    file: rel,
    reportedLanguage: validSelect.language,
    validSqlAppendRefused: validSelect.ok === false,
    jsBlockCommentAdmitted: jsBlockComment.ok === true,
    defectPresent: validSelect.language !== 'sql' && validSelect.ok === false && jsBlockComment.ok === true,
  };
}

// F2 — .css roteado para JS: truncar metade é admitido (falso-verde)
const cssAbs = firstFile('.css');
if (cssAbs) {
  const rel = path.relative(ROOT, cssAbs);
  const before = fs.readFileSync(cssAbs, 'utf8');
  const base = eng.validate(rel, before, before);
  const truncated = eng.validate(rel, before, before.slice(0, Math.floor(before.length / 2)));
  out.cases.cssFalseGreen = {
    file: rel,
    reportedLanguage: base.language,
    baselineErrorFloor: base.before,
    halfTruncationAdmitted: truncated.ok === true,
    defectPresent: base.language !== 'css' && truncated.ok === true,
  };
}

// F3 — .html sem parser: generic, cego
const htmlAbs = firstFile('.html');
if (htmlAbs) {
  const rel = path.relative(ROOT, htmlAbs);
  const before = fs.readFileSync(htmlAbs, 'utf8');
  const base = eng.validate(rel, before, before);
  const truncated = eng.validate(rel, before, before.slice(0, Math.floor(before.length / 2)));
  out.cases.htmlBlind = {
    file: rel,
    reportedLanguage: base.language,
    halfTruncationAdmitted: truncated.ok === true,
    defectPresent: base.language !== 'html' && truncated.ok === true,
  };
}

out.defectPresentAnywhere = Object.values(out.cases).some((c) => c.defectPresent);
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
