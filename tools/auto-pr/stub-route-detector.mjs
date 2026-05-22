#!/usr/bin/env node
// tools/auto-pr/stub-route-detector.mjs — Wave 10: stub route inventory.
//
// Identifies Next.js app-router pages and route handlers that are likely
// placeholders. Heuristics:
//   • `<15 lines` of executable code (excluding imports/comments/braces)
//   • Body returns `null` or a `Coming soon` literal
//   • Re-exports `redirect(...)` from `next/navigation` with no UI
//
// Output: graphify-out/stub-routes.json — { stubs: [{ route, file, reason, loc }] }
//
// This is a REPORTER, not an auto-fixer — each stub needs domain context to
// convert to "real". Reports feed dashboards + manual prioritisation.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, readCapped, rel } from '../graphify-plus/lib/scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const APP_DIR = join(ROOT, 'frontend/src/app');
const OUT = join(ROOT, 'graphify-out', 'stub-routes.json');

const NEXT_FILE_RE = /^(page|route|layout)\.(t|j)sx?$/;

function executableLines(src) {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/')) return false;
      if (t === '{' || t === '}' || t === '(' || t === ')') return false;
      if (t.startsWith('import ') || t.startsWith('export ')) return false;
      return true;
    }).length;
}

function detectReason(src, file) {
  if (/redirect\(['"`]\/[^'"`]+['"`]\)/.test(src) && !/<[A-Z]/.test(src)) return 'redirect-only';
  if (/return\s+null\s*[;}]/.test(src)) return 'returns-null';
  if (/Coming soon|Em breve|Placeholder|TODO|FIXME/i.test(src)) return 'placeholder-marker';
  const loc = executableLines(src);
  if (loc < 15) return `tiny-${loc}-loc`;
  return null;
}

function pathToRoute(filePath) {
  const inside = filePath.replace(/^.*?\/frontend\/src\/app\//, '');
  const segments = inside.split('/').slice(0, -1);
  return (
    '/' +
    segments
      .filter((s) => !(s.startsWith('(') && s.endsWith(')')))
      .map((s) => s.replace(/\[\.{3}(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1'))
      .join('/')
  );
}

async function main() {
  const files = await collect(APP_DIR, (_p, n) => NEXT_FILE_RE.test(n));
  const stubs = [];
  let scanned = 0;
  for (const file of files) {
    scanned++;
    const src = await readCapped(file);
    if (!src) continue;
    const reason = detectReason(src, file);
    if (!reason) continue;
    stubs.push({
      route: pathToRoute(file),
      file: rel(file, ROOT),
      reason,
      loc: executableLines(src),
    });
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ scanned, stubCount: stubs.length, stubs }, null, 2));
  console.log(`[stub-routes] scanned=${scanned} stubs=${stubs.length}`);
  // Top 15 most representative for quick scan
  for (const s of stubs.slice(0, 15)) {
    console.log(`  ${s.route.padEnd(40)} loc=${String(s.loc).padStart(3)} reason=${s.reason}`);
  }
  if (stubs.length > 15) console.log(`  … +${stubs.length - 15} more in ${OUT}`);
}

await main();
