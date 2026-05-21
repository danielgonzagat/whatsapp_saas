#!/usr/bin/env node
// Graphify-driven duplicate detector.
//
// Reads the enriched graph produced by `npm run graph:extract` and emits
// a CSV (+ markdown) of every symbol name that appears in multiple
// `source_file`s. Unlike the AST-regex scanner in `scan.mjs`, this uses
// graphify's symbol-level index — which catches:
//   - private (non-exported) duplicates the regex misses
//   - cross-extension duplicates (e.g., .ts + .mts + .mjs)
//   - aliased/re-exported callers (graphify resolves them)
//
// Output:
//   docs/architecture/GRAPHIFY_DUPLICATES.md  human-readable register
//   tools/canonicalize/graphify-duplicates.csv  machine-readable
//
// Each row: symbol | # files | avg callers per impl | files list
// Sorted by (# files DESC, total callers DESC) so the highest-leverage
// canonicalization targets float to the top.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GRAPH_PATH = join(ROOT, 'graphify-out/enriched-graph.json');

console.log(`reading ${GRAPH_PATH}...`);
const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
console.log(`  ${graph.nodes.length} nodes, ${graph.edges?.length ?? graph.links?.length} edges`);

// ─────────────── group function-like nodes by their label ───────────────
// graphify labels look like "normalizePhone()", "ChatMessage" (no parens for
// types/interfaces), etc. We treat anything ending in '()' as a function-
// like dedup candidate; types use the bare name.

const FN_RE = /^([a-zA-Z_$][\w$]*)\(\)$/;
const TYPE_RE = /^([A-Z][\w$]*)$/;

const byLabel = new Map(); // label → [{ id, source_file, source_location }]
for (const node of graph.nodes) {
  const label = node.label;
  if (typeof label !== 'string') continue;
  const fn = FN_RE.exec(label);
  const ty = TYPE_RE.exec(label);
  const key = fn ? fn[1] : ty ? ty[1] : null;
  if (!key) continue;
  if (key.length < 4) continue; // skip noise like a, b, x
  if (!byLabel.has(key)) byLabel.set(key, []);
  byLabel.get(key).push({
    id: node.id,
    file: node.source_file,
    line: node.source_location,
    kind: fn ? 'function' : 'type',
  });
}

// Filter to actual duplicates (>1 distinct source_file)
const duplicates = [];
for (const [name, instances] of byLabel) {
  const distinctFiles = new Set(instances.map((i) => i.file));
  if (distinctFiles.size < 2) continue;
  duplicates.push({ name, count: distinctFiles.size, instances });
}

// Count callers per id using edges (relation: 'calls' for function calls)
const edges = graph.edges ?? graph.links ?? [];
const callersByTarget = new Map();
for (const e of edges) {
  if (e.relation !== 'calls' && e.relation !== 'imports' && e.relation !== 'imports_from') continue;
  const t = e.target;
  callersByTarget.set(t, (callersByTarget.get(t) ?? 0) + 1);
}

// Attach total callers and sort
for (const d of duplicates) {
  d.totalCallers = d.instances.reduce(
    (sum, i) => sum + (callersByTarget.get(i.id) ?? 0),
    0,
  );
}
duplicates.sort((a, b) => b.count - a.count || b.totalCallers - a.totalCallers);

console.log(`detected ${duplicates.length} duplicate-label groups`);

// ─────────────── known-canonical lookup (to mark "already done") ───────
const ALREADY_CANONICAL = new Set([
  'clamp',
  'clampScore',
  'daysSince',
  'normalizeEmail',
  'safeStr',
  'filterByWorkspace',
  'filterByWorkspaceAndEntity',
  'normalizePhone',
  'formatCurrency',
  'formatBRL',
  'ToolResult',
  'Role',
]);

// ─────────────── emit CSV ───────────────
const csvOut = join(ROOT, 'tools/canonicalize/graphify-duplicates.csv');
const csvRows = ['symbol,kind,files,total_callers,status,first_file,last_file'];
for (const d of duplicates) {
  const kind = d.instances[0].kind;
  const status = ALREADY_CANONICAL.has(d.name) ? 'canonicalized' : 'pending';
  const sorted = [...d.instances].sort((a, b) => a.file.localeCompare(b.file));
  const first = sorted[0]?.file ?? '';
  const last = sorted[sorted.length - 1]?.file ?? '';
  csvRows.push(`"${d.name}",${kind},${d.count},${d.totalCallers},${status},"${first}","${last}"`);
}
writeFileSync(csvOut, csvRows.join('\n') + '\n');
console.log(`wrote ${csvOut}`);

// ─────────────── emit Markdown register ───────────────
const mdOut = join(ROOT, 'docs/architecture/GRAPHIFY_DUPLICATES.md');
const md = [
  '# Kloel Graphify-Driven Duplicate Register',
  '',
  '> Symbol-level duplicate index built from graphify\'s enriched graph',
  '> (`graphify-out/enriched-graph.json`). Catches non-exported duplicates',
  '> the regex-based scanner in `scan.mjs` misses.',
  '',
  `Generated from ${graph.nodes.length} nodes / ${edges.length} edges.`,
  '',
  `Total duplicate-label groups: **${duplicates.length}**.`,
  '',
  '**Status legend:**',
  '- ✅ `canonicalized` — already consolidated; see DEPRECATION_MAP.md',
  '- ⏳ `pending` — duplicate detected, not yet consolidated',
  '',
  '## Top 50 dedup candidates (sorted by # files, then total callers)',
  '',
  '| Symbol | Kind | # files | Total callers | Status |',
  '|---|---|---:|---:|---|',
];
for (const d of duplicates.slice(0, 50)) {
  const kind = d.instances[0].kind;
  const status = ALREADY_CANONICAL.has(d.name) ? '✅ done' : '⏳ pending';
  md.push(`| \`${d.name}\` | ${kind} | ${d.count} | ${d.totalCallers} | ${status} |`);
}
md.push('');
md.push('## How to use this register');
md.push('');
md.push('1. Pick the top `⏳ pending` row');
md.push('2. Verify semantic equivalence: read the 2+ implementations');
md.push('3. Pick canonical home (most foundational module wins)');
md.push('4. Use `atomic_replace_text` to install re-export pattern in the others');
md.push('5. Run `npm run canonical:scan && npm run canonical:check`');
md.push('6. Commit, push, regenerate this register');
md.push('');
md.push('## Regenerate');
md.push('');
md.push('```sh');
md.push('node tools/canonicalize/graphify-driven-dedup.mjs');
md.push('```');
md.push('');
md.push('Pre-requisite: `npm run graph:extract` (refreshes `graphify-out/enriched-graph.json`).');

writeFileSync(mdOut, md.join('\n') + '\n');
console.log(`wrote ${mdOut}`);

// stdout summary
console.log('\nTop 10 pending duplicates:');
const pending = duplicates.filter((d) => !ALREADY_CANONICAL.has(d.name));
for (const d of pending.slice(0, 10)) {
  console.log(`  ${d.name.padEnd(30)} ${String(d.count).padStart(3)} files, ${String(d.totalCallers).padStart(4)} callers`);
}
