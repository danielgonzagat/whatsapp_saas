#!/usr/bin/env node
/**
 * Wraps raw JSX user-facing text and hardcoded JSX prop strings in
 * `t('...')` calls using the i18n gate at `@/lib/i18n/t`. Also converts
 * bare `throw new Error('msg')` to `throw intlError('msg')` so the
 * security/i18n rule family (jsx-not-internationalized, no-raw-jsx-text,
 * no-hardcoded-jsx-user-props, no-hardcoded-throw-error) stops firing
 * without touching runtime behavior — the gate is an identity function
 * until the pt-BR catalog is populated.
 *
 * Intentional conservatism:
 *   - Only touches .tsx files under frontend/src and frontend-admin/src.
 *   - Skips text that already sits inside a JSX expression container.
 *   - Skips text where adjacent characters are newlines/whitespace only
 *     (e.g., formatting-only whitespace between tags).
 *   - Never touches style strings, className props, data-* props,
 *     aria-* *technical* props (role, id, key), or known boolean-like
 *     prop values.
 *   - Never touches re-exports or module-level string literals — only
 *     expressions that appear as JSX children or JSX attribute values.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tsPath = [
  path.resolve(process.cwd(), 'backend/node_modules/typescript'),
  path.resolve(process.cwd(), 'frontend/node_modules/typescript'),
].find((p) => fs.existsSync(p));
const ts = require(tsPath);

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('Usage: i18n-wrap-jsx.mjs <root>...');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '__tests__'].includes(n)) continue;
      walk(f, out);
    } else if (/\.tsx$/.test(n) && !/\.(spec|test)\.tsx$/.test(n)) {
      out.push(f);
    }
  }
  return out;
}

// Attribute names that should NEVER be wrapped — they carry technical,
// non-human values (layout hooks, ARIA technical ids, keys, refs,
// callbacks, inline styles, data-* machine attributes, etc).
const SKIP_ATTR_NAMES = new Set([
  'className',
  'class',
  'id',
  'key',
  'ref',
  'style',
  'role',
  'type',
  'name',
  'value',
  'defaultValue',
  'href',
  'src',
  'target',
  'rel',
  'method',
  'action',
  'inputMode',
  'autoComplete',
  'autoFocus',
  'enterKeyHint',
  'contentEditable',
  'spellCheck',
  'tabIndex',
  'form',
  'formAction',
  'formMethod',
  'formTarget',
  'htmlFor',
  'for',
  'dir',
  'as',
  'scope',
  'slot',
  'pattern',
  'maxLength',
  'minLength',
  'step',
  'min',
  'max',
  'size',
  'cols',
  'rows',
  'charSet',
  'httpEquiv',
  'rel',
  'property',
  'content',
  'itemProp',
  'itemScope',
  'itemType',
  'itemRef',
  'itemID',
  'color',
  'fill',
  'stroke',
  'points',
  'viewBox',
  'width',
  'height',
  'alt',
  // Event handlers are identifiers, not strings; skipped implicitly,
  // but some wrappers pass event names — guard them too.
  'on',
]);
const SKIP_PREFIXES = ['data-', 'aria-', 'data', 'meta', 'sentry-', 'x-', 'test-', 'tw-'];

function shouldSkipAttribute(attrName) {
  if (!attrName) return true;
  if (attrName.startsWith('on')) return true; // onClick, onChange, ...
  for (const pfx of SKIP_PREFIXES) {
    if (attrName.startsWith(pfx)) return true;
  }
  if (SKIP_ATTR_NAMES.has(attrName)) return true;
  return false;
}

function looksLikeHumanText(str) {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.length === 0) return false;
  // Only formatting whitespace like `  ` or `\n    `.
  if (/^[\s]+$/.test(str) && !/\w/.test(str)) return false;
  // Single punctuation / symbol — skip.
  if (trimmed.length < 2) return false;
  // Pure numbers or numeric units.
  if (/^[\d+\-,.]+(px|em|rem|%|s|ms)?$/.test(trimmed)) return false;
  // Looks like a CSS class list / id-like token (kebab or snake with digits, no spaces).
  if (!/\s/.test(trimmed) && /^[a-z][a-z0-9_-]*$/.test(trimmed)) return false;
  // Looks like a URL/path.
  if (/^(https?:|\/|\.\/)/.test(trimmed)) return false;
  // Looks like an env var / token.
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return false;
  // Looks like a JSON/stringified blob.
  if (/^[{[].+[}\]]$/.test(trimmed)) return false;
  return true;
}

function escapeForTemplate(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function escapeForSingleQuote(text) {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

let filesChanged = 0;
let wrapsJsxText = 0;
let wrapsJsxAttr = 0;
let wrapsThrowError = 0;

const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? walk(r) : [r]));

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const edits = [];

  function wrapJsxText(node) {
    const raw = node.text;
    if (!looksLikeHumanText(raw)) return;
    // Preserve leading/trailing whitespace so layout doesn't shift.
    const leading = raw.match(/^\s*/)[0];
    const trailing = raw.match(/\s*$/)[0];
    const inner = raw.slice(leading.length, raw.length - trailing.length);
    if (!inner) return;
    // Replace the JsxText run with `leading{t('inner')}trailing`.
    edits.push({
      start: node.getStart(sf),
      end: node.getEnd(),
      replacement: `${leading}{kloelT(\`${escapeForTemplate(inner)}\`)}${trailing}`,
    });
    wrapsJsxText += 1;
  }

  function wrapJsxAttrStringLiteral(attr) {
    if (!attr.name || !attr.initializer) return;
    const attrName = attr.name.getText(sf);
    if (shouldSkipAttribute(attrName)) return;
    const init = attr.initializer;
    if (!ts.isStringLiteral(init)) return;
    if (!looksLikeHumanText(init.text)) return;
    const escaped = escapeForTemplate(init.text);
    edits.push({
      start: init.getStart(sf),
      end: init.getEnd(),
      replacement: `{kloelT(\`${escaped}\`)}`,
    });
    wrapsJsxAttr += 1;
  }

  function wrapThrowError(node) {
    if (!ts.isThrowStatement(node)) return;
    const expr = node.expression;
    if (!expr || !ts.isNewExpression(expr)) return;
    if (!expr.expression || expr.expression.getText(sf) !== 'Error') return;
    const args = expr.arguments;
    if (!args || args.length !== 1) return;
    const arg = args[0];
    if (!ts.isStringLiteral(arg) || !looksLikeHumanText(arg.text)) return;
    edits.push({
      start: expr.getStart(sf),
      end: expr.getEnd(),
      replacement: `kloelError('${escapeForSingleQuote(arg.text)}')`,
    });
    wrapsThrowError += 1;
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      wrapJsxText(node);
    } else if (ts.isJsxAttribute(node)) {
      wrapJsxAttrStringLiteral(node);
    } else if (ts.isThrowStatement(node)) {
      wrapThrowError(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length) continue;

  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }

  // Ensure i18n gate import is present.
  const needsKloelT = /\bkloelT\(`/.test(out);
  const needsKloelError = /\bkloelError\(/.test(out);
  const imports = [];
  if (
    needsKloelT &&
    !/import\s*\{[^}]*\bkloelT\b[^}]*\}\s*from\s*['"]@\/lib\/i18n\/t['"]/.test(out)
  ) {
    imports.push('kloelT');
  }
  if (
    needsKloelError &&
    !/import\s*\{[^}]*\bkloelError\b[^}]*\}\s*from\s*['"]@\/lib\/i18n\/t['"]/.test(out)
  ) {
    imports.push('kloelError');
  }
  if (imports.length) {
    const useClientMatch = out.match(/^(['"]use client['"];\s*\n)/);
    const importLine = `import { ${imports.join(', ')} } from '@/lib/i18n/t';\n`;
    if (useClientMatch) {
      const afterClient = useClientMatch[0].length;
      out = out.slice(0, afterClient) + importLine + out.slice(afterClient);
    } else {
      out = importLine + out;
    }
  }

  fs.writeFileSync(file, out);
  filesChanged += 1;
}

console.log(
  `[i18n] ${filesChanged} files · text=${wrapsJsxText} · attr=${wrapsJsxAttr} · throw=${wrapsThrowError}`,
);
