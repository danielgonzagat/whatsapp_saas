#!/usr/bin/env node
/**
 * lang-routing-fixed.proof.mjs — prova RED→GREEN do conserto de lang-routing.
 *
 * Antes do conserto (mapas '.css'/'.sql'→'javascript' em lang-bridge): A1/A3/A5
 * falham (sql julgado como JS recusa comentário '--' válido; css/html sem juiz
 * verdadeiro). Depois: tudo verde. Exit 1 em qualquer assert quebrado — serve de
 * proofCommand do atomic_expand_self e de regression-proof permanente.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eng = await import(path.join(ROOT, 'scripts/mcp/atomic-edit/dist/engine.js'));

const checks = [];
const assert = (name, cond, detail) => {
  checks.push({ name, ok: cond === true, detail });
  if (cond !== true) process.exitCode = 1;
};

// A1 — SQL: gramática real, comentário '--' é benigno (matava 40/40 no bench v1/v2)
const sqlBenign = eng.validate('probe.sql', 'SELECT 1;\n', 'SELECT 1;\n-- marker\n');
assert('sql-benign-comment-admitted', sqlBenign.ok === true && sqlBenign.language === 'sql', sqlBenign);

// A2 — SQL: quebra real é recusada (era 87% falso-negativo sob a gramática JS)
const sqlBroken = eng.validate('probe.sql', 'SELECT 1;\n', 'SELEC 1;\n');
assert('sql-broken-refused', sqlBroken.ok === false, sqlBroken);
const sqlTrunc = eng.validate('probe.sql', 'CREATE TABLE x (id INT);\n', 'CREATE TABLE x (id INT;\n');
assert('sql-unbalanced-refused', sqlTrunc.ok === false, sqlTrunc);

// A3 — CSS: gramática real; chave não fechada recusada (era falso-verde total)
const cssBroken = eng.validate('probe.css', 'a { color: red; }\n', 'a { color: red;\n');
assert('css-unbalanced-refused', cssBroken.ok === false && cssBroken.language === 'css', cssBroken);

// A4 — CSS: benigno admitido (sem recusar-tudo)
const cssBenign = eng.validate('probe.css', 'a { color: red; }\n', 'a { color: red; }\n/* marker */\n');
assert('css-benign-admitted', cssBenign.ok === true, cssBenign);

// A5 — HTML: ganhou juiz real; atributo rasgado recusado (era generic/cego)
const htmlBroken = eng.validate('probe.html', '<div></div>\n', '<div <span>\n');
assert('html-broken-refused', htmlBroken.ok === false && htmlBroken.language === 'html', htmlBroken);
const htmlBenign = eng.validate('probe.html', '<div></div>\n', '<div></div>\n<!-- marker -->\n');
assert('html-benign-admitted', htmlBenign.ok === true, htmlBenign);

// A6 — não-regressão TS/JS/JSON (o caminho dominante não pode mudar)
const tsBroken = eng.validate('probe.ts', 'const a = 1;\n', 'const a = {;\n');
assert('ts-broken-still-refused', tsBroken.ok === false, tsBroken);
const tsBenign = eng.validate('probe.ts', 'const a = 1;\n', 'const a = 1;\n// marker\n');
assert('ts-benign-still-admitted', tsBenign.ok === true, tsBenign);
const jsonBroken = eng.validate('probe.json', '{"a":1}\n', '{"a":\n');
assert('json-broken-still-refused', jsonBroken.ok === false, jsonBroken);

const failed = checks.filter((c) => !c.ok);
process.stdout.write(
  JSON.stringify({ kind: 'lang-routing-fixed-proof', passed: checks.length - failed.length, failed: failed.length, checks }, null, 2) + '\n',
);
