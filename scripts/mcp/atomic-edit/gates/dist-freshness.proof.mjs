#!/usr/bin/env node
/**
 * Proof for dist-freshness.mjs: the staleness detector is honest.
 *   1. computeSourceHash is deterministic (same root -> same hash twice)
 *   2. a written manifest makes isDistFresh -> fresh (over a temp fixture root)
 *   3. mutating source after the manifest -> fresh=false (STALE detected)
 *   4. mutating dist after the manifest -> fresh=false (STALE detected)
 *   5. no manifest -> fresh=false (never green-by-absence)
 *   6. generated .proof-* fixture dirs do not affect source freshness
 *   7. a process boot dist hash detects the already-running stale runtime case
 * Uses an isolated temp root so the real dist manifest is never touched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeSourceHash, computeDistHash, writeManifest, isDistFresh, readManifest, sourceFiles, distFiles } from '../dist-freshness.mjs';

const jsonMode = process.argv.includes('--json');
const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

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
// 6. generated proof fixture dirs are ignored
{
  const root = makeRoot();
  try {
    writeManifest(root);
    fs.mkdirSync(path.join(root, '.proof-generated', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, '.proof-generated', 'src', 'temp.ts'), 'export const temp = 1;\n');
    const files = sourceFiles(root);
    const r = isDistFresh(root);
    rec('generated .proof-* fixture dirs do not affect source freshness', r.fresh === true && !files.some((file) => file.includes('.proof-generated')), { files, freshness: r });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 7. already-running process after rebuild: disk is fresh, boot hash is stale.
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

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
