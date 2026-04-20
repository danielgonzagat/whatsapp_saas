#!/usr/bin/env node
// Add braces to single-statement if/else/for/while bodies across given roots.
// Uses TypeScript compiler API so we only touch true single-statement branches
// and preserve ASI / trailing comments.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tsCandidates = [
  path.resolve(process.cwd(), 'backend/node_modules/typescript'),
  path.resolve(process.cwd(), 'frontend/node_modules/typescript'),
  path.resolve(process.cwd(), 'node_modules/typescript'),
];
const tsPath = tsCandidates.find((p) => fs.existsSync(p));
if (!tsPath) {
  console.error('typescript not found in any workspace node_modules');
  process.exit(2);
}
const ts = require(tsPath);

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('Usage: add-curly-braces.mjs <root> [root...]');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', '.turbo'].includes(name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = roots.flatMap((r) => (fs.statSync(r).isDirectory() ? walk(r) : [r]));

let filesChanged = 0;
let bracesAdded = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.Unknown);

  const edits = [];

  function visit(node) {
    const bodies = [];
    if (ts.isIfStatement(node)) {
      bodies.push(node.thenStatement);
      if (node.elseStatement && !ts.isIfStatement(node.elseStatement)) {
        bodies.push(node.elseStatement);
      }
    } else if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      if (node.statement) bodies.push(node.statement);
    }

    for (const body of bodies) {
      if (!body) continue;
      if (ts.isBlock(body)) continue;
      if (ts.isEmptyStatement(body)) continue;
      const start = body.getStart(sf);
      const end = body.getEnd();
      edits.push({ start, end, text: source.slice(start, end) });
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  if (edits.length === 0) continue;

  edits.sort((a, b) => b.start - a.start);

  let out = source;
  for (const edit of edits) {
    const before = out.slice(0, edit.start);
    const after = out.slice(edit.end);
    out = `${before}{ ${edit.text} }${after}`;
  }

  fs.writeFileSync(file, out);
  filesChanged += 1;
  bracesAdded += edits.length;
  console.log(`[braces] ${path.relative(process.cwd(), file)}: +${edits.length}`);
}

console.log(`\n[braces] total: ${filesChanged} files, ${bracesAdded} braces added`);
