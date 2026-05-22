#!/usr/bin/env node
// Route gap prioritizer — Wave 11 prep: prioritised route-gap backlog.
//
// Ranks detected route gaps using:
//   • inbound-mentions   from enriched-graph (how many memory/ADR/docs reference this route)
//   • sidebar-presence   from AppShell.routes.ts (visible to user = higher priority)
//   • parent-traffic     from runtime-railway overlay (live hit count, if available)
//   • depth-from-root    deeper routes are usually less critical
//   • reason             placeholder-marker > tiny > redirect-only
//
// Output: graphify-out/route-gap-priority.md — markdown table sorted by score,
// ready for human prioritisation. NOT auto-fix — each route gap needs a
// template before conversion can run through the L13 loop.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const GAPS_FILE = join(ROOT, 'graphify-out/route-gaps.json');
const GRAPH_FILE = join(ROOT, 'graphify-out/enriched-graph.json');
const APPSHELL_FILE = join(ROOT, 'frontend/src/components/kloel/AppShell.routes.ts');
const OUT = join(ROOT, 'graphify-out/route-gap-priority.md');

const REASON_WEIGHT = {
  'placeholder-marker': 50,
  'returns-null': 30,
  'redirect-only': 5,
};

function reasonScore(reason) {
  if (REASON_WEIGHT[reason] != null) return REASON_WEIGHT[reason];
  const tinyMatch = reason.match(/^tiny-(\d+)-loc$/);
  if (tinyMatch) {
    const loc = Number(tinyMatch[1]);
    // smaller = more likely placeholder; 0 LOC = highest urgency
    return Math.max(10, 20 - loc);
  }
  return 10;
}

function depthScore(route) {
  const depth = route.split('/').filter(Boolean).length;
  // root-level (depth 1) = 20, nested deep (depth 5+) = 5
  return Math.max(5, 25 - depth * 5);
}

async function main() {
  const { gaps } = JSON.parse(await readFile(GAPS_FILE, 'utf8'));
  const graph = await readFile(GRAPH_FILE, 'utf8').then(JSON.parse).catch(() => ({ nodes: [], edges: [] }));
  const appShell = await readFile(APPSHELL_FILE, 'utf8').catch(() => '');

  const mentionsByFile = new Map();
  for (const e of graph.edges || []) {
    if (e.kind === 'mentions-file' && e.target?.startsWith('file:')) {
      const f = e.target.slice('file:'.length);
      mentionsByFile.set(f, (mentionsByFile.get(f) || 0) + 1);
    }
  }

  const ranked = gaps.map((s) => {
    const mentions = mentionsByFile.get(s.file) || 0;
    const sidebar = appShell.includes(`'${s.route}'`) || appShell.includes(`"${s.route}"`) ? 30 : 0;
    const reason = reasonScore(s.reason);
    const depth = depthScore(s.route);
    const score = reason + sidebar + depth + Math.min(20, mentions * 2);
    return { ...s, mentions, sidebar, score };
  }).sort((a, b) => b.score - a.score);

  const tierBuckets = { 'P1 critical': [], 'P2 high': [], 'P3 medium': [], 'P4 low': [] };
  for (const r of ranked) {
    if (r.score >= 80) tierBuckets['P1 critical'].push(r);
    else if (r.score >= 55) tierBuckets['P2 high'].push(r);
    else if (r.score >= 35) tierBuckets['P3 medium'].push(r);
    else tierBuckets['P4 low'].push(r);
  }

  const lines = [
    '# Route Gaps — Prioritised Backlog',
    '',
    `Generated from route gap detector output (${gaps.length} gaps) cross-referenced with the enriched graph (${graph.nodes?.length || 0} nodes) and AppShell sidebar.`,
    '',
    '## Scoring',
    '- **reason**: `placeholder-marker` 50 / `returns-null` 30 / `tiny-N-loc` 20-min(loc,10) / `redirect-only` 5',
    '- **sidebar-present** (in `AppShell.routes.ts`): +30',
    '- **depth-from-root**: deeper = lower (25 - depth*5)',
    '- **mentions-from-memory/docs**: +2 per mention, capped at 20',
    '',
    `## Tier breakdown`,
    '',
    `| Tier | Count |`,
    `|---|---|`,
    ...Object.entries(tierBuckets).map(([t, items]) => `| ${t} | ${items.length} |`),
    '',
  ];
  for (const [tier, items] of Object.entries(tierBuckets)) {
    if (items.length === 0) continue;
    lines.push(`## ${tier}`);
    lines.push('');
    lines.push('| Score | Route | File | Reason | Mentions | Sidebar |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of items) {
      lines.push(`| ${r.score} | \`${r.route}\` | \`${r.file}\` | ${r.reason} | ${r.mentions} | ${r.sidebar ? '✓' : ''} |`);
    }
    lines.push('');
  }

  lines.push('## Wave 11 plan (per tier)');
  lines.push('');
  lines.push('1. **P1 critical**: write template for the top-3 modules these gaps belong to (likely Auth/Workspaces/Settings). One template = N conversions.');
  lines.push('2. **P2 high**: apply same templates if applicable; else write per-tier templates.');
  lines.push('3. **P3 medium**: convert via templated batches.');
  lines.push('4. **P4 low**: many are intentional `redirect-only` parent routes — verify each is INTENTIONAL not accidentally-shell; keep as-is.');

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, lines.join('\n'));
  console.log(`[route-gap-priority] wrote ${OUT}`);
  for (const [tier, items] of Object.entries(tierBuckets)) {
    console.log(`  ${tier.padEnd(15)} ${items.length}`);
  }
}

await main();
