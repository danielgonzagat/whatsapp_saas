#!/usr/bin/env node
// extractors/test-impact.mjs — L8 test impact + coverage
//
// Mapeia spec → symbols exercitados.
//   • Lê todos os *.spec.{ts,tsx,mts,cts,js,mjs,cjs,jsx}
//   • Extrai imports (estáticos) — cada import vira `exercises` edge
//   • Detecta describe/it/test names para meta
//   • Se houver vitest/jest coverage json em ./coverage/, mescla cobertura por arquivo
//
// Determinístico. Sem LLM.

import { argv } from 'node:process';
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/test-impact.json`;

const IMPORT_RE = /import\s+(?:[\w*\s{},]+from\s+)?['"]([./\w\-@/]+)['"]/g;
const DESCRIBE_RE = /\bdescribe\s*\(\s*['"`]([^'"`]+)['"`]/g;
const IT_RE = /\b(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const SKIP_RE = /\b(?:it|test|describe)\.skip\s*\(/g;
const TODO_RE = /\b(?:it|test|describe)\.todo\s*\(/g;

async function main() {
  const shard = makeShard();
  const specFiles = [];

  for (const dir of ['backend/src', 'frontend/src', 'worker', 'tools', 'e2e/specs', 'e2e/visual']) {
    const root = join(ROOT, dir);
    try {
      await stat(root);
    } catch {
      continue;
    }
    for await (const f of (await collect(root, (_p, n) => /\.spec\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(n) || /\.test\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(n)))) {
      specFiles.push(f);
    }
  }

  for (const file of specFiles) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    const tests = [...src.matchAll(IT_RE)].map((m) => m[1]);
    const describes = [...src.matchAll(DESCRIBE_RE)].map((m) => m[1]);
    const skips = [...src.matchAll(SKIP_RE)].length;
    const todos = [...src.matchAll(TODO_RE)].length;
    const totalTests = tests.length;

    const specId = nid('spec', relPath);
    addNode(shard, {
      id: specId,
      label: `spec ${relPath.split('/').pop()}`,
      type: 'spec',
      file: relPath,
      line: 1,
      meta: { totalTests, skipped: skips, todo: todos, describes: describes.slice(0, 5), tests: tests.slice(0, 10) },
    });

    // Imports = symbols exercised. Resolve to file paths when possible.
    const seenSubject = new Set();
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const resolved = resolveLocalImport(file, spec);
        if (!resolved) continue;
        const subject = rel(resolved, ROOT);
        if (seenSubject.has(subject)) continue;
        seenSubject.add(subject);
        addEdge(shard, specId, nid('file', subject), 'exercises');
      } else if (!spec.startsWith('@') && /^[a-z]/.test(spec)) {
        // npm package — note dependency but don't link to file
        addEdge(shard, specId, nid('npm-package', spec), 'imports-pkg');
      }
    }
  }

  // Optional: merge vitest/jest coverage JSON if present.
  for (const cov of ['backend/coverage/coverage-summary.json', 'frontend/coverage/coverage-summary.json', 'worker/coverage/coverage-summary.json']) {
    try {
      const raw = await readFile(join(ROOT, cov), 'utf8');
      const summary = JSON.parse(raw);
      let count = 0;
      for (const [file, stats] of Object.entries(summary)) {
        if (file === 'total') continue;
        const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replace(/\\/g, '/') : file;
        const id = nid('coverage', rel);
        addNode(shard, {
          id,
          label: `coverage ${rel.split('/').pop()}`,
          type: 'coverage',
          file: rel,
          line: 1,
          meta: {
            lines_pct: stats.lines?.pct ?? null,
            branches_pct: stats.branches?.pct ?? null,
            functions_pct: stats.functions?.pct ?? null,
            statements_pct: stats.statements?.pct ?? null,
          },
        });
        addEdge(shard, id, nid('file', rel), 'covers');
        count++;
      }
      console.log(`[test-impact] merged coverage from ${cov} (${count} files)`);
    } catch {
      // optional
    }
  }

  await writeShard(shard, OUT);
  console.log(`[test-impact] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[test-impact] stats: ${JSON.stringify(shard.stats)}`);
}

function resolveLocalImport(fromFile, spec) {
  const baseDir = dirname(fromFile);
  for (const ext of ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx', '/index.ts', '/index.tsx', '/index.js']) {
    const candidate = resolve(baseDir, spec + ext);
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

await main();
