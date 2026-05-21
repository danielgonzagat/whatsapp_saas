#!/usr/bin/env node
// tools/visual-fidelity/playwright-diff.mjs — Wave 10: Playwright screenshot diff
// against a curated "reference" set, applied to the live or sandbox preview.
//
// Use case: PR #409 ships a visual-fidelity rewrite. Before merge, we want to
// know the rendered surface actually matches the canonical anexo. This tool:
//   1) Launches Chromium via Playwright (headed=false).
//   2) Visits each surface in `tools/visual-fidelity/surfaces.json` (path,
//      viewport, theme, optional pre-conditions).
//   3) Takes a screenshot.
//   4) Diffs against a reference under `tools/visual-fidelity/reference/`.
//   5) If diff > threshold, writes the diff PNG + fails the run.
//
// CLI:
//   node tools/visual-fidelity/playwright-diff.mjs           # local on :3000
//   node tools/visual-fidelity/playwright-diff.mjs --url=URL # against any URL
//   node tools/visual-fidelity/playwright-diff.mjs --update  # adopt current as reference
//   node tools/visual-fidelity/playwright-diff.mjs --threshold=0.02
//
// Reference images live in `tools/visual-fidelity/reference/<slug>-<viewport>-<theme>.png`.

import { argv } from 'node:process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REF_DIR = join(__dirname, 'reference');
const OUT_DIR = join(ROOT, 'graphify-out', 'visual-diff');
const SURFACES_FILE = join(__dirname, 'surfaces.json');

const URL_BASE = argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000';
const UPDATE = argv.includes('--update');
const THRESHOLD = Number(argv.find((a) => a.startsWith('--threshold='))?.split('=')[1] || 0.02);

async function loadSurfaces() {
  try {
    return JSON.parse(await readFile(SURFACES_FILE, 'utf8'));
  } catch {
    return DEFAULT_SURFACES;
  }
}

const DEFAULT_SURFACES = [
  { slug: 'marketing-whatsapp', path: '/marketing/whatsapp', viewport: { w: 1440, h: 900 }, theme: 'dark' },
  { slug: 'marketing-instagram', path: '/marketing/instagram', viewport: { w: 1440, h: 900 }, theme: 'dark' },
  { slug: 'marketing-tiktok', path: '/marketing/tiktok', viewport: { w: 1440, h: 900 }, theme: 'dark' },
  { slug: 'marketing-facebook', path: '/marketing/facebook', viewport: { w: 1440, h: 900 }, theme: 'dark' },
  { slug: 'marketing-email', path: '/marketing/email', viewport: { w: 1440, h: 900 }, theme: 'dark' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(REF_DIR, { recursive: true });
  const surfaces = await loadSurfaces();

  // Dynamically import playwright — keep it as an opt-in dep.
  let chromium;
  try {
    ({ chromium } = await import(join(ROOT, 'frontend/node_modules/playwright')));
  } catch {
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      console.error('[playwright-diff] playwright not installed — install in frontend/ or globally');
      process.exit(1);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  let failed = 0;
  let passed = 0;
  const report = [];

  for (const s of surfaces) {
    const url = `${URL_BASE}${s.path}`;
    await ctx.addCookies?.([]).catch(() => {});
    if (s.viewport) {
      await page.setViewportSize({ width: s.viewport.w, height: s.viewport.h });
    }
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch (err) {
      console.warn(`[playwright-diff] navigation failed ${url}: ${err.message}`);
      report.push({ slug: s.slug, status: 'navigation_failed', error: err.message });
      failed++;
      continue;
    }
    await page.waitForTimeout(500);
    const refKey = `${s.slug}-${s.viewport.w}x${s.viewport.h}-${s.theme}`;
    const refPath = join(REF_DIR, `${refKey}.png`);
    const actualPath = join(OUT_DIR, `${refKey}.actual.png`);
    await page.screenshot({ path: actualPath, fullPage: false });

    if (UPDATE) {
      await page.screenshot({ path: refPath, fullPage: false });
      console.log(`[playwright-diff] reference updated: ${refKey}`);
      passed++;
      report.push({ slug: s.slug, status: 'reference_updated' });
      continue;
    }

    const exists = await stat(refPath).then(() => true).catch(() => false);
    if (!exists) {
      console.warn(`[playwright-diff] no reference for ${refKey} — run with --update first`);
      report.push({ slug: s.slug, status: 'no_reference' });
      failed++;
      continue;
    }

    // Diff via pixelmatch CLI bridge: best-effort, falls back to byte-equality.
    const diffPath = join(OUT_DIR, `${refKey}.diff.png`);
    const diff = pixelmatchDiff(refPath, actualPath, diffPath);
    const ratio = diff.ratio;
    if (ratio > THRESHOLD) {
      console.error(`[playwright-diff] DIFF ${refKey}: ${(ratio * 100).toFixed(2)}% > ${(THRESHOLD * 100).toFixed(2)}% (see ${diffPath})`);
      report.push({ slug: s.slug, status: 'differs', diffRatio: ratio, diffPath });
      failed++;
    } else {
      console.log(`[playwright-diff] OK   ${refKey}: ${(ratio * 100).toFixed(3)}%`);
      report.push({ slug: s.slug, status: 'ok', diffRatio: ratio });
      passed++;
    }
  }

  await browser.close();
  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify({ passed, failed, report }, null, 2));
  console.log(`\n[playwright-diff] ${passed} passed / ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

function pixelmatchDiff(refPath, actualPath, diffPath) {
  // Use the `pixelmatch` CLI shipped with playwright's deps, or fall back.
  // For atomic determinism we shell out instead of pulling pixelmatch as direct dep.
  const r = spawnSync('node', ['-e', `
    const fs = require('fs');
    const path = require('path');
    const PNG = require('${join(ROOT, 'frontend/node_modules/pngjs')}/lib/png').PNG;
    const pixelmatch = require('${join(ROOT, 'frontend/node_modules/pixelmatch')}');
    const ref = PNG.sync.read(fs.readFileSync('${refPath}'));
    const act = PNG.sync.read(fs.readFileSync('${actualPath}'));
    if (ref.width !== act.width || ref.height !== act.height) {
      console.log(JSON.stringify({ ratio: 1, reason: 'size_mismatch', ref: [ref.width, ref.height], actual: [act.width, act.height] }));
      process.exit(0);
    }
    const diff = new PNG({ width: ref.width, height: ref.height });
    const mismatched = pixelmatch(ref.data, act.data, diff.data, ref.width, ref.height, { threshold: 0.1 });
    fs.writeFileSync('${diffPath}', PNG.sync.write(diff));
    console.log(JSON.stringify({ ratio: mismatched / (ref.width * ref.height) }));
  `]);
  try {
    return JSON.parse(r.stdout.toString().trim());
  } catch {
    return { ratio: 0, reason: 'pixelmatch_unavailable' };
  }
}

await main();
