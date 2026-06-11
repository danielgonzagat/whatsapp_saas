#!/usr/bin/env node
/**
 * lang-validate-wasm.mjs — juiz sintático in-node para gramáticas wasm VENDORED
 * (css, sql, html), chamado por lang-bridge.validateTreeSitter via spawnSync com
 * o MESMO contrato JSON do bridge python (lang-validate.py):
 *   stdout {"errors": N, "firstError": "..."} — ou {"skipped": true} quando a
 *   gramática/arquivo não puder ser carregado (caller faz fallback honesto).
 *
 * Razão de existir: o caminho python não tem tree_sitter_{css,sql,html} e o
 * mapeamento antigo julgava .sql/.css com a gramática JAVASCRIPT — falso-positivo
 * (SELECT válido recusado) + falso-verde (css truncado pela metade admitido),
 * provados em docs/evidence/atomic-evidence-dossier-2026-06-09.md. Os wasm reais
 * já estavam vendored em node_modules; este helper apenas os usa.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NM = path.join(HERE, 'node_modules');
const WASM = {
  css: path.join(NM, 'tree-sitter-css/tree-sitter-css.wasm'),
  sql: path.join(NM, '@derekstride/tree-sitter-sql/tree-sitter-sql.wasm'),
  html: path.join(NM, 'tree-sitter-html/tree-sitter-html.wasm'),
};

const [, , file, lang] = process.argv;
try {
  const wasm = WASM[lang];
  if (!wasm || !file) throw new Error('unsupported language or missing file arg');
  const text = fs.readFileSync(file, 'utf8');
  const wts = await import(path.join(NM, 'web-tree-sitter/web-tree-sitter.js'));
  const Parser = wts.Parser ?? wts.default;
  const Language = wts.Language ?? Parser.Language;
  await Parser.init();
  const language = await Language.load(wasm);
  const parser = new Parser();
  parser.setLanguage(language);
  const root = parser.parse(text).rootNode;
  let errors = 0;
  let firstError;
  const walk = (node) => {
    if (node.type === 'ERROR' || node.isMissing) {
      errors += 1;
      if (!firstError) {
        const p = node.startPosition;
        const snippet = text
          .slice(node.startIndex, Math.min(node.endIndex, node.startIndex + 40))
          .replace(/\s+/g, ' ');
        firstError = `parse error at ${p.row + 1}:${p.column + 1}: unexpected '${snippet}'`;
      }
    }
    for (let i = 0; i < node.childCount; i += 1) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };
  walk(root);
  // tree-sitter pode reportar hasError sem materializar nó ERROR visitável
  // (ex.: css `color: ;`) — conte como 1 para não engolir a quebra.
  if (errors === 0 && root.hasError) {
    errors = 1;
    firstError = firstError ?? 'parse error: grammar reports hasError without an ERROR node';
  }
  process.stdout.write(JSON.stringify({ errors, firstError }) + '\n');
} catch {
  process.stdout.write(JSON.stringify({ skipped: true }) + '\n');
}
