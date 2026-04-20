#!/usr/bin/env node
// Rename local bindings named `t` to `item` / `tItem` (context-sensitive) in
// any file that imports `t` from '@/lib/i18n/t'. This repairs the shadowing
// introduced when the i18n codemod wraps JSX text in `t(...)` inside array
// `.map((t, i) => ...)` callbacks.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require(
  [
    path.resolve(process.cwd(), 'backend/node_modules/typescript'),
    path.resolve(process.cwd(), 'frontend/node_modules/typescript'),
  ].find((p) => fs.existsSync(p)),
);

const roots = process.argv.slice(2);
function walk(d, o = []) {
  for (const n of fs.readdirSync(d)) {
    const f = path.join(d, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage'].includes(n)) continue;
      walk(f, o);
    } else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts')) o.push(f);
  }
  return o;
}

let filesChanged = 0,
  renames = 0;
for (const file of roots.flatMap((r) => (fs.statSync(r).isDirectory() ? walk(r) : [r]))) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/lib\/i18n\/t['"]/.test(src)) continue;
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];

  function collect(node, replacement) {
    // Rename the parameter identifier at its declaration site and
    // every reference to it inside the enclosing function scope.
    if (!ts.isIdentifier(node.name)) return;
    const original = node.name;
    const paramName = original.text;
    if (paramName !== 't') return;
    const parentFn = findEnclosingFn(node);
    if (!parentFn) return;
    // Replace the parameter name
    edits.push({ start: original.getStart(sf), end: original.getEnd(), text: replacement });
    // Walk the function body and replace every Identifier text 't' that
    // resolves to this parameter (conservative: every `t` that isn't the
    // imported one is renamed — we only enter scopes where `t` is locally
    // rebound, since we only start from a parameter named `t`).
    (function walkScope(scope) {
      ts.forEachChild(scope, (child) => {
        if (!child) return;
        if (ts.isIdentifier(child) && child !== original && child.text === 't') {
          const parent = child.parent;
          // skip property access like `.t` or object literal key `t: ...`
          if (parent && ts.isPropertyAccessExpression(parent) && parent.name === child) return;
          if (parent && ts.isPropertyAssignment(parent) && parent.name === child) return;
          if (parent && ts.isBindingElement(parent) && parent.propertyName === child) return;
          edits.push({ start: child.getStart(sf), end: child.getEnd(), text: replacement });
        }
        // Do not descend into nested functions that re-declare `t` — they
        // establish their own scope; keep this greedy for now.
        walkScope(child);
      });
    })(parentFn);
  }

  function findEnclosingFn(node) {
    let cur = node.parent;
    while (cur) {
      if (
        ts.isFunctionDeclaration(cur) ||
        ts.isFunctionExpression(cur) ||
        ts.isArrowFunction(cur) ||
        ts.isMethodDeclaration(cur)
      )
        return cur;
      cur = cur.parent;
    }
    return null;
  }

  function visit(node) {
    if (ts.isParameter(node) && node.name && ts.isIdentifier(node.name) && node.name.text === 't') {
      // Only rename parameters that belong to a REAL runtime function, not
      // to type nodes (`(t: Foo) => void` as a TypeAnnotation). Runtime
      // param declarations have a parent of ArrowFunction/FunctionExpression/
      // MethodDeclaration/FunctionDeclaration; type-level parameters live
      // inside FunctionTypeNode or ConstructorTypeNode.
      const fnParent = node.parent;
      const isRuntimeFn =
        fnParent &&
        (ts.isArrowFunction(fnParent) ||
          ts.isFunctionExpression(fnParent) ||
          ts.isFunctionDeclaration(fnParent) ||
          ts.isMethodDeclaration(fnParent) ||
          ts.isConstructorDeclaration(fnParent) ||
          ts.isAccessor?.(fnParent));
      if (isRuntimeFn) {
        collect(node, 'item');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length) continue;
  // Dedupe overlapping edits
  const seen = new Map();
  for (const e of edits) {
    const key = `${e.start}-${e.end}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  const ordered = [...seen.values()].sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of ordered) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);
  filesChanged++;
  renames += ordered.length;
}
console.log(`[rename-shadows] ${filesChanged} files, ${renames} identifiers renamed`);
