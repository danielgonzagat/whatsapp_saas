#!/usr/bin/env node
// extractors/nextjs.mjs
//
// Determinístico — sem LLM. Lê frontend/src/app/** e:
//   • Cada page.tsx vira node `next-page:<route>`
//   • Cada route.ts vira node `next-route:<route>:<method>`
//   • Cada layout.tsx vira node `next-layout:<route>`
//   • Resolve apiFetch('/x') ↔ route.ts handler  (essa parte fica para o api-contract matcher)
//
// Recupera o roteamento virtual que o AST puro do graphify perde.

import { argv } from 'node:process';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/nextjs.json`;
const APP_DIR = `${ROOT}/frontend/src/app`;

const METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
const SLOT_RE = /\((\w+)\)/g; // (auth), (main), (public) — route groups
const PARAM_RE = /\[(\w+)\]/g; // [id], [slug] — dynamic segments
const CATCH_RE = /\[\.{3}(\w+)\]/g; // [...slug]

function appRoute(filePath) {
  // Strip frontend/src/app prefix and turn into a Next route.
  const inside = filePath.replace(/^.*?\/frontend\/src\/app\//, '');
  const segments = inside.split('/').slice(0, -1); // drop file
  const route = segments
    .filter((s) => !s.startsWith('(') || !s.endsWith(')')) // drop route groups
    .map((s) => s.replace(/\[\.{3}(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1'))
    .join('/');
  return '/' + route;
}

async function main() {
  const shard = makeShard();
  const files = await collect(APP_DIR, (_p, n) => /^(page|route|layout|loading|error|template|default|not-found)\.(t|j)sx?$/.test(n));

  for (const file of files) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);
    const route = appRoute(file);
    const name = relPath.split('/').pop();

    if (name.startsWith('page.')) {
      const id = nid('next-page', route || '/');
      addNode(shard, {
        id,
        label: `page ${route || '/'}`,
        type: 'next-page',
        file: relPath,
        line: 1,
        meta: { route: route || '/' },
      });
      // Page is mounted under its parent layout if there is one (computed at merge time).
    } else if (name.startsWith('route.')) {
      const baseId = nid('next-route', route);
      addNode(shard, {
        id: baseId,
        label: `route ${route}`,
        type: 'next-route',
        file: relPath,
        line: 1,
        meta: { route },
      });
      for (const m of src.matchAll(METHOD_RE)) {
        const [, method] = m;
        const methodId = nid('next-route', route, method);
        addNode(shard, {
          id: methodId,
          label: `${method} ${route}`,
          type: 'next-route-method',
          file: relPath,
          line: lineOf(src, m.index),
          meta: { route, method },
        });
        addEdge(shard, baseId, methodId, 'exposes-method');
      }
    } else if (name.startsWith('layout.')) {
      const id = nid('next-layout', route || '/');
      addNode(shard, {
        id,
        label: `layout ${route || '/'}`,
        type: 'next-layout',
        file: relPath,
        line: 1,
        meta: { route: route || '/' },
      });
    } else if (name.startsWith('loading.') || name.startsWith('error.') || name.startsWith('not-found.')) {
      const kind = name.split('.')[0];
      addNode(shard, {
        id: nid(`next-${kind}`, route || '/'),
        label: `${kind} ${route || '/'}`,
        type: `next-${kind}`,
        file: relPath,
        line: 1,
        meta: { route: route || '/' },
      });
    }
  }

  // Pass 2: layout-nesting edges (each page/route lives inside the nearest layout).
  const layoutsByRoute = new Map(
    shard.nodes
      .filter((n) => n.type === 'next-layout')
      .map((n) => [n.meta.route, n.id]),
  );
  for (const node of shard.nodes) {
    if (!['next-page', 'next-route'].includes(node.type)) continue;
    const parent = nearestLayout(node.meta.route, layoutsByRoute);
    if (parent) addEdge(shard, parent, node.id, 'wraps');
  }

  await writeShard(shard, OUT);
  console.log(`[nextjs] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[nextjs] stats: ${JSON.stringify(shard.stats)}`);
}

function nearestLayout(route, layouts) {
  let r = route;
  while (r) {
    if (layouts.has(r)) return layouts.get(r);
    if (r === '/') return null;
    r = r.replace(/\/[^/]+$/, '') || '/';
  }
  return null;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

await main();
