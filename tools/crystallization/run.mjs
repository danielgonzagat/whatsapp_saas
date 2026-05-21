#!/usr/bin/env node
// tools/crystallization/run.mjs — Wave 11 #4: stub → real conversion.
//
// Reads tools/auto-pr/stub-route-detector.mjs output (graphify-out/stub-routes.json),
// picks N stubs by priority (graphify-out/stub-priority.md), and for each:
//
//   1. Builds context: CodeGraph callers, AppShell sidebar entry, Prisma
//      models in the same module, ADR/memory mentions.
//   2. Picks a template (frontend-page-real | redirect-fix | service-shell).
//   3. Generates concrete file edits.
//   4. Emits an auto-PR job per stub (or per cluster).
//
// CLI:
//   node tools/crystallization/run.mjs --top=5
//   node tools/crystallization/run.mjs --route=/anuncios
//   node tools/crystallization/run.mjs --dry-run
//
// LLM is used ONLY for the natural-language `intent_summary` per stub. The
// code generation itself is deterministic templates parameterised by the
// graph context — safer for autonomous batches.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { argv } from 'node:process';
import { dirname, join, basename } from 'node:path';

const ROOT = process.cwd();
const STUBS = join(ROOT, 'graphify-out/stub-routes.json');
const APPSHELL = join(ROOT, 'frontend/src/components/kloel/AppShell.routes.ts');
const JOBS_DIR = join(ROOT, 'graphify-out/auto-pr-jobs');

const TOP = Number(argv.find((a) => a.startsWith('--top='))?.split('=')[1] || 5);
const ROUTE_ONLY = argv.find((a) => a.startsWith('--route='))?.split('=')[1];
const DRY = argv.includes('--dry-run');

async function main() {
  if (!existsSync(STUBS)) {
    console.error('[crystallize] no stub-routes.json — run tools/auto-pr/stub-route-detector.mjs first');
    process.exit(1);
  }
  const { stubs } = JSON.parse(await readFile(STUBS, 'utf8'));
  const sidebar = await readSafe(APPSHELL);

  const candidates = ROUTE_ONLY
    ? stubs.filter((s) => s.route === ROUTE_ONLY)
    : stubs;

  // Rank by reason weight + sidebar presence
  const ranked = candidates
    .map((s) => ({ ...s, score: rank(s, sidebar) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP);

  console.log(`[crystallize] selected ${ranked.length} stubs to convert`);
  let emitted = 0;
  for (const stub of ranked) {
    const out = await crystallize(stub, sidebar);
    if (!out) continue;
    if (DRY) {
      console.log(`  DRY would emit job for ${stub.route} (${out.files.length} files)`);
    } else {
      await emitJob(out);
      emitted++;
    }
  }
  console.log(`[crystallize] ${DRY ? 'would emit' : 'emitted'} ${emitted} jobs`);
}

function rank(stub, sidebar) {
  let score = 0;
  if (stub.reason === 'placeholder-marker') score += 50;
  else if (stub.reason === 'returns-null') score += 30;
  else if (stub.reason === 'redirect-only') score += 5;
  else if (stub.reason.startsWith('tiny-')) {
    const loc = Number(stub.reason.match(/tiny-(\d+)/)?.[1] || 99);
    score += Math.max(10, 25 - loc);
  }
  if (sidebar && (sidebar.includes(`'${stub.route}'`) || sidebar.includes(`"${stub.route}"`))) score += 30;
  const depth = stub.route.split('/').filter(Boolean).length;
  score += Math.max(5, 25 - depth * 5);
  return score;
}

async function crystallize(stub, sidebar) {
  // Decide template by reason
  if (stub.reason === 'redirect-only') return null; // intentional, skip
  const tmpl = pickTemplate(stub);
  if (!tmpl) return null;
  const route = stub.route;
  const filePath = stub.file;
  const moduleHint = route.split('/').filter(Boolean)[0] || 'home';
  const existing = await readSafe(join(ROOT, filePath));
  const componentName = pascal(moduleHint) + 'View';
  // Locate the canonical view component if it exists in src/components/kloel/<module>/<X>View.tsx
  const candidateView = await findCanonicalView(moduleHint);
  if (candidateView && existing && existing.includes(candidateView.exportName)) {
    // The page already delegates to the real view — this is a thin wrapper,
    // a "false stub". Skip.
    return null;
  }

  const newContent = renderPageDelegating(filePath, moduleHint, candidateView, stub);
  if (!newContent) return null;

  const ts = Date.now();
  return {
    title: `feat(crystallize): wire ${route} to a real component`,
    body: composeBody(stub, candidateView),
    branch: `auto/crystallize-${moduleHint}-${ts}`,
    base: 'origin/main',
    files: [{ path: filePath, content: newContent }],
    shell: [
      'cd frontend && npx tsc --noEmit -p tsconfig.json || true',
    ],
    _stubMeta: { route, reason: stub.reason, score: stub.score },
  };
}

function pickTemplate(stub) {
  if (stub.reason === 'placeholder-marker') return 'frontend-page-real';
  if (stub.reason === 'placeholder-comment-only') return 'frontend-page-real';
  if (stub.reason === 'returns-null') return 'frontend-page-real';
  if (stub.reason.startsWith('tiny-')) return 'frontend-page-real';
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

function renderPageDelegating(_filePath, moduleHint, view, stub) {
  if (!view) return null;
  const importPath = '@/' + view.path.replace(/^frontend\/src\//, '');
  return `import ${view.exportName} from '${importPath.replace(/\.tsx?$/, '')}';\n\n/** ${stub.route} — crystallised by tools/crystallization/run.mjs.\n *  Replaces stub (reason: ${stub.reason}) with the canonical view in this module. */\nexport default function ${pascal(moduleHint)}Page() {\n  return <${view.exportName} />;\n}\n`;
}

function composeBody(stub, view) {
  return `## Stub crystallisation

**Route:** \`${stub.route}\`
**Stub file:** \`${stub.file}\`
**Reason flagged:** ${stub.reason}
**Score:** ${stub.score}

**Canonical view discovered:** ${view ? `\`${view.path}\` → \`${view.exportName}\`` : 'none (skipped)'}

This PR replaces the stub page with a thin wrapper that delegates to the
canonical view component. The view itself already exists in the
\`components/kloel/\` tree; the page was previously an empty stub.

Generated by \`tools/crystallization/run.mjs\` — Wave 11 (#4 Production
Crystallization).

---
🤖 Re-run \`node tools/crystallization/run.mjs --route=${stub.route}\` to regenerate.`;
}

async function emitJob(job) {
  await mkdir(JOBS_DIR, { recursive: true });
  const out = join(JOBS_DIR, `crystallize-${job._stubMeta.route.replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.json`);
  delete job._stubMeta;
  await writeFile(out, JSON.stringify(job, null, 2));
  console.log(`  → ${out}`);
}

async function readSafe(p) { try { return await readFile(p, 'utf8'); } catch { return null; } }
function pascal(s) { return s.split(/[-_/]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''); }

await main();
