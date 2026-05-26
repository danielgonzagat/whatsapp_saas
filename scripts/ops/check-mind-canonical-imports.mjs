#!/usr/bin/env node
/**
 * check-mind-canonical-imports.mjs
 *
 * Gate G4 (Mind canonical import enforcement) of the Architectural
 * Semantic Canonicalization mission.
 *
 * Scans all backend/frontend/worker TypeScript source for imports
 * pointing at the LEGACY brain-*.service paths or ai-brain/ paths,
 * which are now @deprecated re-exports. New code must import from
 * `kloel/mind/coordination` or `kloel/mind/knowledge` etc.
 *
 * Soft mode (default) emits warnings only. After the 4-week alias
 * window (per ADR-0013), the gate promotes to --strict, blocking
 * pre-push when any legacy-path import remains.
 *
 * Usage:
 *   node scripts/ops/check-mind-canonical-imports.mjs              # soft
 *   node scripts/ops/check-mind-canonical-imports.mjs --strict     # blocks on violations
 *   node scripts/ops/check-mind-canonical-imports.mjs --report     # human-readable summary
 *
 * Exit codes:
 *   0 — OK
 *   1 — strict-mode violation
 *   2 — script error
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const STRICT = process.argv.includes('--strict');
const REPORT = process.argv.includes('--report');

const SCAN_DIRS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'build', 'coverage']);
const SCAN_EXT = /\.[mc]?[tj]sx?$/;

/**
 * Legacy paths → canonical replacements. The KEY is a substring that
 * must appear in an `import` statement; the VALUE is the canonical
 * path to use instead. Both are repo-relative.
 */
const LEGACY_PATHS = [
  // ADR-0013 Wave M1 — coordination
  { legacy: '/kloel/brain-autonomy.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/brain-capability-executor.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/brain-capability-registry.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/brain-commercial-graph.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/brain-event-spine.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/brain-runtime.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/whatsapp-brain.service', canonical: '/kloel/mind/coordination' },
  { legacy: '/kloel/kloel-lead-brain.service', canonical: '/kloel/mind/coordination' },
  // ADR-0013 Wave M2 — knowledge (ex-ai-brain)
  { legacy: '/ai-brain/agent-assist.service', canonical: '/kloel/mind/knowledge' },
  { legacy: '/ai-brain/knowledge-base.service', canonical: '/kloel/mind/knowledge' },
  { legacy: '/ai-brain/vector.service', canonical: '/kloel/mind/knowledge' },
  { legacy: '/ai-brain/media-factory.service', canonical: '/kloel/mind/knowledge' },
  { legacy: '/ai-brain/hidden-data.service', canonical: '/kloel/mind/knowledge' },
  // ADR-0013 Wave M3 — observability (ex-brain/)
  { legacy: '/brain/brain-spine-audit.service', canonical: '/kloel/mind/observability' },
  // ADR-0013 Wave M4 — cia (ex-cia/)
  { legacy: '/cia/cia.service', canonical: '/kloel/mind/cia' },
];

const ALIAS_HOSTS_RE = /(canonical[-_]vocabulary|deprecation[-_]map|\.spec\.|\.test\.|\.e2e\.|\.fixture\.|kloel\/mind\/(coordination|knowledge|observability|cia)\/)/i;

function out(line) {
  process.stdout.write(line + '\n');
}

function err(line) {
  process.stderr.write(line + '\n');
}

function readDirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'ENOTDIR')) {
      return null;
    }
    throw e;
  }
}

function statSafe(p) {
  try {
    return statSync(p);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES')) {
      return null;
    }
    throw e;
  }
}

function readFileSafe(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'EACCES')) {
      return null;
    }
    throw e;
  }
}

function walk(dir, acc) {
  const entries = readDirSafe(dir);
  if (entries === null) return acc;
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSafe(full);
    if (st === null) continue;
    if (st.isDirectory()) walk(full, acc);
    else if (SCAN_EXT.test(name)) acc.push(full);
  }
  return acc;
}

function findLegacyImports(src, legacyMap) {
  const violations = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('import')) continue;
    for (const { legacy, canonical } of legacyMap) {
      if (line.includes(legacy)) {
        violations.push({ line: i + 1, content: line.trim(), legacy, canonical });
      }
    }
  }
  return violations;
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), files);
  }

  const all = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (ALIAS_HOSTS_RE.test(rel)) continue;
    const src = readFileSafe(file);
    if (src === null) continue;
    const found = findLegacyImports(src, LEGACY_PATHS);
    for (const v of found) {
      all.push({ file: rel, ...v });
    }
  }

  if (REPORT) {
    out('');
    out(`[check-mind-canonical-imports] scanned ${files.length} files`);
    out(`[check-mind-canonical-imports] legacy import sites detected: ${all.length}`);
    out('');
    const byLegacy = new Map();
    for (const v of all) {
      if (!byLegacy.has(v.legacy)) byLegacy.set(v.legacy, []);
      byLegacy.get(v.legacy).push(v);
    }
    for (const [legacy, list] of [...byLegacy.entries()].sort((a, b) => b[1].length - a[1].length)) {
      out(`  ${legacy} → ${list[0].canonical}  (${list.length} sites)`);
      for (const v of list.slice(0, 5)) {
        out(`    • ${v.file}:${v.line}`);
      }
      if (list.length > 5) out(`    • +${list.length - 5} more`);
    }
    process.exitCode = all.length && STRICT ? 1 : 0;
    return;
  }

  if (STRICT && all.length) {
    for (const v of all) {
      err(`[G4-LEGACY-IMPORT] ${v.file}:${v.line}`);
      err(`    legacy: ${v.legacy}`);
      err(`    canonical: ${v.canonical}`);
    }
    err('');
    err(`[check-mind-canonical-imports] FAILED — ${all.length} legacy import site(s).`);
    err('Run with --report for the full list.');
    process.exitCode = 1;
    return;
  }

  out(`[check-mind-canonical-imports] OK — ${all.length} legacy import site(s) (soft; will block in --strict after 4-week alias window).`);
  process.exitCode = 0;
}

main();
