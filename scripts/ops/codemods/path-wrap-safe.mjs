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
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

/**
 * Resolve `target` against the repo root and assert the result lives inside
 * the repo. Returns the resolved absolute path. Anything escaping the repo
 * raises immediately so a malformed input never reaches `fs.*`.
 */
function safeResolveRepo(target) {
  const resolved = path.resolve(repoRoot, target);
  const boundary = repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return resolved;
}

/**
 * Join `base` with `segment` and assert the resulting path lives inside the
 * repo root. The base must already be an absolute path inside the repo.
 */
function safeJoinRepo(base, segment) {
  if (typeof segment !== 'string' || segment.length === 0) {
    throw new TypeError('safeJoinRepo: segment must be a non-empty string');
  }
  const resolvedBase = safeResolveRepo(base);
  return safeResolveRepo(path.join(resolvedBase, segment));
}

function assertInRepo(filePath) {
  safeResolveRepo(filePath);
}

const require = createRequire(import.meta.url);
const tsCandidates = [
  safeResolveRepo('backend/node_modules/typescript'),
  safeResolveRepo('frontend/node_modules/typescript'),
];
const tsPath = tsCandidates.find((p) => fs.existsSync(p));
if (!tsPath) {
  throw new Error(`typescript module not found under: ${tsCandidates.join(', ')}`);
}
// `tsPath` was selected from a fixed two-element allow-list above, both
// entries hard-coded relative to the repo root. The `require()` argument is
// therefore not user-influenced.
const ts = require(tsPath);

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('Usage: path-wrap-safe.mjs <root>...');
  process.exit(1);
}

function walk(d, o = []) {
  const safeDir = safeResolveRepo(d);
  for (const n of fs.readdirSync(safeDir)) {
    const f = safeJoinRepo(safeDir, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '.turbo'].includes(n)) continue;
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

function createSourceFile(safeFile, src) {
  return ts.createSourceFile(
    safeFile,
    src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(safeFile) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function pathCallReplacement(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  const { expression, name } = node.expression;
  if (!ts.isIdentifier(expression) || expression.text !== 'path' || !ts.isIdentifier(name)) {
    return null;
  }
  if (name.text === 'join') return 'safeJoin';
  if (name.text === 'resolve') return 'safeResolve';
  return null;
}

function collectEdits(sf) {
  const edits = [];
  function visit(node) {
    const replacement = pathCallReplacement(node);
    if (replacement) {
      edits.push({
        start: node.expression.getStart(sf),
        end: node.expression.getEnd(),
        text: replacement,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return edits;
}

function applyEditsDescending(src, edits) {
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function injectImport(out, importLine) {
  if (/from\s+['"][^'"]*safe-path['"]/.test(out)) return out;
  const firstImportMatch = out.match(
    /(^(?:(?:['"]use (?:client|server)['"];\s*\n)|(?:\/\/[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*\n))*)/,
  );
  const prefix = firstImportMatch ? firstImportMatch[0] : '';
  return prefix + importLine + '\n' + out.slice(prefix.length);
}

function processFile(safeFile) {
  const importLine = importForFile(safeFile);
  if (!importLine) return { changed: false, calls: 0 };
  const src = fs.readFileSync(safeFile, 'utf8');
  if (!/\bpath\.(join|resolve)\s*\(/.test(src)) return { changed: false, calls: 0 };
  const sf = createSourceFile(safeFile, src);
  const edits = collectEdits(sf);
  if (!edits.length) return { changed: false, calls: 0 };
  const rewritten = applyEditsDescending(src, edits);
  const final = injectImport(rewritten, importLine);
  fs.writeFileSync(safeFile, final);
  return { changed: true, calls: edits.length };
}

let filesChanged = 0;
let callsRewritten = 0;

const files = roots.flatMap((r) => {
  const safeRoot = safeResolveRepo(r);
  return fs.statSync(safeRoot).isDirectory() ? walk(safeRoot) : [safeRoot];
});

for (const file of files) {
  const result = processFile(safeResolveRepo(file));
  if (result.changed) {
    filesChanged += 1;
    callsRewritten += result.calls;
  }
}

console.log(`[safe-path] ${filesChanged} files · ${callsRewritten} calls rewritten`);
