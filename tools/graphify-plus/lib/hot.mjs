#!/usr/bin/env node
// tools/graphify-plus/lib/hot.mjs — Wave 5: priority node detection.
//
// Combines runtime overlay (Railway/Sentry), test-impact, doc-freshness,
// recency, and blast-radius into a single "hottest now" ranking.
//
// CLI:
//   node tools/graphify-plus/lib/hot.mjs           # top 20
//   node tools/graphify-plus/lib/hot.mjs --top=50  # top 50
//   node tools/graphify-plus/lib/hot.mjs --json    # machine output

import { argv } from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const TOP = Number(argv.find((a) => a.startsWith('--top='))?.split('=')[1] || 20);
const JSON_OUT = argv.includes('--json');

const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));

const scoreByNode = new Map();
function bump(id, delta, label) {
  if (!id) return;
  const cur = scoreByNode.get(id) || { id, score: 0, reasons: [] };
  cur.score += delta;
  cur.reasons.push(`${label}+${delta}`);
  scoreByNode.set(id, cur);
}

// 1) Runtime overlay (Railway) — errors / warnings
for (const node of graph.nodes) {
  if (node.type === 'runtime-overlay') {
    const errors = node.meta?.errors || 0;
    const rate = node.meta?.error_rate || 0;
    if (errors > 0) bump(node.id, errors * 10, 'errors');
    if (rate > 0.05) bump(node.id, Math.round(rate * 100), 'error-rate');
    const p95 = node.meta?.p95;
    if (p95 && p95 > 1000) bump(node.id, Math.round(p95 / 200), 'p95-slow');
    // Cascade to linked endpoints.
    const observed = graph.edges.filter((e) => e.kind === 'observes' && e.source === node.id);
    for (const e of observed) bump(e.target, errors * 5 + Math.round(rate * 50), 'runtime-cascade');
  }
  if (node.type === 'runtime-queue-overlay' && node.meta?.warns > 0) {
    bump(node.id, node.meta.warns * 8, 'queue-warns');
  }
  if (node.type === 'sentry-issue') {
    const count = node.meta?.count || 0;
    if (count > 10) bump(node.id, Math.min(50, count), 'sentry-events');
  }
  if (node.type === 'doc-stale') {
    const drift = node.meta?.driftDays || 0;
    bump(node.id, Math.min(15, Math.floor(drift / 30)), 'doc-drift');
  }
}

// 2) Blast radius — high inbound edges = many callers = important
for (const node of graph.nodes) {
  const inbound = graph.edges.filter((e) => e.target === node.id).length;
  if (inbound > 20) bump(node.id, Math.min(30, Math.floor(inbound / 5)), 'high-inbound');
}

// 3) Untested code — files with no exercises edge
const filesWithSpec = new Set(graph.edges.filter((e) => e.kind === 'exercises').map((e) => e.target));
for (const node of graph.nodes) {
  if (node.type === 'file' || (node.type && node.type.startsWith('nest-'))) {
    if (node.file && !filesWithSpec.has(`file:${node.file}`)) {
      // untested files are mildly hot, especially backend
      if (node.file.startsWith('backend/')) bump(node.id, 3, 'untested-backend');
    }
  }
}

const ranked = [...scoreByNode.values()]
  .map((s) => {
    const node = graph.nodes.find((n) => n.id === s.id);
    return { ...s, label: node?.label, type: node?.type, file: node?.file };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, TOP);

if (JSON_OUT) {
  console.log(JSON.stringify(ranked, null, 2));
} else {
  console.log(`Top ${TOP} hottest nodes (by composite priority):\n`);
  for (const r of ranked) {
    console.log(`  ${String(r.score).padStart(4)}  ${(r.type || '?').padEnd(20)} ${r.label || r.id}`);
    if (r.file) console.log(`        file: ${r.file}`);
    console.log(`        reasons: ${r.reasons.join(', ')}`);
  }
  console.log(`\n(${scoreByNode.size} nodes scored total)`);
}
