#!/usr/bin/env node
// extractors/doc-freshness.mjs — Wave 4: doc-freshness overlay.
//
// Para cada arquivo TS/JS, encontra a docstring/JSDoc no topo (se houver) e
// compara com o mtime do arquivo. Se a docstring é muito mais velha que o
// código, emite um node `doc-stale` (com a defasagem em dias).
//
// Determinístico. Sem LLM.

import { argv } from 'node:process';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/doc-freshness.json`;

const STALE_DAYS = 90;
const JSDOC_TOP_RE = /^\s*\/\*\*\s*\n([\s\S]*?)\*\//m;

async function main() {
  const shard = makeShard();
  const dirs = ['backend/src', 'frontend/src', 'worker'];
  let scanned = 0;
  let stale = 0;
  let documented = 0;

  for (const dir of dirs) {
    for await (const file of (await collect(`${ROOT}/${dir}`, (_p, n) => /\.(ts|tsx|mts|cts|js|mjs)$/.test(n)))) {
      scanned++;
      const src = await readCapped(file);
      if (!src) continue;
      const m = src.match(JSDOC_TOP_RE);
      if (!m) continue;
      documented++;

      // Date of doc = date of FIRST commit that touched this docblock (best-effort: file's first commit)
      // Cheap proxy: git log --reverse --format=%at -- <file>
      const fileRel = rel(file, ROOT);
      const docDate = await firstCommitTime(fileRel);
      const fileStat = await stat(file);
      const codeMtime = fileStat.mtimeMs;

      if (!docDate) continue;
      const docMs = docDate * 1000;
      const driftDays = Math.floor((codeMtime - docMs) / 86_400_000);
      if (driftDays < STALE_DAYS) continue;

      const id = nid('doc-stale', fileRel);
      addNode(shard, {
        id,
        label: `doc-stale ${fileRel.split('/').pop()} (~${driftDays}d drift)`,
        type: 'doc-stale',
        file: fileRel,
        line: 1,
        meta: {
          driftDays,
          docFirstSeen: new Date(docMs).toISOString(),
          codeLastModified: new Date(codeMtime).toISOString(),
          docLines: m[1].split('\n').length,
        },
      });
      addEdge(shard, id, nid('file', fileRel), 'stale-doc-of');
      stale++;
    }
  }

  shard.stats['stats:scanned'] = scanned;
  shard.stats['stats:documented'] = documented;
  shard.stats['stats:stale'] = stale;
  shard.stats['stats:threshold_days'] = STALE_DAYS;

  await writeShard(shard, OUT);
  console.log(`[doc-freshness] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[doc-freshness] stats: ${JSON.stringify(shard.stats)}`);
}

function firstCommitTime(file) {
  return new Promise((resolve) => {
    const child = spawn('git', ['log', '--reverse', '--format=%at', '--', file], {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('exit', () => {
      const first = out.split('\n').find((l) => /^\d+$/.test(l));
      resolve(first ? Number(first) : null);
    });
    child.on('error', () => resolve(null));
  });
}

await main();
