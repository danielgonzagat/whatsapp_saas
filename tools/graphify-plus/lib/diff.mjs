#!/usr/bin/env node
// lib/diff.mjs — topological diff between two enriched graphs.
//
//   node tools/graphify-plus/lib/diff.mjs <graphA.json> <graphB.json>
//
// Reports nodes added/removed, edges added/removed, modules/communities most
// affected, blast-radius for renames.

import { argv } from 'node:process';
import { readFile } from 'node:fs/promises';

async function main() {
  const [aPath, bPath] = argv.slice(2);
  if (!aPath || !bPath) {
    console.error('usage: diff.mjs <graphA.json> <graphB.json>');
    process.exit(2);
  }
  const [A, B] = await Promise.all([readJson(aPath), readJson(bPath)]);

  const idsA = new Set((A.nodes || []).map((n) => n.id));
  const idsB = new Set((B.nodes || []).map((n) => n.id));

  const added = (B.nodes || []).filter((n) => !idsA.has(n.id));
  const removed = (A.nodes || []).filter((n) => !idsB.has(n.id));

  const edgeKey = (e) => `${e.source}|${e.target}|${e.kind}`;
  const edgesA = new Set((A.edges || []).map(edgeKey));
  const edgesB = new Set((B.edges || []).map(edgeKey));
  const newEdges = [...edgesB].filter((k) => !edgesA.has(k));
  const lostEdges = [...edgesA].filter((k) => !edgesB.has(k));

  const filesAffected = new Set();
  added.concat(removed).forEach((n) => n.file && filesAffected.add(n.file));

  // Type frequency.
  const typeFreq = (arr) =>
    arr.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {});

  // Rename detection: same file+line, different label/id.
  const byLoc = new Map();
  (A.nodes || []).forEach((n) => {
    if (n.file && n.line) byLoc.set(`${n.file}:${n.line}`, n);
  });
  const renames = [];
  for (const n of added) {
    const a = byLoc.get(`${n.file}:${n.line}`);
    if (a && a.id !== n.id) renames.push({ from: a.id, to: n.id, file: n.file });
  }

  const report = {
    summary: {
      nodes: { added: added.length, removed: removed.length },
      edges: { added: newEdges.length, removed: lostEdges.length },
      files_affected: filesAffected.size,
      renames: renames.length,
    },
    added_by_type: typeFreq(added),
    removed_by_type: typeFreq(removed),
    renames: renames.slice(0, 50),
    sample_added: added.slice(0, 25).map((n) => ({ id: n.id, file: n.file, label: n.label })),
    sample_removed: removed.slice(0, 25).map((n) => ({ id: n.id, file: n.file, label: n.label })),
  };

  console.log(JSON.stringify(report, null, 2));
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

await main();
