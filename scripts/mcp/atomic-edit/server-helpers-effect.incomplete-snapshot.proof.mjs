/**
 * Proof that bounded effect snapshots cannot be used as if they were complete.
 *
 * A cap-limited snapshot is UNJUDGED coverage, not a green receipt. The effect
 * substrate must refuse diff/rollback claims derived from it rather than
 * returning an empty or partial file-set that could look like byte-exact proof.
 *
 * Run: node scripts/mcp/atomic-edit/server-helpers-effect.incomplete-snapshot.proof.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
} from './dist/server-helpers-effect.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '.atomic-effect-incomplete-snapshot-proof-sandbox');

function freshSandbox() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
}

function write(rel, content) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ok: ${msg}`);
}

function assertThrows(fn, pattern, msg) {
  try {
    fn();
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    assert(pattern.test(text), `${msg} (message: ${text})`);
    return;
  }
  console.error(`FAIL: ${msg} (did not throw)`);
  process.exit(1);
}

try {
  freshSandbox();
  write('a.txt', 'A original\n');
  write('b.txt', 'B original\n');
  write('c.txt', 'C original\n');

  const snap = captureEffectSnapshot(ROOT, { maxFiles: 1 });
  assert(snap.limitReached === true, 'snapshot records the maxFiles cap as incomplete coverage');

  const uncaptured = ['a.txt', 'b.txt', 'c.txt'].find((rel) => !snap.files.has(rel));
  assert(Boolean(uncaptured), 'test has an existing file outside the captured subset');

  write(uncaptured, 'mutated outside captured subset\n');

  assertThrows(
    () => diffEffect(snap),
    /incomplete|limit/i,
    'diffEffect refuses to produce a partial receipt from an incomplete snapshot',
  );

  assertThrows(
    () =>
      rollbackEffect(snap, [
        { file: uncaptured, change: 'modified', bytesBefore: 0, bytesAfter: 0 },
      ]),
    /incomplete|limit/i,
    'rollbackEffect refuses to claim rollback from an incomplete snapshot',
  );

  assert(read(uncaptured) === 'mutated outside captured subset\n', 'refused rollback leaves live bytes untouched');

  freshSandbox();
  for (let i = 0; i < 4105; i += 1) {
    write(`bulk/file-${String(i).padStart(4, '0')}.txt`, 'bulk\n');
  }
  const wideSnap = captureEffectSnapshot(ROOT, { maxFiles: 5000 });
  assert(wideSnap.limitReached === false, 'custom maxFiles cap can produce a complete large snapshot above default cap');
  write('bulk/new-file.txt', 'new bytes after snapshot\n');
  const wideEffects = diffEffect(wideSnap);
  assert(
    wideEffects.some((effect) => effect.file === 'bulk/new-file.txt' && effect.change === 'created'),
    'diffEffect carries the original snapshot limits into the after snapshot',
  );

  fs.rmSync(ROOT, { recursive: true, force: true });
} catch (e) {
  console.error('PROOF THREW:', e && e.stack ? e.stack : e);
  fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(1);
}

console.log('\nserver-helpers-effect.incomplete-snapshot.proof: PASS');
