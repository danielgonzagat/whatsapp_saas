#!/usr/bin/env node
// lib/edit-by-graph.mjs — orquestra atomic-edit a partir de um node do grafo.
//
//   node tools/graphify-plus/lib/edit-by-graph.mjs query <symbol>   # imprime payload + fan-out
//   node tools/graphify-plus/lib/edit-by-graph.mjs deps <symbol>    # quem chama / quem é chamado
//
// Não executa edits — emite um plano JSON consumível por atomic-edit MCP.

import { argv } from 'node:process';
import { readFile } from 'node:fs/promises';

const GRAPH = process.env.GRAPHIFY_PLUS_GRAPH || 'graphify-out/enriched-graph.json';

async function main() {
  const cmd = argv[2];
  const arg = argv[3];
  if (!cmd || !arg) {
    console.error('usage: edit-by-graph.mjs <query|deps> <symbol-or-id>');
    process.exit(2);
  }
  const graph = JSON.parse(await readFile(GRAPH, 'utf8'));

  const target = findNode(graph, arg);
  if (!target) {
    console.error(`symbol/id not found: ${arg}`);
    process.exit(3);
  }

  const inEdges = (graph.edges || []).filter((e) => e.target === target.id);
  const outEdges = (graph.edges || []).filter((e) => e.source === target.id);

  if (cmd === 'query') {
    const payload = {
      target,
      callers: inEdges.map((e) => ({ source: nodeById(graph, e.source), kind: e.kind })).filter((x) => x.source),
      called: outEdges.map((e) => ({ target: nodeById(graph, e.target), kind: e.kind })).filter((x) => x.target),
      blast_radius: inEdges.length,
      next_steps: target.file
        ? {
            atomic_edit_call: {
              tool: 'mcp__atomic-edit__atomic_edit_symbol',
              params: { file: target.file, symbol: target.label || target.id.split(':').pop(), line: target.line || 1 },
            },
            atomic_rename_call: {
              tool: 'mcp__atomic-edit__atomic_rename_symbol_cross_file',
              params: { file: target.file, symbol: target.label || target.id.split(':').pop() },
              note: `WARNING: ${inEdges.length} callers/dependents — review fan-out before rename`,
            },
          }
        : null,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (cmd === 'deps') {
    const result = {
      target: { id: target.id, file: target.file, line: target.line },
      callers: inEdges.length,
      called: outEdges.length,
      sample_callers: inEdges.slice(0, 20).map((e) => ({ source: e.source, kind: e.kind })),
      sample_called: outEdges.slice(0, 20).map((e) => ({ target: e.target, kind: e.kind })),
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

function findNode(graph, query) {
  // 1) Exact id match.
  let n = (graph.nodes || []).find((x) => x.id === query);
  if (n) return n;
  // 2) Suffix match on id ('FooService').
  n = (graph.nodes || []).find((x) => x.id.endsWith(`:${query}`));
  if (n) return n;
  // 3) Label contains.
  n = (graph.nodes || []).find((x) => x.label && x.label.includes(query));
  return n || null;
}

function nodeById(graph, id) {
  return (graph.nodes || []).find((n) => n.id === id) || null;
}

await main();
