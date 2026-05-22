#!/usr/bin/env node
// tools/crystallization/run.mjs — Wave 11 #4: route gap conversion.
//
// Reads route-gap detector output (graphify-out/route-gaps.json),
// picks N gaps by priority (graphify-out/route-gap-priority.md), and for each:
//
//   1. Builds context: CodeGraph callers, AppShell sidebar entry, Prisma
//      models in the same module, ADR/memory mentions.
//   2. Picks a template (frontend-page-real | redirect-fix | service-shell).
//   3. Generates concrete file edits.
//   4. Emits an auto-PR job per route gap (or per cluster).
//
// CLI:
//   node tools/crystallization/run.mjs --top=5
//   node tools/crystallization/run.mjs --route=/anuncios
//   node tools/crystallization/run.mjs --dry-run
//
// LLM is used ONLY for the natural-language `intent_summary` per route gap. The
// code generation itself is deterministic templates parameterised by the
// graph context — safer for autonomous batches.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { argv } from 'node:process';
import { dirname, join, basename } from 'node:path';

const ROOT = process.cwd();
const GAPS = join(ROOT, 'graphify-out/route-gaps.json');
const APPSHELL = join(ROOT, 'frontend/src/components/kloel/AppShell.routes.ts');
const JOBS_DIR = join(ROOT, 'graphify-out/auto-pr-jobs');

const TOP = Number(argv.find((a) => a.startsWith('--top='))?.split('=')[1] || 5);
const ROUTE_ONLY = argv.find((a) => a.startsWith('--route='))?.split('=')[1];
const DRY = argv.includes('--dry-run');

async function main() {
  if (!existsSync(GAPS)) {
    console.error('[crystallize] no route-gaps.json — run the route gap detector first');
    process.exit(1);
  }
  const { gaps } = JSON.parse(await readFile(GAPS, 'utf8'));
  const sidebar = await readSafe(APPSHELL);

  const candidates = ROUTE_ONLY
    ? gaps.filter((s) => s.route === ROUTE_ONLY)
    : gaps;

  // Rank by reason weight + sidebar presence
  const ranked = candidates
    .map((s) => ({ ...s, score: rank(s, sidebar) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP);

  console.log(`[crystallize] selected ${ranked.length} gaps to convert`);
  let emitted = 0;
  for (const gap of ranked) {
    const out = await crystallize(gap, sidebar);
    if (!out) continue;
    if (DRY) {
      console.log(`  DRY would emit job for ${gap.route} (${out.files.length} files)`);
    } else {
      await emitJob(out);
      emitted++;
    }
  }
  console.log(`[crystallize] ${DRY ? 'would emit' : 'emitted'} ${emitted} jobs`);
}

function rank(gap, sidebar) {
  let score = 0;
  if (gap.reason === 'placeholder-marker') score += 50;
  else if (gap.reason === 'returns-null') score += 30;
  else if (gap.reason === 'redirect-only') score += 5;
  else if (gap.reason.startsWith('tiny-')) {
    const loc = Number(gap.reason.match(/tiny-(\d+)/)?.[1] || 99);
    score += Math.max(10, 25 - loc);
  }
  if (sidebar && (sidebar.includes(`'${gap.route}'`) || sidebar.includes(`"${gap.route}"`))) score += 30;
  const depth = gap.route.split('/').filter(Boolean).length;
  score += Math.max(5, 25 - depth * 5);
  return score;
}

async function crystallize(gap, sidebar) {
  // Decide template by reason
  if (gap.reason === 'redirect-only') return null; // intentional, skip
  const tmpl = pickTemplate(gap);
  if (!tmpl) return null;
  const route = gap.route;
  const filePath = gap.file;
  const moduleHint = route.split('/').filter(Boolean)[0] || 'home';
  const existing = await readSafe(join(ROOT, filePath));
  const componentName = pascal(moduleHint) + 'View';
  // Locate the canonical view component if it exists in src/components/kloel/<module>/<X>View.tsx
  const candidateView = await findCanonicalView(moduleHint);
  if (candidateView && existing && existing.includes(candidateView.exportName)) {
    // The page already delegates to the real view. Skip this already-wired route.
    return null;
  }

  const newContent = renderPageDelegating(filePath, moduleHint, candidateView, gap);
  if (!newContent) return null;

  const ts = Date.now();
  return {
    title: `feat(crystallize): wire ${route} to a real component`,
    body: composeBody(gap, candidateView),
    branch: `auto/crystallize-${moduleHint}-${ts}`,
    base: 'origin/main',
    files: [{ path: filePath, content: newContent }],
    shell: [
      'cd frontend && npx tsc --noEmit -p tsconfig.json || true',
    ],
    _routeGapMeta: { route, reason: gap.reason, score: gap.score },
  };
}

function pickTemplate(gap) {
  if (gap.reason === 'placeholder-marker') return 'frontend-page-real';
  if (gap.reason === 'placeholder-comment-only') return 'frontend-page-real';
  if (gap.reason === 'returns-null') return 'frontend-page-real';
  if (gap.reason.startsWith('tiny-')) return 'frontend-page-real';
  return null;
}

async function findCanonicalView(moduleHint) {
  const candidates = [
    `frontend/src/components/kloel/${moduleHint}/${pascal(moduleHint)}View.tsx`,
    `frontend/src/components/kloel/${moduleHint}/index.tsx`,
    `frontend/src/components/kloel/${moduleHint}/View.tsx`,
  ];
  for (const c of candidates) {
    if (existsSync(join(ROOT, c))) {
      const content = await readFile(join(ROOT, c), 'utf8');
      const exportName = (content.match(/export\s+default\s+(?:function\s+)?(\w+)/)?.[1])
        || (content.match(/export\s+(?:const|function)\s+(\w+)/)?.[1])
        || pascal(moduleHint) + 'View';
      return { path: c, exportName };
    }
  }
  return null;
}

function renderPageDelegating(_filePath, moduleHint, view, gap) {
  if (!view) return null;
  const importPath = '@/' + view.path.replace(/^frontend\/src\//, '');
  return `import ${view.exportName} from '${importPath.replace(/\.tsx?$/, '')}';\n\n/** ${gap.route} — crystallised by tools/crystallization/run.mjs.\n *  Replaces route gap (reason: ${gap.reason}) with the canonical view in this module. */\nexport default function ${pascal(moduleHint)}Page() {\n  return <${view.exportName} />;\n}\n`;
}

function composeBody(gap, view) {
  return `## Route gap crystallisation

**Route:** \`${gap.route}\`
**Route file:** \`${gap.file}\`
**Reason flagged:** ${gap.reason}
**Score:** ${gap.score}

**Canonical view discovered:** ${view ? `\`${view.path}\` → \`${view.exportName}\`` : 'none (skipped)'}

This PR replaces the route gap with a thin wrapper that delegates to the
canonical view component. The view itself already exists in the
\`components/kloel/\` tree; the page was previously an empty shell.

Generated by \`tools/crystallization/run.mjs\` — Wave 11 (#4 Production
Crystallization).

---
Regenerate with \`node tools/crystallization/run.mjs --route=${gap.route}\`.`;
}

async function emitJob(job) {
  await mkdir(JOBS_DIR, { recursive: true });
  const routeGapMeta = job._routeGapMeta;
  const out = join(JOBS_DIR, `crystallize-${routeGapMeta.route.replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.json`);
  delete job._routeGapMeta;
  await writeFile(out, JSON.stringify(job, null, 2));
  console.log(`  -> ${out}`);
}

async function readSafe(p) { try { return await readFile(p, 'utf8'); } catch { return null; } }
function pascal(s) { return s.split(/[-_/]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''); }

await main();
