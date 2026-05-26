#!/usr/bin/env node
// extractors/codegraph-export.mjs
//
// Replaces the upstream graphify base extraction step. Reads the CodeGraph
// SQLite DB (.codegraph/codegraph.db) and emits a normalised
// graphify-out/codegraph-base.json (same shape as the legacy base graph.json
// from upstream graphify, so the existing merge step in run.mjs Just Works).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openDB,
  allNodes,
  allEdges,
  countNodes,
  countEdges,
  statsByKind,
  statsByLanguage,
} from '../lib/codegraph-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const OUT = join(ROOT, 'graphify-out', 'codegraph-base.json');

async function main() {
  const db = openDB(join(ROOT, '.codegraph/codegraph.db'));
  console.log(`[codegraph-export] DB opened. nodes=${countNodes(db)} edges=${countEdges(db)}`);

  const nodes = [];
  for (const row of allNodes(db)) {
    nodes.push({
      id: row.id,
      label: row.name,
      type: row.kind,
      file: row.file_path,
      line: row.start_line,
      meta: {
        qualified_name: row.qualified_name,
        language: row.language,
        is_exported: !!row.is_exported,
        is_async: !!row.is_async,
        signature: row.signature || undefined,
      },
    });
  }

  const edges = [];
  for (const row of allEdges(db)) {
    edges.push({
      source: row.source,
      target: row.target,
      kind: row.kind,
      meta: { line: row.line, col: row.col, provenance: row.provenance || undefined },
    });
  }

  const stats = {
    nodes_by_kind: Object.fromEntries(statsByKind(db).map((r) => [r.kind, r.n])),
    files_by_language: Object.fromEntries(statsByLanguage(db).map((r) => [r.language, r.n])),
  };

  db.close();

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ nodes, edges, stats }));
  console.log(`[codegraph-export] wrote ${OUT} — ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`[codegraph-export] kinds: ${JSON.stringify(stats.nodes_by_kind).slice(0, 200)}`);
}

await main();
