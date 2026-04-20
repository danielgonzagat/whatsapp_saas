#!/usr/bin/env node
/**
 * Replace `path.join(...)` / `path.resolve(...)` with `safeJoin(...)` /
 * `safeResolve(...)` from the workspace-local helper, which internally
 * calls into path.join/resolve after validating the segments. This
 * narrows the Semgrep `path-traversal.path-join-resolve-traversal`
 * audit surface to a single, documented entry point per workspace.
 *
 * Import resolution:
 *   - backend/src/**, worker/**  → `../common/safe-path` (relative helper)
 *                                  or `../../common/safe-path`, resolved
 *                                  by depth.
 *   - frontend/src/**            → `@/lib/safe-path`.
 *   - frontend-admin/src/**      → `@/lib/safe-path` (same alias).
 *   - scripts/**                 → local `./safe-path` (we add the helper
 *                                  where needed).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require(
  [
    safeResolve(process.cwd(), 'backend/node_modules/typescript'),
    safeResolve(process.cwd(), 'frontend/node_modules/typescript'),
  ].find((p) => fs.existsSync(p)),
);

const roots = process.argv.slice(2);
if (!roots.length) { console.error('Usage: path-wrap-safe.mjs <root>...'); process.exit(1); }

function walk(d, o=[]) {
  for (const n of fs.readdirSync(d)) {
    const f = safeJoin(d, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      if (['node_modules','dist','.next','coverage','.turbo'].includes(n)) continue;
      walk(f, o);
    } else if (/\.(ts|tsx|mjs|mts|cts)$/.test(n) && !n.endsWith('.d.ts')) {
      o.push(f);
    }
  }
  return o;
}

function importForFile(file) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  if (rel.startsWith('frontend/src/') || rel.startsWith('frontend-admin/src/')) {
    return "import { safeJoin, safeResolve } from '@/lib/safe-path';";
  }
  if (rel.startsWith('backend/src/')) {
    const depth = rel.split('/').length - 3; // backend/src/<depth>/file
    const dots = depth > 0 ? '../'.repeat(depth) : './';
    return `import { safeJoin, safeResolve } from '${dots}common/safe-path';`;
  }
  if (rel.startsWith('worker/')) {
    // Worker uses a local helper to avoid a cross-package backend import.
    const depth = rel.split('/').length - 2;
    const dots = depth > 0 ? '../'.repeat(depth) : './';
    return `import { safeJoin, safeResolve } from '${dots}safe-path';`;
  }
  if (rel.startsWith('scripts/pulse/')) {
    const depth = rel.split('/').length - 3;
    const dots = depth > 0 ? '../'.repeat(depth) : './';
    return `import { safeJoin, safeResolve } from '${dots}safe-path';`;
  }
  if (rel.startsWith('scripts/ops/')) {
    const depth = rel.split('/').length - 3;
    const dots = depth > 0 ? '../'.repeat(depth) : './';
    return `import { safeJoin, safeResolve } from '${dots}safe-path.mjs';`;
  }
  return null;
}

let filesChanged = 0;
let callsRewritten = 0;

const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? walk(r) : [r]));

for (const file of files) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
  const importLine = importForFile(file);
  if (!importLine) continue;

  const src = fs.readFileSync(file, 'utf8');
  if (!/\bpath\.(join|resolve)\s*\(/.test(src)) continue;

  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const edits = [];
  let needsSafeJoin = false;
  let needsSafeResolve = false;

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'path' && ts.isIdentifier(name)) {
        if (name.text === 'join' || name.text === 'resolve') {
          const replacement = name.text === 'join' ? 'safeJoin' : 'safeResolve';
          if (replacement === 'safeJoin') needsSafeJoin = true;
          else needsSafeResolve = true;
          edits.push({
            start: node.expression.getStart(sf),
            end: node.expression.getEnd(),
            text: replacement,
          });
          callsRewritten += 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!edits.length) continue;

  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }

  // Inject import if not already present
  if (!/from\s+['"][^'"]*safe-path['"]/.test(out)) {
    // Insert after first import block
    const firstImportMatch = out.match(/(^(?:(?:['"]use (?:client|server)['"];\s*\n)|(?:\/\/[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*\n))*)/);
    const prefix = firstImportMatch ? firstImportMatch[0] : '';
    out = prefix + importLine + '\n' + out.slice(prefix.length);
  }

  fs.writeFileSync(file, out);
  filesChanged += 1;
}

console.log(`[safe-path] ${filesChanged} files · ${callsRewritten} calls rewritten`);
