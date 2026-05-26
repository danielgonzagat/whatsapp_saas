#!/usr/bin/env node
// extractors/runtime-sentry.mjs — Wave 4 Sentry runtime overlay.
//
// Pulls top issues + top transactions from Sentry and annotates affected nodes
// with error counts / first-seen / last-seen / culprit symbol.
//
// Requires:
//   • SENTRY_AUTH_TOKEN (org-level token in .env.pulse.local)
//   • SENTRY_ORG (e.g. kloel-inteligencia-comercial-a)
//   • SENTRY_PROJECT (e.g. node)
//
// If absent, emits empty shard (no-op).
//
// Output: graphify-out/shards/runtime-sentry.json

import { argv } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/runtime-sentry.json`;

const TOKEN = process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG;
const PROJECT = process.env.SENTRY_PROJECT || 'node';
const BASE = 'https://us.sentry.io/api/0';

async function main() {
  if (!TOKEN || !ORG) {
    console.log('[runtime-sentry] no SENTRY_AUTH_TOKEN/SENTRY_ORG — emitting empty shard');
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({ nodes: [], edges: [], stats: { noop: true } }));
    return;
  }
  const shard = makeShard();

  // Top 25 unresolved issues, last 24h.
  const issues = await sentryRequest(
    `/projects/${ORG}/${PROJECT}/issues/?statsPeriod=24h&query=is%3Aunresolved&limit=25&sort=freq`,
  );
  if (!Array.isArray(issues)) {
    console.warn('[runtime-sentry] unexpected issues response:', typeof issues);
  } else {
    for (const issue of issues) {
      const id = nid('sentry-issue', issue.shortId || issue.id);
      const culprit = issue.culprit || issue.metadata?.function || 'unknown';
      addNode(shard, {
        id,
        label: `Sentry ${issue.shortId || issue.id}: ${truncate(issue.title || issue.metadata?.type, 80)}`,
        type: 'sentry-issue',
        meta: {
          shortId: issue.shortId,
          level: issue.level,
          status: issue.status,
          culprit,
          count: Number(issue.count) || 0,
          userCount: issue.userCount,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          metadata: issue.metadata,
        },
      });
      // Heuristic: link to the symbol matching culprit ("ClassName.methodName")
      const symMatch = (culprit || '').match(/([A-Z][A-Za-z0-9_]+)\.(\w+)/);
      if (symMatch) {
        const [, className] = symMatch;
        addEdge(shard, id, nid('nest-provider', className), 'fires-in');
        addEdge(shard, id, nid('nest-controller', className), 'fires-in');
      }
      // Match file from culprit if it's a path-like.
      const fileMatch = (culprit || '').match(/([\w\-.\/]+\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx))/);
      if (fileMatch) {
        addEdge(shard, id, nid('file', fileMatch[1]), 'fires-in-file');
      }
    }
    shard.stats['stats:issues'] = issues.length;
    shard.stats['stats:total_events'] = issues.reduce((s, i) => s + (Number(i.count) || 0), 0);
  }

  await writeShard(shard, OUT);
  console.log(`[runtime-sentry] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[runtime-sentry] stats: ${JSON.stringify(shard.stats)}`);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function sentryRequest(path) {
  const res = await fetch(BASE + path, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    console.warn(`[runtime-sentry] ${path} → HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

await main();
