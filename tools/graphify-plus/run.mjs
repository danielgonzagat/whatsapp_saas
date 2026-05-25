#!/usr/bin/env node
// tools/graphify-plus/run.mjs — orchestrator.
//
//   node tools/graphify-plus/run.mjs            # extract all + merge
//   node tools/graphify-plus/run.mjs --fast     # skip the slow ones
//   node tools/graphify-plus/run.mjs --extractors bullmq,nestjs
//
// Reads:   .codegraph/codegraph.db (CodeGraph SQLite, via codegraph-export)
// Merges:  graphify-out/shards/*.json (deterministic per-framework extractors)
// Writes:  graphify-out/enriched-graph.json

import { argv } from 'node:process';
import { spawn } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const SHARDS_DIR = join(ROOT, 'graphify-out', 'shards');
const BASE = join(ROOT, 'graphify-out', 'codegraph-base.json');
const OUT = join(ROOT, 'graphify-out', 'enriched-graph.json');

const ALL = [
  { name: 'codegraph-export', script: 'extractors/codegraph-export.mjs', fast: true }, // replaces upstream graphify base
  { name: 'bullmq', script: 'extractors/bullmq.mjs', fast: true },
  { name: 'nestjs', script: 'extractors/nestjs.mjs', fast: true },
  { name: 'nextjs', script: 'extractors/nextjs.mjs', fast: true },
  { name: 'api-contract', script: 'extractors/api-contract.mjs', fast: true },
  { name: 'metadata', script: 'extractors/metadata.mjs', fast: true },
  { name: 'test-impact', script: 'extractors/test-impact.mjs', fast: true }, // L8
  { name: 'bundle', script: 'extractors/bundle.mjs', fast: true }, // L9 — reads .next/ if present
  { name: 'doc-freshness', script: 'extractors/doc-freshness.mjs', fast: true }, // W4
  { name: 'type-flow', script: 'extractors/type-flow.mjs', fast: true }, // W4 — Prisma model fan-out
  { name: 'runtime-railway', script: 'extractors/runtime-railway.mjs', fast: false }, // network call
  { name: 'runtime-sentry', script: 'extractors/runtime-sentry.mjs', fast: false }, // W4 — Sentry overlay
  { name: 'diagnostics', script: 'extractors/diagnostics.mjs', fast: false }, // L7 — runs tsc+eslint (slow)
];

async function main() {
  const fast = argv.includes('--fast');
  const onlyArg = argv.find((a) => a.startsWith('--extractors='))?.split('=')[1];
  const only = onlyArg ? onlyArg.split(',') : null;

  const chosen = ALL.filter((e) => (fast ? e.fast : true)).filter((e) => (only ? only.includes(e.name) : true));

  console.log(`[run] extractors: ${chosen.map((e) => e.name).join(', ')}`);

  for (const e of chosen) {
    await runChild(join(__dirname, e.script));
  }

  await merge();
}

function runChild(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
    child.on('error', reject);
  });
}

async function merge() {
  let base = { nodes: [], edges: [] };
  try {
    const baseStat = await stat(BASE);
    if (baseStat.size < 200_000_000) {
      const raw = await readFile(BASE, 'utf8');
      const parsed = JSON.parse(raw);
      // codegraph-export already emits the normalised graphify-plus shape:
      //   { nodes: [{id,label,type,file,line,meta}], edges: [{source,target,kind,meta}] }
      base = {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
      };
    } else {
      console.log(`[run] base graph.json too large (${baseStat.size} bytes) — emitting shards-only enriched graph`);
    }
  } catch (err) {
    console.log(`[run] no base graph.json (${err.message}) — emitting shards-only enriched graph`);
  }

  const shardFiles = [
    'bullmq',
    'nestjs',
    'nextjs',
    'api-contract',
    'metadata',
    'runtime-railway',
    'test-impact',
    'bundle',
    'diagnostics',
    'doc-freshness',
    'type-flow',
    'runtime-sentry',
  ].map((n) => join(SHARDS_DIR, `${n}.json`));

  const enriched = {
    nodes: [...(base.nodes || [])],
    edges: [...(base.edges || [])],
    shards: {},
  };

  const seenNodes = new Set(enriched.nodes.map((n) => n.id));

  for (const path of shardFiles) {
    try {
      const raw = await readFile(path, 'utf8');
      const shard = JSON.parse(raw);
      const name = path.split('/').pop().replace('.json', '');
      enriched.shards[name] = shard.stats || {};
      for (const node of shard.nodes || []) {
        if (seenNodes.has(node.id)) continue;
        enriched.nodes.push(node);
        seenNodes.add(node.id);
      }
      for (const edge of shard.edges || []) {
        enriched.edges.push(edge);
      }
    } catch (err) {
      console.log(`[merge] skipped ${path}: ${err.message}`);
    }
  }

  // Build inverted indexes for cheap lookup.
  const fileIndex = {};
  for (const n of enriched.nodes) {
    if (!n.file) continue;
    (fileIndex[n.file] ||= []).push(n.id);
  }
  const typeIndex = {};
  for (const n of enriched.nodes) {
    (typeIndex[n.type] ||= []).push(n.id);
  }

  enriched.index = { byFile: fileIndex, byType: typeIndex };
  enriched.meta = {
    generatedAt: new Date().toISOString(),
    baseNodes: (base.nodes || []).length,
    baseEdges: (base.edges || []).length,
    totalNodes: enriched.nodes.length,
    totalEdges: enriched.edges.length,
    shardSummary: enriched.shards,
  };

  await writeFile(OUT, JSON.stringify(enriched));
  console.log(`[run] wrote ${OUT}`);
  console.log(`[run] enriched graph: ${enriched.nodes.length} nodes, ${enriched.edges.length} edges`);
  console.log(`[run] shards merged: ${Object.keys(enriched.shards).length}`);
}

await main();
