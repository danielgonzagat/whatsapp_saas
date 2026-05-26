#!/usr/bin/env node
// extractors/bundle.mjs — L9 bundle/perf overlay
//
// Lê o resultado de `next build` (e .next/build-manifest.json + app-build-manifest.json)
// e anota cada página Next.js com tamanho de chunks (first-load JS, page JS).
// Se houver `lighthouseci` ou `web-vitals` outputs em frontend/.lighthouseci/, mescla TTI/LCP.
//
// Determinístico. Sem build próprio — só lê o que já foi gerado.

import { argv } from 'node:process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/bundle.json`;

async function main() {
  const shard = makeShard();
  let pagesIndexed = 0;

  // 1) Next.js build manifest
  const manifestPath = join(ROOT, 'frontend/.next/app-build-manifest.json');
  const sizesPath = join(ROOT, 'frontend/.next/required-server-files.json');

  try {
    await stat(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const pages = manifest.pages || {};
    for (const [pageRoute, chunks] of Object.entries(pages)) {
      pagesIndexed++;
      const route = normalizeRoute(pageRoute);
      const id = nid('bundle-page', route);
      // Estimate size by summing chunk file sizes if .next/ has them on disk.
      let bytes = 0;
      let knownChunks = 0;
      for (const chunk of chunks) {
        const chunkPath = join(ROOT, 'frontend/.next', chunk);
        try {
          const s = await stat(chunkPath);
          bytes += s.size;
          knownChunks++;
        } catch {
          // chunk file not present (e.g. server-only)
        }
      }
      addNode(shard, {
        id,
        label: `bundle ${route}`,
        type: 'bundle-page',
        file: `frontend/.next/${pageRoute}`,
        line: 1,
        meta: {
          route,
          chunkCount: chunks.length,
          knownChunks,
          totalBytes: bytes,
          totalKB: Math.round((bytes / 1024) * 10) / 10,
        },
      });
      // Link to the corresponding Next page node from the routing extractor.
      addEdge(shard, id, nid('next-page', route), 'measures');
    }
  } catch (err) {
    console.log(`[bundle] no next manifest (${err.code || err.message}) — skipping bundle indexing`);
  }

  // 2) Lighthouse CI output (frontend/.lighthouseci/<runId>/lhr-*.json)
  const lhciDir = join(ROOT, 'frontend/.lighthouseci');
  try {
    await stat(lhciDir);
    const { readdir } = await import('node:fs/promises');
    const runs = await readdir(lhciDir);
    for (const run of runs) {
      const runDir = join(lhciDir, run);
      let runStat;
      try {
        runStat = await stat(runDir);
      } catch {
        continue;
      }
      if (!runStat.isDirectory()) continue;
      const files = await readdir(runDir);
      for (const file of files.filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))) {
        const lhr = JSON.parse(await readFile(join(runDir, file), 'utf8'));
        const url = lhr.finalUrl || lhr.requestedUrl || '';
        const route = urlToRoute(url);
        const id = nid('lighthouse', route);
        addNode(shard, {
          id,
          label: `lighthouse ${route}`,
          type: 'lighthouse',
          file: `frontend/.lighthouseci/${run}/${file}`,
          line: 1,
          meta: {
            url,
            performance: lhr.categories?.performance?.score,
            accessibility: lhr.categories?.accessibility?.score,
            seo: lhr.categories?.seo?.score,
            best_practices: lhr.categories?.['best-practices']?.score,
            lcp: lhr.audits?.['largest-contentful-paint']?.numericValue,
            fcp: lhr.audits?.['first-contentful-paint']?.numericValue,
            tti: lhr.audits?.['interactive']?.numericValue,
            cls: lhr.audits?.['cumulative-layout-shift']?.numericValue,
            tbt: lhr.audits?.['total-blocking-time']?.numericValue,
          },
        });
        addEdge(shard, id, nid('next-page', route), 'measures');
      }
    }
  } catch {
    // optional
  }

  shard.stats['stats:pages_indexed'] = pagesIndexed;
  await writeShard(shard, OUT);
  console.log(`[bundle] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[bundle] stats: ${JSON.stringify(shard.stats)}`);
}

function normalizeRoute(p) {
  // Next manifest uses '/page' to denote root, '/about/page' etc.
  return p.replace(/\/page$/, '') || '/';
}

function urlToRoute(url) {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return '/';
  }
}

await main();
