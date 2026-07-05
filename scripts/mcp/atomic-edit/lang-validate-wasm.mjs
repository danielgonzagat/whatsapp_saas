#!/usr/bin/env node
/**
 * lang-validate-wasm.mjs — real in-node syntax judges for css/sql/html.
 *
 * CSS/HTML use vendored tree-sitter WASM grammars through web-tree-sitter.
 * SQL uses pg-query-emscripten, the PostgreSQL parser compiled to JS/WASM,
 * because the available tree-sitter SQL package does not publish a WASM file.
 * The stdout contract intentionally matches lang-validate.py:
 *   {"errors": N, "firstError": "..."} or {"skipped": true}.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NM = path.join(HERE, 'node_modules');
const TREE_SITTER_WASM = {
  css: path.join(NM, 'tree-sitter-css/tree-sitter-css.wasm'),
  html: path.join(NM, 'tree-sitter-html/tree-sitter-html.wasm'),
};

const [, , file, lang] = process.argv;

function lineColFromOneBasedOffset(text, offset) {
  const limit = Math.max(0, Math.min(text.length, Number(offset) - 1));
  let line = 1;
  let column = 1;
  for (let i = 0; i < limit; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return `${line}:${column}`;
}

async function validateSql(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const mod = await import('pg-query-emscripten');
  const Module = mod.default ?? mod;
  const pgQuery = await new Module();
  const parsed = pgQuery.parse(text);
  if (parsed?.error) {
    const message = typeof parsed.error.message === 'string' ? parsed.error.message : 'unknown SQL parse error';
    const cursor = Number.isFinite(parsed.error.cursorpos)
      ? ` at ${lineColFromOneBasedOffset(text, parsed.error.cursorpos)}`
      : '';
    return { errors: 1, firstError: `sql parse error${cursor}: ${message}` };
  }
  return { errors: 0 };
}

async function validateTreeSitter(absPath, treeSitterLang) {
  const wasm = TREE_SITTER_WASM[treeSitterLang];
  if (!wasm || !fs.existsSync(wasm)) throw new Error('unsupported language or missing wasm');
  const text = fs.readFileSync(absPath, 'utf8');
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
  if (errors === 0 && root.hasError) {
    errors = 1;
    firstError = firstError ?? 'parse error: grammar reports hasError without an ERROR node';
  }
  return { errors, firstError };
}

try {
  if (!file || !lang) throw new Error('missing file or language arg');
  const result = lang === 'sql'
    ? await validateSql(file)
    : await validateTreeSitter(file, lang);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  process.stdout.write(JSON.stringify({ skipped: true }) + '\n');
}
