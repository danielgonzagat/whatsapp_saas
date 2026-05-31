#!/usr/bin/env node
/**
 * KLOEL Cognitive Participation Scanner
 * =====================================
 *
 * Quantifies what percentage of the source codebase actually participates in
 * the cognition loop (Mind / event spine) versus what is structurally dead
 * relative to it.
 *
 * Pure Node.js — no extra dependencies. Reproducible: scans the working tree
 * exactly as it sits on disk and prints deterministic numbers.
 *
 * Classification (per source file):
 *   EMITTER         — emits any `cognition.*` or `commerce.*` event, either
 *                     directly via an EventEmitter-like API or through the
 *                     canonical `emitCognitionAlias` helper / `publishCommerce*`
 *                     family.
 *   MIND_CONSUMER   — imports any `Mind*` class / service or any module from
 *                     `backend/src/{kloel,admin}/mind/**` outside the pillar
 *                     itself.
 *   PILLAR          — lives under `backend/src/kloel/mind/**` or
 *                     `backend/src/admin/mind/**` (the 8 pillars + supporting
 *                     services).
 *   OBSERVED        — file change produces at least one `cognition.*` event
 *                     (subset of EMITTER restricted to the `cognition.` prefix).
 *   DEAD            — none of the above; no cognition / Mind reference.
 *
 * A single file may carry multiple tags (e.g. PILLAR + EMITTER + OBSERVED).
 * The `% participating` headline counts a file as participating if it carries
 * at least one non-DEAD tag.
 *
 * Scan scope (relative to repo root):
 *   - backend/src/(asterisk)(asterisk)/(asterisk).ts
 *   - worker/(asterisk)(asterisk)/(asterisk).ts
 *   - frontend/src/(asterisk)(asterisk)/(asterisk).{ts,tsx}
 *
 * Excluded:
 *   - *.spec.ts, *.test.ts, *.spec.tsx, *.test.tsx
 *   - any path segment in node_modules, dist, build, .next, .git, coverage,
 *     .claude/worktrees
 *
 * Usage:
 *   node scripts/cognitive-participation.mjs            # human report (stderr)
 *   node scripts/cognitive-participation.mjs --json     # machine summary
 *   node scripts/cognitive-participation.mjs --files    # list files per tag
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACES = [
  { name: 'backend', root: resolve(ROOT, 'backend/src'), exts: ['.ts'] },
  { name: 'worker', root: resolve(ROOT, 'worker'), exts: ['.ts'] },
  { name: 'frontend', root: resolve(ROOT, 'frontend/src'), exts: ['.ts', '.tsx'] },
];

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  'coverage',
  '.turbo',
  '.cache',
  'tmp',
]);

const PILLAR_PATH_FRAGMENTS = [
  `backend${sep}src${sep}kloel${sep}mind${sep}`,
  `backend${sep}src${sep}admin${sep}mind${sep}`,
];

// `emit('cognition.x', …)` / `emit('commerce.x', …)` / `emitEvent('cognition.x', …)`
const DIRECT_EMIT_PATTERN =
  /\bemit(?:Event|Async)?\s*\(\s*['"`](?:cognition|commerce)\./;

// Canonical helper family: `emitCognitionAlias`, `publishCommerceEvent`,
// `publishCognitionEvent`, etc. Used by code that emits via a wrapper.
const HELPER_EMIT_PATTERN =
  /\b(?:emitCognition[A-Za-z0-9_]*|emitCommerce[A-Za-z0-9_]*|publishCognition[A-Za-z0-9_]*|publishCommerce[A-Za-z0-9_]*)\s*\(/;

// `'cognition.foo.bar'` or `"commerce.cart.created"` appearing as a string
// literal. Used as a fallback to catch indirect emits (constants, maps).
const EVENT_NAME_LITERAL_PATTERN =
  /['"`](cognition|commerce)\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+['"`]/;

// `cognition.foo.bar` literal only (for OBSERVED tagging).
const COGNITION_LITERAL_PATTERN =
  /['"`]cognition\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+['"`]/;

// `from '...mind/...'` or `from '.../Mind<Service>'` import lines.
const MIND_IMPORT_PATTERN =
  /\bfrom\s+['"][^'"]*(?:\/mind\/|\/Mind[A-Z][A-Za-z0-9]*)[^'"]*['"]/;

// `import Mind...` symbol token (covers re-exports & destructured imports).
const MIND_SYMBOL_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?(?:\{[^}]*\bMind[A-Z][A-Za-z0-9]*\b[^}]*\}|\bMind[A-Z][A-Za-z0-9]*\b)/;

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

/**
 * Recursive directory walk that yields absolute file paths.
 * @param {string} dir
 * @param {string[]} exts
 * @returns {string[]}
 */
function walk(dir, exts) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      // Skip dotfiles & dot-directories (covers .next, .git, .claude, …).
      continue;
    }
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push(...walk(full, exts));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!exts.some((ext) => entry.name.endsWith(ext))) continue;
    if (
      entry.name.endsWith('.spec.ts') ||
      entry.name.endsWith('.spec.tsx') ||
      entry.name.endsWith('.test.ts') ||
      entry.name.endsWith('.test.tsx') ||
      entry.name.endsWith('.d.ts')
    ) {
      continue;
    }
    out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   path: string,
 *   workspace: string,
 *   tags: Set<string>,
 * }} ClassifiedFile
 */

/**
 * @param {string} absPath
 * @param {string} workspace
 * @returns {ClassifiedFile}
 */
function classify(absPath, workspace) {
  const rel = relative(ROOT, absPath);
  /** @type {Set<string>} */
  const tags = new Set();

  if (PILLAR_PATH_FRAGMENTS.some((frag) => absPath.includes(frag))) {
    tags.add('PILLAR');
  }

  let source;
  try {
    source = readFileSync(absPath, 'utf8');
  } catch {
    return { path: rel, workspace, tags };
  }

  const hasDirectEmit = DIRECT_EMIT_PATTERN.test(source);
  const hasHelperEmit = HELPER_EMIT_PATTERN.test(source);
  const hasEventLiteral = EVENT_NAME_LITERAL_PATTERN.test(source);
  if (hasDirectEmit || hasHelperEmit || hasEventLiteral) {
    tags.add('EMITTER');
  }
  if (COGNITION_LITERAL_PATTERN.test(source) || hasDirectEmit || hasHelperEmit) {
    if (
      hasDirectEmit ||
      COGNITION_LITERAL_PATTERN.test(source) ||
      /\bemitCognition|\bpublishCognition/.test(source)
    ) {
      tags.add('OBSERVED');
    }
  }

  if (
    !tags.has('PILLAR') &&
    (MIND_IMPORT_PATTERN.test(source) || MIND_SYMBOL_IMPORT_PATTERN.test(source))
  ) {
    tags.add('MIND_CONSUMER');
  }

  if (tags.size === 0) {
    tags.add('DEAD');
  }

  return { path: rel, workspace, tags };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * @param {ClassifiedFile[]} files
 */
function summarise(files) {
  /** @type {Record<string, number>} */
  const tagCounts = {
    EMITTER: 0,
    MIND_CONSUMER: 0,
    PILLAR: 0,
    OBSERVED: 0,
    DEAD: 0,
  };
  /** @type {Record<string, { total: number; participating: number; tags: Record<string, number> }>} */
  const byWorkspace = {};

  for (const f of files) {
    if (!byWorkspace[f.workspace]) {
      byWorkspace[f.workspace] = {
        total: 0,
        participating: 0,
        tags: { EMITTER: 0, MIND_CONSUMER: 0, PILLAR: 0, OBSERVED: 0, DEAD: 0 },
      };
    }
    const bucket = byWorkspace[f.workspace];
    bucket.total += 1;
    if (!f.tags.has('DEAD')) bucket.participating += 1;
    for (const tag of f.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      bucket.tags[tag] = (bucket.tags[tag] ?? 0) + 1;
    }
  }

  const total = files.length;
  const participating = total - tagCounts.DEAD;
  const pct = total > 0 ? (participating / total) * 100 : 0;

  return {
    total,
    participating,
    deadCount: tagCounts.DEAD,
    participatingPct: Number(pct.toFixed(2)),
    tagCounts,
    byWorkspace,
  };
}

/**
 * @param {ReturnType<typeof summarise>} summary
 */
function renderHuman(summary) {
  const lines = [];
  lines.push('KLOEL Cognitive Participation Scan');
  lines.push('==================================');
  lines.push(
    `Total scanned files: ${summary.total}  |  participating: ${summary.participating} (${summary.participatingPct}%)  |  dead: ${summary.deadCount}`,
  );
  lines.push('');
  lines.push('Tag breakdown (files may carry multiple tags):');
  for (const [tag, count] of Object.entries(summary.tagCounts)) {
    const pct = summary.total > 0 ? ((count / summary.total) * 100).toFixed(2) : '0.00';
    lines.push(`  ${tag.padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`);
  }
  lines.push('');
  lines.push('Per workspace:');
  for (const [name, bucket] of Object.entries(summary.byWorkspace)) {
    const pct = bucket.total > 0 ? ((bucket.participating / bucket.total) * 100).toFixed(2) : '0.00';
    lines.push(
      `  ${name.padEnd(10)} total=${String(bucket.total).padStart(5)}  participating=${String(bucket.participating).padStart(5)} (${pct}%)`,
    );
    for (const [tag, count] of Object.entries(bucket.tags)) {
      lines.push(`      ${tag.padEnd(14)} ${String(count).padStart(5)}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API (for the spec)
// ---------------------------------------------------------------------------

export function scan() {
  /** @type {ClassifiedFile[]} */
  const files = [];
  for (const ws of WORKSPACES) {
    const found = walk(ws.root, ws.exts);
    for (const f of found) {
      files.push(classify(f, ws.name));
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, summary: summarise(files) };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes('--json');
  const wantFiles = argv.includes('--files');

  const { files, summary } = scan();

  if (wantJson) {
    process.stdout.write(`${JSON.stringify({ summary, files: wantFiles ? files.map((f) => ({ path: f.path, workspace: f.workspace, tags: [...f.tags].sort() })) : undefined }, null, 2)}\n`);
    return;
  }

  process.stderr.write(`${renderHuman(summary)}\n`);

  if (wantFiles) {
    process.stderr.write('\nFiles (path :: tags):\n');
    for (const f of files) {
      process.stderr.write(`  ${f.path} :: ${[...f.tags].sort().join(',')}\n`);
    }
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cognitive-participation failed: ${message}\n`);
    process.exit(1);
  }
}
