#!/usr/bin/env node
// Convert graphify-out/graph.json into an Obsidian vault.
// One markdown note per node, [[wikilinks]] per edge, folders mirror source paths.

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const GRAPH = '/Users/danielpenin/whatsapp_saas/graphify-out/graph.json';
const VAULT = '/Users/danielpenin/Documents/Obsidian Vault/Kloel';

const t0 = Date.now();
console.log('Loading graph...');
const g = JSON.parse(readFileSync(GRAPH, 'utf8'));
console.log(`  ${g.nodes.length} nodes, ${g.links.length} edges`);

const byId = new Map();
for (const n of g.nodes) byId.set(n.id, n);

const outEdges = new Map();
const inEdges = new Map();
for (const e of g.links) {
  if (!outEdges.has(e.source)) outEdges.set(e.source, []);
  outEdges.get(e.source).push(e);
  if (!inEdges.has(e.target)) inEdges.set(e.target, []);
  inEdges.get(e.target).push(e);
}

function safeSeg(s) {
  return String(s || '_root_').replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 80);
}
function folderFor(node) {
  const src = node.source_file || '_root_';
  const parts = src.split('/').slice(0, -1).map(safeSeg);
  if (parts.length === 0) return '_root_';
  return parts.join('/');
}
function safeFileId(id) {
  return String(id).replace(/[<>:"|?*\x00-\x1f\\\/]/g, '_').slice(0, 180);
}

console.log(`Wiping ${VAULT} content...`);
try { rmSync(VAULT, { recursive: true, force: true }); } catch {}
mkdirSync(VAULT, { recursive: true });

console.log('Writing notes...');
const dirCache = new Set();
let written = 0;
const startWrite = Date.now();

for (const node of g.nodes) {
  const folder = folderFor(node);
  const dir = join(VAULT, folder);
  if (!dirCache.has(dir)) {
    mkdirSync(dir, { recursive: true });
    dirCache.add(dir);
  }
  const fname = safeFileId(node.id) + '.md';
  const fpath = join(dir, fname);

  const outs = outEdges.get(node.id) || [];
  const ins = inEdges.get(node.id) || [];

  const byRel = new Map();
  for (const e of outs) {
    if (!byRel.has(e.relation)) byRel.set(e.relation, []);
    byRel.get(e.relation).push(e.target);
  }
  const byRelIn = new Map();
  for (const e of ins) {
    if (!byRelIn.has(e.relation)) byRelIn.set(e.relation, []);
    byRelIn.get(e.relation).push(e.source);
  }

  const tags = [
    `type/${node.file_type || 'unknown'}`,
    `community/${node.community ?? 'none'}`,
  ];

  const fm = [
    '---',
    `id: ${JSON.stringify(node.id)}`,
    `label: ${JSON.stringify(node.label || '')}`,
    `file_type: ${node.file_type || 'unknown'}`,
    `source_file: ${JSON.stringify(node.source_file || '')}`,
    `source_location: ${JSON.stringify(node.source_location || '')}`,
    `community: ${node.community ?? 'none'}`,
    `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    '---',
    '',
    `# ${node.label || node.id}`,
    '',
    `\`${node.source_file || ''}\` ${node.source_location || ''}`,
    '',
  ];

  if (byRel.size > 0) {
    fm.push('## Outgoing');
    for (const [rel, targets] of byRel) {
      fm.push('');
      fm.push(`### ${rel} (${targets.length})`);
      const links = targets.slice(0, 200).map((t) => `[[${safeFileId(t)}]]`);
      fm.push(links.join(' '));
      if (targets.length > 200) fm.push(`_... +${targets.length - 200} more_`);
    }
    fm.push('');
  }

  if (byRelIn.size > 0) {
    fm.push('## Incoming');
    for (const [rel, sources] of byRelIn) {
      fm.push('');
      fm.push(`### ${rel} (${sources.length})`);
      const links = sources.slice(0, 200).map((s) => `[[${safeFileId(s)}]]`);
      fm.push(links.join(' '));
      if (sources.length > 200) fm.push(`_... +${sources.length - 200} more_`);
    }
    fm.push('');
  }

  writeFileSync(fpath, fm.join('\n'));
  written++;
  if (written % 5000 === 0) {
    const dt = ((Date.now() - startWrite) / 1000).toFixed(1);
    console.log(`  ${written}/${g.nodes.length} (${dt}s)`);
  }
}

console.log('Writing index...');
const idx = [
  '# Kloel — Graphify Mirror',
  '',
  `Generated ${new Date().toISOString()}`,
  '',
  `- Nodes: **${g.nodes.length}**`,
  `- Edges: **${g.links.length}**`,
  `- Communities: **${new Set(g.nodes.map((n) => n.community)).size}**`,
  '',
  '## Folders',
  '',
  ...Array.from(dirCache).sort().map((d) => `- \`${d.replace(VAULT + '/', '')}\``),
];
writeFileSync(join(VAULT, '_INDEX.md'), idx.join('\n'));

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done. ${written} notes in ${dirCache.size} folders. ${dt}s total.`);
