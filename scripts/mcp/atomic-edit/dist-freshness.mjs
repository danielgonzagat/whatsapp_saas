#!/usr/bin/env node
/**
 * dist-freshness.mjs — honest staleness detector for the compiled engine.
 *
 * THE TRUST HOLE THIS CLOSES: the MCP server loads dist/ at startup. After an
 * atomic_expand_self rebuild, the SOURCE + dist on disk are current, but the
 * already-running server process still executes the OLD dist — so a tool it
 * exposes (e.g. atomic_y_certificate) can report GREEN from STALE code. This
 * module lets any reader detect that: it hashes ALL engine .ts source and
 * compares to the hash recorded in dist/.build-manifest.json at build time.
 *
 *   - computeSourceHash(root): sha256 over every .ts under root (sorted, with
 *     path+bytes), excluding dist/ and node_modules/. Deterministic.
 *   - readManifest(root): the {sourceHash, builtAt, fileCount} dist recorded, or null.
 *   - isDistFresh(root): { fresh, reason, sourceHash, manifestHash } — fresh=true
 *     iff a manifest exists AND its sourceHash equals the live source hash.
 *   - writeManifest(root): compute + persist dist/.build-manifest.json (build step).
 *
 * CLI: `node dist-freshness.mjs --write`  -> emit the manifest (called by build.mjs)
 *      `node dist-freshness.mjs --check`  -> print {fresh,...} JSON, exit 0/1
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['dist', 'node_modules', '.atomic', '.git']);

/** Every .ts file under root (recursive), repo-relative-to-root, sorted. */
export function sourceFiles(root = HERE) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.security-mono-proof-') || e.name.startsWith('.atomic-exec-sandbox')) continue;
      const full = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
      } else if (e.isFile() && e.name.endsWith('.ts')) {
        out.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** Deterministic sha256 over all source .ts (path + bytes). */
export function computeSourceHash(root = HERE) {
  const h = crypto.createHash('sha256');
  for (const rel of sourceFiles(root)) {
    h.update(rel);
    h.update('\0');
    try {
      h.update(fs.readFileSync(path.join(root, rel)));
    } catch {
      h.update('<unreadable>');
    }
    h.update('\0');
  }
  return h.digest('hex');
}

const MANIFEST_REL = path.join('dist', '.build-manifest.json');

export function readManifest(root = HERE) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, MANIFEST_REL), 'utf8'));
  } catch {
    return null;
  }
}

export function writeManifest(root = HERE) {
  const sourceHash = computeSourceHash(root);
  const manifest = { sourceHash, fileCount: sourceFiles(root).length, version: 1 };
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function isDistFresh(root = HERE) {
  const manifest = readManifest(root);
  const sourceHash = computeSourceHash(root);
  if (!manifest) return { fresh: false, reason: 'no build manifest (dist never built with manifest support)', sourceHash, manifestHash: null };
  if (manifest.sourceHash !== sourceHash)
    return { fresh: false, reason: 'source changed since last build (dist is STALE)', sourceHash, manifestHash: manifest.sourceHash };
  return { fresh: true, reason: 'dist matches current source', sourceHash, manifestHash: manifest.sourceHash };
}

if (process.argv.includes('--write')) {
  const m = writeManifest();
  process.stdout.write(JSON.stringify({ ok: true, ...m }) + '\n');
  process.exit(0);
}
if (process.argv.includes('--check')) {
  const r = isDistFresh();
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r.fresh ? 0 : 1);
}
