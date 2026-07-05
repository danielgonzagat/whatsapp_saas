#!/usr/bin/env node
/**
 * Proof for dist-freshness.mjs: the staleness detector is honest.
 *   1. computeSourceHash is deterministic (same root -> same hash twice)
 *   2. a written manifest makes isDistFresh -> fresh (over a temp fixture root)
 *   3. mutating source after the manifest -> fresh=false (STALE detected)
 *   4. mutating dist after the manifest -> fresh=false (STALE detected)
 *   5. no manifest -> fresh=false (never green-by-absence)
 *   6. generated proof/smoke/self-expansion/cache fixtures do not affect source freshness
 *   7. .gitignore excludes the same generated runtime/proof artifact classes
 *   8. a process boot dist hash detects the already-running stale runtime case
 * Uses an isolated temp root so the real dist manifest is never touched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeSourceHash, computeDistHash, writeManifest, isDistFresh, readManifest, sourceFiles, distFiles } from '../dist-freshness.mjs';

const jsonMode = process.argv.includes('--json');
const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const REQUIRED_GENERATED_GITIGNORE_PATTERNS = Object.freeze([
  ".proof-*",
  ".smoke-*",
  ".self-expansion-*",
  ".security-mono-proof-*",
  ".atomic-exec-sandbox*/",
  ".external-runtime-denial-*/",
  ".positive-byte-sessions/",
  "atomic-exec-broker-file-*/",
  "atomic-edit-dist-*",
  "atomic-universal-*",
  ".property-proof-*",
  ".findings-*",
  ".findings-probe-*",
  "property-gate-*/",
  "probe-gate-*/",
  "atomic-type-gate-*/",
  "node-compile-cache/",
  ".mcp-cache/",
  ".turbo/",
  ".cache/",
  "build/",
]);

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-fresh-'));
  fs.mkdirSync(path.join(root, 'gates'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist', 'gates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'gates', 'b.ts'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, 'policy.mjs'), 'export const policy = true;\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(root, 'dist', 'server.js'), 'export const server = 1;\n');
  fs.writeFileSync(path.join(root, 'dist', 'gates', 'b.js'), 'export const b = 2;\n');
  return root;
}

// 1. deterministic and source surface includes non-TS authorial files.
{
  const root = makeRoot();
  try {
    const files = sourceFiles(root);
    rec(
      'computeSourceHash deterministic and covers authorial non-TS source',
      computeSourceHash(root) === computeSourceHash(root) && files.includes('policy.mjs') && files.includes('package.json') && !files.some((file) => file.startsWith('dist/')),
      { files },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 2. fresh after write
{
  const root = makeRoot();
  try {
    const manifest = writeManifest(root);
    const r = isDistFresh(root);
    rec('fresh after writeManifest includes sourceHash and distHash', r.fresh === true && manifest.sourceHash === r.sourceHash && manifest.distHash === r.distHash, { manifest, freshness: r, distFiles: distFiles(root) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 3. stale after source mutation
{
  const root = makeRoot();
  try {
    writeManifest(root);
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 999;\n');
    const r = isDistFresh(root);
    rec('STALE detected after source change', r.fresh === false && /source changed/i.test(r.reason), r);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 4. stale after dist mutation
{
  const root = makeRoot();
  try {
    writeManifest(root);
    fs.writeFileSync(path.join(root, 'dist', 'server.js'), 'export const server = 999;\n');
    const r = isDistFresh(root);
    rec('STALE detected after dist runtime change', r.fresh === false && /dist changed/i.test(r.reason), r);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 5. no manifest -> not fresh
{
  const root = makeRoot();
  try {
    rec('no manifest is not-fresh (never green-by-absence)', isDistFresh(root).fresh === false && readManifest(root) === null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 6. generated proof/smoke/self-expansion/cache fixtures are ignored
{
  const root = makeRoot();
  try {
    const beforeFiles = sourceFiles(root);
    writeManifest(root);
    fs.mkdirSync(path.join(root, '.proof-generated', 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, '.positive-byte-sessions', 'session'), { recursive: true });
    for (const dir of [
      ".mcp-cache",
      ".claude",
      ".turbo",
      ".cache",
      "build",
      "node-compile-cache",
      "atomic-exec-broker-file-123",
      ".atomic-exec-sandbox-123",
      ".external-runtime-denial-123",
      "atomic-edit-dist-123",
      "atomic-universal-123",
      ".property-proof-123",
      ".findings-123",
      ".findings-probe-123",
      "property-gate-123",
      "probe-gate-123",
      "atomic-type-gate-123",
      ".security-mono-proof-123",
    ]) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, 'temp.ts'), 'export const cacheTemp = 1;\n');
    }
    fs.writeFileSync(path.join(root, '.proof-generated', 'src', 'temp.ts'), 'export const proofTemp = 1;\n');
    fs.writeFileSync(path.join(root, '.positive-byte-sessions', 'session', 'temp.ts'), 'export const positiveTemp = 1;\n');
    fs.writeFileSync(path.join(root, '.smoke-anchor.123.ts'), 'export const smokeTemp = 1;\n');
    fs.writeFileSync(path.join(root, '.self-expansion-denied.123.ts'), 'export const expansionTemp = 1;\n');
    const files = sourceFiles(root);
    const leaked = files.filter((file) => /(^|\/)(\.proof-|\.smoke-|\.self-expansion-|\.security-mono-proof-|\.atomic-exec-sandbox|\.external-runtime-denial-|\.positive-byte-sessions|\.mcp-cache|\.claude|\.turbo|\.cache|build|node-compile-cache|atomic-exec-broker-file-|atomic-edit-dist-|atomic-universal-|\.property-proof-|\.findings-|\.findings-probe-|property-gate-|probe-gate-|atomic-type-gate-)(\/|$)/.test(file));
    const r = isDistFresh(root);
    rec(
      'generated proof/smoke/self-expansion/cache fixtures do not affect source freshness',
      r.fresh === true && JSON.stringify(files) === JSON.stringify(beforeFiles) && leaked.length === 0,
      { beforeFiles, files, leaked, freshness: r },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 7. git hygiene ignores the same generated runtime/proof artifact classes.
{
  const gitignoreText = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  const patterns = new Set(
    gitignoreText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const missing = REQUIRED_GENERATED_GITIGNORE_PATTERNS.filter((pattern) => !patterns.has(pattern));
  rec(
    "gitignore excludes generated runtime/proof artifacts that freshness excludes",
    missing.length === 0,
    { missing, required: REQUIRED_GENERATED_GITIGNORE_PATTERNS, patternCount: patterns.size },
  );
}
// 8. already-running process after rebuild: disk is fresh, boot hash is stale.
{
  const root = makeRoot();
  try {
    writeManifest(root);
    const bootDistHash = computeDistHash(root);
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1234;\n');
    fs.writeFileSync(path.join(root, 'dist', 'server.js'), 'export const server = 1234;\n');
    writeManifest(root);
    const currentDistHash = computeDistHash(root);
    const r = isDistFresh(root);
    rec(
      'boot dist hash detects already-running stale runtime after source+dist rebuild',
      r.fresh === true && bootDistHash !== currentDistHash,
      { bootDistHash, currentDistHash, freshness: r },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// 9. runtime Y certificate fingerprint ignores the same generated artifact classes.
{
  const ySource = fs.readFileSync(new URL("../server-tools-y.ts", import.meta.url), "utf8");
  const requiredRuntimeGeneratedSnippets = Object.freeze([
    "name.startsWith('.proof-')",
    "name.startsWith('.smoke-')",
    "name.startsWith('.self-expansion-')",
    "name.startsWith('.security-mono-proof-')",
    "name.startsWith('.atomic-exec-sandbox')",
    "name.startsWith('.external-runtime-denial-')",
    "name.startsWith('atomic-exec-broker-file-')",
    "name.startsWith('atomic-edit-dist-')",
    "name.startsWith('atomic-universal-')",
    "name.startsWith('.property-proof-')",
    "name.startsWith('.findings-')",
    "name.startsWith('.findings-probe-')",
    "name.startsWith('property-gate-')",
    "name.startsWith('probe-gate-')",
    "name.startsWith('atomic-type-gate-')",
    "name.startsWith('.supervisor-')",
  ]);
  const requiredRuntimeSkipDirs = Object.freeze([
    "'dist'",
    "'dist-lkg'",
    "'launcher-blessed'",
    "'node_modules'",
    "'.atomic'",
    "'.git'",
    "'node-compile-cache'",
    "'.claude'",
    "'.mcp-cache'",
    "'.turbo'",
    "'.cache'",
    "'build'",
    "'.positive-byte-sessions'",
  ]);
  const missingGenerated = requiredRuntimeGeneratedSnippets.filter((snippet) => !ySource.includes(snippet));
  const missingSkipDirs = requiredRuntimeSkipDirs.filter((snippet) => !ySource.includes(snippet));
  rec(
    "Y runtime fingerprint excludes generated artifacts that freshness excludes",
    missingGenerated.length === 0 && missingSkipDirs.length === 0,
    { missingGenerated, missingSkipDirs },
  );
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
