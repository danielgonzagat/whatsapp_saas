#!/usr/bin/env node
// extractors/metadata.mjs
//
// Liga código a CONTEXTO. Crawler de markdown — determinístico.
//   • docs/adr/**/*.md       → nodes type=adr
//   • CLAUDE.md / AGENTS.md  → nodes type=policy
//   • docs/**/*.md           → nodes type=doc
//   • ~/.claude/projects/*/memory/*.md  → nodes type=memory (com path absoluto)
//
// Para cada doc, identifica menções de símbolos PascalCase / kebab-case / pacotes
// que correspondem a nodes do grafo principal, e emite edges `mentions`.

import { argv } from 'node:process';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/metadata.json`;
const MEM_DIR = `${homedir()}/.claude/projects/-Users-danielpenin-whatsapp-saas/memory`;

// Symbols worth detecting: PascalCase classes, kebab/snake module-ish, file basenames.
const SYMBOL_RE = /\b([A-Z][a-z][A-Za-z0-9]{2,}(?:Service|Controller|Module|Component|Provider|Strategy|Guard|Interceptor|Filter|Pipe|Page|Repository|Hook|View|Engine|Gate|Processor|Scheduler|Coordinator|Helper|Atoms|Bridge|Adapter|Client))\b/g;
const FILE_REF_RE = /[`"']([\w\-.\/]+\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx))[`"']/g;
const MODULE_PATH_RE = /[`"']((?:frontend|backend|worker|scripts|tools|docs|e2e)\/[\w\-./]+)[`"']/g;

const POLICY_FILES = ['CLAUDE.md', 'AGENTS.md', 'CODEX.md', 'README.md'];
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

async function main() {
  const shard = makeShard();
  const docs = [];

  // 1) Repo policy roots
  for (const name of POLICY_FILES) {
    const p = `${ROOT}/${name}`;
    const src = await safeRead(p);
    if (src) docs.push({ file: p, src, type: 'policy', name });
  }

  // 2) docs/**/*.md (ADRs + general)
  for (const f of await collect(`${ROOT}/docs`, (_p, n) => n.endsWith('.md'))) {
    const src = await readCapped(f);
    if (!src) continue;
    const t = f.includes('/adr/') ? 'adr' : 'doc';
    docs.push({ file: f, src, type: t, name: basename(f) });
  }

  // 3) Persistent memory
  for (const f of await collect(MEM_DIR, (_p, n) => n.endsWith('.md'))) {
    const src = await readCapped(f);
    if (!src) continue;
    docs.push({ file: f, src, type: 'memory', name: basename(f) });
  }

  // Emit doc nodes + symbol-mention edges.
  let mentions = 0;
  for (const doc of docs) {
    const docId = nid(doc.type, doc.name);
    const labelPrefix = { policy: 'policy', adr: 'ADR', doc: 'doc', memory: 'memory' }[doc.type] || doc.type;
    addNode(shard, {
      id: docId,
      label: `${labelPrefix}: ${doc.name}`,
      type: doc.type,
      file: doc.file.startsWith(ROOT) ? rel(doc.file, ROOT) : doc.file,
      line: 1,
      meta: extractFrontmatter(doc.src),
    });

    // Symbol mentions.
    const seenSym = new Set();
    for (const m of doc.src.matchAll(SYMBOL_RE)) {
      const sym = m[1];
      if (seenSym.has(sym)) continue;
      seenSym.add(sym);
      // Mention edge against multiple possible target types — the merger will keep only valid ones.
      addEdge(shard, docId, nid('nest-provider', sym), 'mentions');
      addEdge(shard, docId, nid('nest-controller', sym), 'mentions');
      addEdge(shard, docId, nid('nest-module', sym), 'mentions');
      mentions++;
    }
    // File path mentions.
    for (const m of doc.src.matchAll(FILE_REF_RE)) {
      const fileRef = m[1];
      addEdge(shard, docId, nid('file', fileRef), 'mentions-file');
    }
    for (const m of doc.src.matchAll(MODULE_PATH_RE)) {
      const fileRef = m[1];
      addEdge(shard, docId, nid('file', fileRef), 'mentions-file');
    }
  }

  shard.stats['stats:docs'] = docs.length;
  shard.stats['stats:symbol-mentions'] = mentions;

  await writeShard(shard, OUT);
  console.log(`[metadata] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[metadata] stats: ${JSON.stringify(shard.stats)}`);
}

function extractFrontmatter(src) {
  const m = src.match(FRONTMATTER_RE);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*(\w+):\s*(.+?)\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return meta;
}

async function safeRead(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

await main();
