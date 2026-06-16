#!/usr/bin/env node
/**
 * Regression proof for CSS/SQL/HTML routing through real vendored grammars.
 * Before the fix, .css and .sql were validated as JavaScript and .html was
 * generic/unjudged, causing SQL false positives plus CSS/HTML false greens.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ATOMIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eng = await import(path.join(ATOMIC_ROOT, 'dist/engine.js'));

const checks = [];
function assert(name, ok, detail) {
  checks.push({ name, ok: ok === true, detail });
  if (ok !== true) process.exitCode = 1;
}

const sqlBenign = eng.validate('probe.sql', 'SELECT 1;\n', 'SELECT 1;\n-- marker\n');
assert('sql-benign-comment-admitted', sqlBenign.ok === true && sqlBenign.language === 'sql', sqlBenign);

const sqlBroken = eng.validate('probe.sql', 'SELECT 1;\n', 'SELEC 1;\n');
assert('sql-broken-refused', sqlBroken.ok === false && sqlBroken.language === 'sql', sqlBroken);

const sqlTrunc = eng.validate('probe.sql', 'CREATE TABLE x (id INT);\n', 'CREATE TABLE x (id INT;\n');
assert('sql-unbalanced-refused', sqlTrunc.ok === false && sqlTrunc.language === 'sql', sqlTrunc);

const cssBroken = eng.validate('probe.css', 'a { color: red; }\n', 'a { color: red;\n');
assert('css-unbalanced-refused', cssBroken.ok === false && cssBroken.language === 'css', cssBroken);

const cssBenign = eng.validate('probe.css', 'a { color: red; }\n', 'a { color: red; }\n/* marker */\n');
assert('css-benign-admitted', cssBenign.ok === true && cssBenign.language === 'css', cssBenign);

const htmlBroken = eng.validate('probe.html', '<div></div>\n', '<div <span>\n');
assert('html-broken-refused', htmlBroken.ok === false && htmlBroken.language === 'html', htmlBroken);

const htmlBenign = eng.validate('probe.html', '<div></div>\n', '<div></div>\n<!-- marker -->\n');
assert('html-benign-admitted', htmlBenign.ok === true && htmlBenign.language === 'html', htmlBenign);

const tsBroken = eng.validate('probe.ts', 'const a = 1;\n', 'const a = {;\n');
assert('ts-broken-still-refused', tsBroken.ok === false && tsBroken.language === 'ts', tsBroken);

const tsBenign = eng.validate('probe.ts', 'const a = 1;\n', 'const a = 1;\n// marker\n');
assert('ts-benign-still-admitted', tsBenign.ok === true && tsBenign.language === 'ts', tsBenign);

const jsonBroken = eng.validate('probe.json', '{"a":1}\n', '{"a":\n');
assert('json-broken-still-refused', jsonBroken.ok === false && jsonBroken.language === 'json', jsonBroken);

const failed = checks.filter((entry) => !entry.ok);
process.stdout.write(JSON.stringify({ kind: 'lang-routing-real-grammar-proof', passed: checks.length - failed.length, failed: failed.length, checks }, null, 2) + '\n');
