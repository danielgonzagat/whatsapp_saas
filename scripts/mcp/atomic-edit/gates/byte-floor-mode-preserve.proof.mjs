#!/usr/bin/env node
/**
 * PROOF — byte-floor mode preservation (server-helpers-io.ts:atomicWrite).
 *
 * The temp-file + rename atomic-write idiom replaces the inode, so without
 * capturing the original mode an existing 0755 file silently drops to the
 * umask default (0644) on the next edit. This proof drives the REAL compiled
 * atomicWrite over real on-disk fixtures and asserts the permission bits
 * survive the write. Fixtures use a .txt extension so the TS convergence gates
 * (which self-select by extension) don't intercept — the mode-capture code
 * path is extension-agnostic, so .txt faithfully exercises the primitive.
 *
 * Falsifiable: revert the statSync capture in atomicWrite and this exits 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../dist/server-helpers-io.js';

const jsonMode = process.argv.includes('--json');
const gatesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gatesDir, '../../../..');
const stamp = `${process.pid}-${Date.now()}`;

let failures = 0;
const results = [];
const expect = (cond, name) => {
  results.push({ name, ok: !!cond });
  if (!cond) failures++;
};
const modeOf = (file) => fs.statSync(file).mode & 0o777;

const made = [];
const tmpPath = (suffix) => {
  const p = path.join(repoRoot, `.byte-floor-mode-proof-${stamp}-${suffix}.txt`);
  made.push(p);
  return p;
};

try {
  // 1) existing 0755 file keeps 0755 across an atomic edit
  const a = tmpPath('exec');
  fs.writeFileSync(a, 'before\n');
  fs.chmodSync(a, 0o755);
  atomicWrite(a, 'after\n');
  expect(fs.readFileSync(a, 'utf8') === 'after\n', 'content updated');
  expect(modeOf(a) === 0o755, `0755 preserved (got 0${modeOf(a).toString(8)})`);

  // 2) a tighter 0600 file keeps 0600 (not widened to umask)
  const b = tmpPath('private');
  fs.writeFileSync(b, 'x\n');
  fs.chmodSync(b, 0o600);
  atomicWrite(b, 'y\n');
  expect(modeOf(b) === 0o600, `0600 preserved (got 0${modeOf(b).toString(8)})`);

  // 3) a brand-new file is created without a prior-mode crash
  const c = tmpPath('fresh');
  try { fs.unlinkSync(c); } catch { /* not present */ }
  atomicWrite(c, 'new\n');
  expect(fs.existsSync(c), 'new file created (no prior-mode crash)');
} catch (error) {
  expect(false, `threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const p of made) { try { fs.unlinkSync(p); } catch { /* best-effort */ } }
}

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'byte-floor-mode-preserve', ok: failures === 0, results }));
} else {
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
