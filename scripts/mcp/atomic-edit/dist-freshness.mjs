#!/usr/bin/env node
/**
 * dist-freshness.mjs - honest staleness detector for the compiled engine.
 *
 * TRUST HOLES THIS CLOSES:
 *   1. dist on disk can be stale relative to the authorial engine source.
 *   2. dist on disk can change after an MCP process already loaded old JS.
 *
 * The first hole is covered by the build manifest: build.mjs records a sha256
 * over the Atomic authorial source surface and a sha256 over the compiled dist
 * runtime surface. The second hole is consumed by server-tools-y.ts: the running
 * process captures its boot fingerprint and refuses Y when the live disk
 * fingerprint no longer matches that boot fingerprint.
 *
 *   - sourceFiles(root): all authorial engine files (.ts/.mjs/.json/.sh),
 *     excluding generated/runtime dirs such as dist, node_modules, .atomic.
 *   - distFiles(root): compiled runtime files under dist, excluding the manifest.
 *   - computeSourceHash(root): deterministic source sha256.
 *   - computeDistHash(root): deterministic compiled-runtime sha256.
 *   - writeManifest(root): persist dist/.build-manifest.json after build.
 *   - isDistFresh(root): fresh=true iff source hash and dist hash match manifest.
 *
 * CLI: `node dist-freshness.mjs --write`  -> emit the manifest (called by build.mjs)
 *      `node dist-freshness.mjs --check`  -> print {fresh,...} JSON, exit 0/1
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_EXTENSIONS = new Set(['.ts', '.mjs', '.json', '.sh']);
const DIST_EXTENSIONS = new Set(['.js', '.mjs', '.json']);
const SKIP_DIRS = new Set([
  'dist',
  'dist-lkg',
  'dist.broken-last',
  'launcher-blessed',
  'node_modules',
  '.atomic',
  '.git',
  'node-compile-cache',
  '.claude',
  '.mcp-cache',
  '.turbo',
  '.cache',
  'build',
  '.positive-byte-sessions',
]);

function skipGeneratedName(name) {
  return (
    name.startsWith('.proof-') ||
    name.startsWith('.smoke-') ||
    name.startsWith('.self-expansion-') ||
    name.startsWith('.security-mono-proof-') ||
    name.startsWith('.atomic-exec-sandbox') ||
    name.startsWith('atomic-exec-broker-file-') ||
    name.startsWith('atomic-edit-dist-') ||
    name.startsWith('atomic-universal-') ||
    name.startsWith('.property-proof-') ||
    name.startsWith('.findings-') ||
    name.startsWith('.findings-probe-') ||
    name.startsWith('property-gate-') ||
    name.startsWith('probe-gate-') ||
    name.startsWith('atomic-type-gate-') ||
    name.startsWith('.external-runtime-denial-') ||
    name.startsWith('.supervisor-') ||
    name === '.build-manifest.json'
  );
}

function walkFiles(root, start, includeFile) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skipGeneratedName(e.name)) continue;
      const full = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
      } else if (e.isFile() && includeFile(e.name)) {
        out.push(path.relative(root, full));
      }
    }
  };
  walk(start);
  return out.sort();
}

/** Every authorial engine file under root, repo-relative-to-root, sorted. */
export function sourceFiles(root = HERE) {
  return walkFiles(root, root, (name) => SOURCE_EXTENSIONS.has(path.extname(name)));
}

/** Every compiled runtime file under root/dist, root-relative, sorted. */
export function distFiles(root = HERE) {
  return walkFiles(root, path.join(root, 'dist'), (name) => DIST_EXTENSIONS.has(path.extname(name)));
}

function computeHash(root, files) {
  const h = crypto.createHash('sha256');
  for (const rel of files) {
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

/** Deterministic sha256 over all authorial engine source files (path + bytes). */
export function computeSourceHash(root = HERE) {
  return computeHash(root, sourceFiles(root));
}

/** Deterministic sha256 over all compiled dist runtime files (path + bytes). */
export function computeDistHash(root = HERE) {
  return computeHash(root, distFiles(root));
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
  const distHash = computeDistHash(root);
  const manifest = {
    sourceHash,
    distHash,
    sourceFileCount: sourceFiles(root).length,
    distFileCount: distFiles(root).length,
    version: 2,
  };
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function isDistFresh(root = HERE) {
  const manifest = readManifest(root);
  const sourceHash = computeSourceHash(root);
  const distHash = computeDistHash(root);
  if (!manifest) {
    return { fresh: false, reason: 'no build manifest (dist never built with manifest support)', sourceHash, manifestHash: null, distHash, manifestDistHash: null };
  }
  if (manifest.sourceHash !== sourceHash) {
    return { fresh: false, reason: 'source changed since last build (dist is STALE)', sourceHash, manifestHash: manifest.sourceHash, distHash, manifestDistHash: manifest.distHash ?? null };
  }
  if (typeof manifest.distHash !== 'string') {
    return { fresh: false, reason: 'build manifest lacks distHash (runtime freshness is UNJUDGED)', sourceHash, manifestHash: manifest.sourceHash, distHash, manifestDistHash: null };
  }
  if (manifest.distHash !== distHash) {
    return { fresh: false, reason: 'dist changed since last manifest write (runtime on disk is STALE)', sourceHash, manifestHash: manifest.sourceHash, distHash, manifestDistHash: manifest.distHash };
  }
  return { fresh: true, reason: 'dist and source match build manifest', sourceHash, manifestHash: manifest.sourceHash, distHash, manifestDistHash: manifest.distHash };
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
