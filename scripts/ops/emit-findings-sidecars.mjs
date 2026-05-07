#!/usr/bin/env node
/**
 * Emit Findings Sidecars — reads FINDINGS_AGGREGATE.json and writes a
 * `<source-path>.findings.json` SIBLING file inside the Obsidian vault's
 * `_source/` mirror tree, alongside each `<source-path>.md` mirror node.
 *
 * Why sidecars (not modifying the .md mirror nodes directly):
 *   The mirror daemon and its `.md` outputs are constitution-locked. We must
 *   not edit them. Sidecars are non-locked write-only artifacts the mirror
 *   daemon ignores. A future Obsidian plugin reads these to render
 *   per-finding badges/dots on graph nodes.
 *
 * Lifecycle:
 *   - For every file in the aggregate, write/update its sidecar.
 *   - For every existing sidecar whose source no longer has findings, delete it.
 *   - Atomic-ish: write to <path>.findings.json.tmp then rename.
 *
 * NOT constitution-locked.
 *
 * Usage:
 *   node scripts/ops/emit-findings-sidecars.mjs           # default mirror root
 *   node scripts/ops/emit-findings-sidecars.mjs --dry     # don't write
 *   KLOEL_MIRROR_ROOT=... node ... emit-findings-sidecars.mjs
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AGGREGATE_PATH = resolve(REPO_ROOT, 'FINDINGS_AGGREGATE.json');

const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

function parseArgs() {
  const args = process.argv.slice(2);
  return { dry: args.includes('--dry') };
}

function readAggregate() {
  if (!existsSync(AGGREGATE_PATH)) {
    console.error('emit-sidecars: FINDINGS_AGGREGATE.json missing — run aggregate-findings first');
    process.exit(2);
  }
  return JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8'));
}

function sidecarPathFor(repoRelativeFile) {
  // mirror layout: REPO_ROOT/foo/bar.ts → MIRROR_ROOT/_source/foo/bar.ts.findings.json
  // (parallel to bar.ts.md which the daemon writes)
  const rel = repoRelativeFile.replace(/\\/g, '/'); // defensive
  return join(SOURCE_MIRROR_DIR, rel + '.findings.json');
}

function buildSidecar(fileEntry, generatedAt) {
  return {
    schema: 'kloel.findings.v1',
    file: fileEntry.file,
    generatedAt,
    count: fileEntry.count,
    dominantSeverity: fileEntry.dominantSeverity,
    severityCounts: fileEntry.severityCounts,
    categories: fileEntry.categories,
    findings: fileEntry.findings.map((f) => ({
      line: f.line,
      column: f.column,
      category: f.category,
      severity: f.severity,
      engine: f.engine,
      rule: f.rule,
      message: f.message,
      fingerprint: f.fingerprint,
    })),
  };
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function findExistingSidecars(root) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith('.findings.json')) {
        out.push(p);
      }
    }
  }
  return out;
}

function main() {
  const { dry } = parseArgs();
  const agg = readAggregate();

  process.stderr.write(`emit-sidecars: source mirror dir = ${SOURCE_MIRROR_DIR}\n`);
  if (!existsSync(SOURCE_MIRROR_DIR)) {
    console.error(
      `emit-sidecars: ${SOURCE_MIRROR_DIR} does not exist — make sure the mirror daemon has run at least once`,
    );
    process.exit(2);
  }

  const wanted = new Map(); // sidecar path → buffer
  for (const fe of agg.files) {
    const sc = buildSidecar(fe, agg.generatedAt);
    const path = sidecarPathFor(fe.file);
    wanted.set(path, JSON.stringify(sc, null, 2));
  }

  // Discover stale sidecars
  const existing = findExistingSidecars(SOURCE_MIRROR_DIR);
  const stale = existing.filter((p) => !wanted.has(p));

  let written = 0;
  let skippedUnchanged = 0;
  for (const [path, content] of wanted) {
    if (existsSync(path)) {
      try {
        const cur = readFileSync(path, 'utf8');
        if (cur === content) {
          skippedUnchanged++;
          continue;
        }
      } catch {
        /* fall through to write */
      }
    }
    if (dry) continue;
    writeAtomic(path, content);
    written++;
  }

  let removed = 0;
  for (const p of stale) {
    if (dry) continue;
    try {
      unlinkSync(p);
      removed++;
    } catch (e) {
      process.stderr.write(`  ! failed to remove stale sidecar ${p}: ${e.message}\n`);
    }
  }

  const summary = {
    ok: true,
    dry,
    sourceMirrorDir: SOURCE_MIRROR_DIR,
    aggregate: AGGREGATE_PATH,
    counts: {
      filesInAggregate: agg.files.length,
      sidecarsWritten: written,
      sidecarsUnchanged: skippedUnchanged,
      sidecarsRemoved: removed,
      staleSidecarsBefore: stale.length,
    },
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
