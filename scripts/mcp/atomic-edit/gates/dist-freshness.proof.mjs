#!/usr/bin/env node
/**
 * Proof for dist-freshness.mjs: the staleness detector is honest.
 *   1. computeSourceHash is deterministic (same root -> same hash twice)
 *   2. a written manifest makes isDistFresh -> fresh (over a temp fixture root)
 *   3. mutating a source file after the manifest -> fresh=false (STALE detected)
 *   4. no manifest -> fresh=false (never green-by-absence)
 * Uses an isolated temp root so the real dist manifest is never touched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSourceHash, writeManifest, isDistFresh, readManifest } from '../dist-freshness.mjs';

const jsonMode = process.argv.includes('--json');
const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-fresh-'));
  fs.mkdirSync(path.join(root, 'gates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'gates', 'b.ts'), 'export const b = 2;\n');
  return root;
}

// 1. deterministic
{
  const root = makeRoot();
  try {
    rec('computeSourceHash deterministic', computeSourceHash(root) === computeSourceHash(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 2. fresh after write
{
  const root = makeRoot();
  try {
    writeManifest(root);
    const r = isDistFresh(root);
    rec('fresh after writeManifest', r.fresh === true, r);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 3. stale after source mutation
{
  const root = makeRoot();
  try {
    writeManifest(root);
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 999;\n'); // mutate source
    const r = isDistFresh(root);
    rec('STALE detected after source change', r.fresh === false && /STALE/i.test(r.reason), r);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
// 4. no manifest -> not fresh
{
  const root = makeRoot();
  try {
    rec('no manifest is not-fresh (never green-by-absence)', isDistFresh(root).fresh === false && readManifest(root) === null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
