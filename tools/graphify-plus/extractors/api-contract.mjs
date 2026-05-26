#!/usr/bin/env node
// extractors/api-contract.mjs
//
// Cross-repo contract matcher — determinístico, sem LLM.
//   • Frontend:  apiFetch('/marketing/connect/status'), useSWR('/...'), fetch('/api/...')
//   • Backend:   @Get('/marketing/connect/status') / @Post(...) / @All(...)
//   • Next API:  frontend/src/app/api/.../route.ts (já capturado em nextjs.mjs)
//
// Conecta callsite no frontend ao handler real no backend (atravessa Next proxy).

import { argv } from 'node:process';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/api-contract.json`;

const FRONTEND_FETCH_RE = /\b(apiFetch|fetch|swrFetcher|useSWR|useSWRImmutable)\s*[\(<]\s*[<{]?[\s\S]{0,200}?['"`]([/$][\w/:\-.$]+)['"`]/g;
const BACKEND_METHOD_RE = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*(?:['"`]([\w/:\-.$]*)['"`])?\s*\)/g;
const CONTROLLER_PREFIX_RE = /@Controller\s*\(\s*['"`]([\w/:\-.$]*)['"`]\s*\)\s*export\s+class\s+(\w+)/g;
const CLASS_BLOCK_RE = /export\s+class\s+([A-Z]\w+Controller)\s*\{([\s\S]*?)^\}/gm;
const METHOD_HANDLER_RE = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*(?:['"`]([\w/:\-.$]*)['"`])?\s*\)\s*[\s\S]{0,200}?(?:async\s+)?(\w+)\s*\(/g;

async function main() {
  const shard = makeShard();

  // 1) Backend endpoints.
  const backendFiles = await collect(`${ROOT}/backend/src`, (_p, n) =>
    /controller\.(ts|mts)$/.test(n) || /\.controller\.ts$/.test(n),
  );
  const backendEndpoints = []; // { method, route, controller, handler, file, line }

  for (const file of backendFiles) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    const prefixes = new Map(); // controllerClass → prefix
    for (const m of src.matchAll(CONTROLLER_PREFIX_RE)) {
      prefixes.set(m[2], normPath(m[1] || ''));
    }

    // For each class, scan its method-level decorators.
    for (const klass of src.matchAll(CLASS_BLOCK_RE)) {
      const [, className, body] = klass;
      const prefix = prefixes.get(className) || '';
      for (const m of body.matchAll(METHOD_HANDLER_RE)) {
        const [, httpMethod, subPath = '', handlerName] = m;
        const route = joinRoute(prefix, subPath);
        const ep = {
          method: httpMethod.toUpperCase(),
          route,
          controller: className,
          handler: handlerName,
          file: relPath,
          line: lineOf(src, klass.index + m.index),
        };
        backendEndpoints.push(ep);
        const id = nid('api-endpoint', ep.method, ep.route);
        addNode(shard, {
          id,
          label: `${ep.method} ${ep.route}`,
          type: 'api-endpoint',
          file: relPath,
          line: ep.line,
          meta: ep,
        });
        addEdge(shard, nid('nest-controller', className), id, 'exposes-route');
      }
    }
  }

  // 2) Frontend call sites.
  const frontendFiles = await collect(`${ROOT}/frontend/src`, (_p, n) =>
    /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(n) && !n.endsWith('.spec.ts') && !n.endsWith('.spec.tsx'),
  );
  let callsites = 0;
  let matches = 0;

  for (const file of frontendFiles) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    for (const m of src.matchAll(FRONTEND_FETCH_RE)) {
      const [, fn, pathLiteral] = m;
      if (!pathLiteral || pathLiteral.startsWith('$')) continue;
      const normalized = normPath(pathLiteral);
      const callsiteId = nid('api-callsite', relPath, `${fn}(${normalized})`);
      addNode(shard, {
        id: callsiteId,
        label: `${fn}('${normalized}')`,
        type: 'api-callsite',
        file: relPath,
        line: lineOf(src, m.index),
        meta: { fn, path: normalized },
      });
      callsites++;
      // Find a backend endpoint whose route matches (consider any HTTP method).
      const candidates = backendEndpoints.filter((e) => routeMatches(e.route, normalized));
      for (const ep of candidates) {
        addEdge(shard, callsiteId, nid('api-endpoint', ep.method, ep.route), 'calls-endpoint');
        matches++;
      }
    }
  }

  shard.stats['stats:callsites'] = callsites;
  shard.stats['stats:matched-edges'] = matches;
  shard.stats['stats:backend-endpoints'] = backendEndpoints.length;

  await writeShard(shard, OUT);
  console.log(`[api-contract] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[api-contract] stats: ${JSON.stringify(shard.stats)}`);
}

function normPath(p) {
  return '/' + (p || '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\$\{[^}]+\}/g, ':param').replace(/:[\w-]+(\([^)]*\))?/g, ':param');
}

function joinRoute(prefix, sub) {
  const a = (prefix || '').replace(/\/+$/, '');
  const b = (sub || '').replace(/^\/+/, '');
  const joined = [a, b].filter(Boolean).join('/');
  return normPath(joined);
}

function routeMatches(backendRoute, frontendPath) {
  // Strip leading /api/ prefix sometimes added by Next proxy routes.
  const fp = frontendPath.replace(/^\/api\//, '/');
  // Param-tolerant equality.
  const a = backendRoute.replace(/:param/g, '*');
  const b = fp.replace(/:param/g, '*');
  if (a === b) return true;
  // Allow trailing-slash differences and prefix matches when route is parametric.
  const aSeg = a.split('/').filter(Boolean);
  const bSeg = b.split('/').filter(Boolean);
  if (aSeg.length !== bSeg.length) return false;
  return aSeg.every((seg, i) => seg === bSeg[i] || seg === '*' || bSeg[i] === '*');
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

await main();
