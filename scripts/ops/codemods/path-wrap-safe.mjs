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
import { fileURLToPath } from 'node:url';
import {
  existsSync as nodeExistsSync,
  readFileSync as nodeReadFileSync,
  readdirSync as nodeReaddirSync,
  statSync as nodeStatSync,
  writeFileSync as nodeWriteFileSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = toAbsolutePath(`${__dirname}${path.sep}..${path.sep}..${path.sep}..`);

function toAbsolutePath(input) {
  const normalized = path.normalize(input);
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.normalize(`${process.cwd()}${path.sep}${normalized}`);
}

/**
 * Resolve `target` against the repo root and assert the result lives inside
 * the repo. Returns the resolved absolute path. Anything escaping the repo
 * raises immediately so a malformed input never reaches `fs.*`.
 */
function safeResolveRepo(target) {
  const candidate = path.isAbsolute(target) ? target : `${repoRoot}${path.sep}${target}`;
  const resolved = toAbsolutePath(candidate);
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
  return safeResolveRepo(`${safeResolveRepo(base)}${path.sep}${segment}`);
}

const tsCandidates = [
  safeResolveRepo('backend/node_modules/typescript'),
  safeResolveRepo('frontend/node_modules/typescript'),
];
const tsPath = tsCandidates.find((p) => nodeExistsSync(p));
if (!tsPath) {
  throw new Error(`typescript module not found under: ${tsCandidates.join(', ')}`);
}

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('Usage: path-wrap-safe.mjs <root>...');
  process.exit(1);
}

function walk(d, o = []) {
  const safeDir = safeResolveRepo(d);
  for (const n of nodeReaddirSync(safeDir)) {
    const f = safeJoinRepo(safeDir, n);
    const s = nodeStatSync(f);
    if (s.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '.turbo'].includes(n)) {
        continue;
      }
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
    safeFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const PATH_FN_REPLACEMENTS = { join: 'safeJoin', resolve: 'safeResolve' };

function isPathPropertyAccess(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  return ts.isPropertyAccessExpression(node.expression);
}

function extractPathMethodName(node) {
  const { expression, name } = node.expression;
  if (!ts.isIdentifier(expression)) {
    return null;
  }
  if (expression.text !== 'path') {
    return null;
  }
  if (!ts.isIdentifier(name)) {
    return null;
  }
  return name.text;
}

function pathCallReplacement(node) {
  if (!isPathPropertyAccess(node)) {
    return null;
  }
  const methodName = extractPathMethodName(node);
  if (methodName === null) {
    return null;
  }
  return PATH_FN_REPLACEMENTS[methodName] ?? null;
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

const IMPORT_PROLOGUE_REGEX =
  /(^(?:(?:['"]use (?:client|server)['"];\s*\n)|(?:\/\/[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*\n))*)/;

const PROLOGUE_MAX_SCAN = 4096;

function findImportPrologue(source) {
  // Bound scan length to defeat any pathological backtracking on the
  // alternation-with-* prologue regex. Real prologues never exceed a
  // few hundred bytes; anything larger is treated as no prologue.
  const head = source.length > PROLOGUE_MAX_SCAN ? source.slice(0, PROLOGUE_MAX_SCAN) : source;
  const match = head.match(IMPORT_PROLOGUE_REGEX);
  return match ? match[0] : '';
}

function alreadyImportsSafePath(source) {
  return source.split('\n').some((line) => line.includes(' from ') && line.includes('safe-path'));
}

function injectImport(out, importLine) {
  if (alreadyImportsSafePath(out)) {
    return out;
  }
  const prefix = findImportPrologue(out);
  return `${prefix}${importLine}\n${out.slice(prefix.length)}`;
}

const NO_CHANGE = { changed: false, calls: 0 };

function processFile(safeFile) {
  const importLine = importForFile(safeFile);
  if (!importLine) {
    return NO_CHANGE;
  }
  const src = nodeReadFileSync(safeFile, 'utf8');
  if (!/\bpath\.(join|resolve)\s*\(/.test(src)) {
    return NO_CHANGE;
  }
  const sf = createSourceFile(safeFile, src);
  const edits = collectEdits(sf);
  if (!edits.length) {
    return NO_CHANGE;
  }
  const final = injectImport(applyEditsDescending(src, edits), importLine);
  nodeWriteFileSync(safeFile, final);
  return { changed: true, calls: edits.length };
}

let filesChanged = 0;
let callsRewritten = 0;

const files = roots.flatMap((r) => {
  const safeRoot = safeResolveRepo(r);
  return nodeStatSync(safeRoot).isDirectory() ? walk(safeRoot) : [safeRoot];
});

for (const file of files) {
  const result = processFile(safeResolveRepo(file));
  if (result.changed) {
    filesChanged += 1;
    callsRewritten += result.calls;
  }
}

console.log(`[safe-path] ${filesChanged} files · ${callsRewritten} calls rewritten`);
