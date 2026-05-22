#!/usr/bin/env node
// tools/memory-curator/curate.mjs — L12 memory consolidation + expiry.
//
// CLI:
//   curate.mjs scan                # report dupes/stale/oversized; never delete
//   curate.mjs prune --apply       # actually move stale to .memory-archive/
//   curate.mjs dedupe --apply      # merge candidates flagged in scan
//
// Conservative defaults — never deletes; only archives. Honors frontmatter `pinned: true`.
// Anti-drift rules:
//   • Memories older than 90 days WITHOUT pin and WITHOUT recent citation in MEMORY.md = candidate
//   • Memories with description hash collision = candidate
//   • Memories oversized (>20KB) = candidate for split
//   • Memories with broken [[link]] references = flagged

import { argv } from 'node:process';
import { readdir, readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const MEM_DIR = `${homedir()}/.claude/projects/-Users-danielpenin-whatsapp-saas/memory`;
const ARCHIVE = `${MEM_DIR}/.archive`;
const INDEX = `${MEM_DIR}/MEMORY.md`;
const STALE_DAYS = Number(process.env.MEMORY_STALE_DAYS || 90);
const OVERSIZE_BYTES = 20 * 1024;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const LINK_RE = /\[\[([\w\-]+)\]\]/g;

const APPLY = argv.includes('--apply');

async function loadFiles() {
  let entries;
  try {
    entries = await readdir(MEM_DIR);
  } catch {
    return [];
  }
  const files = [];
  for (const name of entries) {
    if (!name.endsWith('.md') || name === 'MEMORY.md' || name.startsWith('.')) continue;
    const full = join(MEM_DIR, name);
    const raw = await readFile(full, 'utf8');
    const s = await stat(full);
    const fm = parseFrontmatter(raw);
    files.push({ name, path: full, raw, mtime: s.mtime.getTime(), size: s.size, fm: fm.meta, body: fm.body });
  }
  return files;
}

function parseFrontmatter(raw) {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*(\w+):\s*(.+?)\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return { meta, body: m[2] };
}

async function loadIndexLinks() {
  try {
    const idx = await readFile(INDEX, 'utf8');
    return new Set([...idx.matchAll(/\[([^\]]+)\]\(([\w\-]+\.md)\)/g)].map((m) => m[2]));
  } catch {
    return new Set();
  }
}

async function scan() {
  const files = await loadFiles();
  const indexed = await loadIndexLinks();
  const now = Date.now();
  const days = (ms) => Math.floor((now - ms) / 86_400_000);

  const oversized = [];
  const stale = [];
  const orphaned = []; // file exists but not referenced from MEMORY.md
  const brokenLinks = [];
  const dupes = [];

  const hashByDesc = new Map();
  const validNames = new Set(files.map((f) => f.name));

  for (const f of files) {
    if (f.size > OVERSIZE_BYTES) oversized.push({ file: f.name, sizeKB: Math.round(f.size / 102.4) / 10 });

    const pinned = (f.fm.pinned || '').toLowerCase() === 'true';
    if (!pinned && days(f.mtime) > STALE_DAYS && !indexed.has(f.name)) {
      stale.push({ file: f.name, daysOld: days(f.mtime) });
    }

    if (!indexed.has(f.name)) {
      orphaned.push(f.name);
    }

    const dh = createHash('sha1').update(f.fm.description || '').digest('hex');
    if (f.fm.description && hashByDesc.has(dh)) {
      dupes.push({ file: f.name, sameAs: hashByDesc.get(dh) });
    } else if (f.fm.description) {
      hashByDesc.set(dh, f.name);
    }

    for (const m of f.body.matchAll(LINK_RE)) {
      const target = m[1];
      if (!validNames.has(`${target}.md`)) {
        brokenLinks.push({ file: f.name, broken: target });
      }
    }
  }

  return { totalFiles: files.length, totalBytes: files.reduce((a, f) => a + f.size, 0), indexed: indexed.size, oversized, stale, orphaned, brokenLinks, dupes };
}

async function prune(report) {
  await mkdir(ARCHIVE, { recursive: true });
  for (const s of report.stale) {
    const src = join(MEM_DIR, s.file);
    const dst = join(ARCHIVE, s.file);
    await rename(src, dst);
    console.log(`archived ${s.file} (${s.daysOld}d old, not referenced)`);
  }
  console.log(`done: ${report.stale.length} files archived to .archive/`);
}

async function dedupe(report) {
  if (report.dupes.length === 0) {
    console.log('nothing to dedupe');
    return;
  }
  await mkdir(ARCHIVE, { recursive: true });
  for (const d of report.dupes) {
    const src = join(MEM_DIR, d.file);
    const dst = join(ARCHIVE, `dupe-of-${d.sameAs}-${d.file}`);
    await rename(src, dst);
    console.log(`archived ${d.file} (duplicate description of ${d.sameAs})`);
  }
}

const cmd = argv[2];
const report = await scan();
console.log(JSON.stringify({ summary: { totalFiles: report.totalFiles, totalKB: Math.round(report.totalBytes / 102.4) / 10, indexed: report.indexed }, oversized: report.oversized, stale: report.stale.slice(0, 50), orphaned: report.orphaned.slice(0, 50), brokenLinks: report.brokenLinks.slice(0, 50), dupes: report.dupes.slice(0, 50) }, null, 2));

if (cmd === 'prune' && APPLY) {
  console.log('\n--- pruning ---');
  await prune(report);
}
if (cmd === 'dedupe' && APPLY) {
  console.log('\n--- deduping ---');
  await dedupe(report);
}
