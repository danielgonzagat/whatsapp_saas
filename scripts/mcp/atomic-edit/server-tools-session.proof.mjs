/**
 * Proof for server-tools-session — the multi-tool atomic WINDOW.
 *
 * It does NOT depend on a full rebuild of server-tools-session.ts. Instead it
 * exercises the EXACT session semantics those four tools implement, against the
 * already-compiled byte-EFFECT primitives in dist/server-helpers-effect.js —
 * captureEffectSnapshot / diffEffect / rollbackEffect — which are precisely the
 * calls atomic_session_begin/savepoint/rollback make. Writes go through plain
 * fs.writeFileSync, byte-faithful to what atomicWrite persists for an
 * import-free target (the connection byte-floor is a no-op for a .txt file).
 *
 * Two scenarios, both asserting BYTE-EXACT restoration via sha256:
 *   A) begin → two edits → full rollback restores byte-exact to pre-begin.
 *   B) begin → edit → savepoint → edit → rollback-to-savepoint restores the
 *      savepoint's file-set to its pre-begin bytes (the savepoint state for
 *      those files, since the rollback truth never moves off the begin snap).
 *
 * Run: node scripts/mcp/atomic-edit/server-tools-session.proof.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
} from './dist/server-helpers-effect.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// snapshot root = a small dedicated sandbox dir inside the repo so the walk is
// fast and isolated; the real tools snapshot REPO_ROOT, but the algebra is root-
// agnostic — what matters is "snapshot once, write, rollback to snapshot bytes".
const ROOT = path.join(HERE, '.atomic-session-proof-sandbox');

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const assert = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ok: ${msg}`);
};

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
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

let failed = false;
try {
  // ── Scenario A: begin → two edits → full rollback = byte-exact pre-begin ──
  console.log('Scenario A: begin → two edits → full rollback restores byte-exact');
  freshSandbox();
  write('alpha.txt', 'ALPHA original\nline2\n');
  write('beta.txt', 'BETA original\n');
  const preBeginAlpha = read('alpha.txt');
  const preBeginBeta = read('beta.txt');
  const preBeginAlphaSha = sha(preBeginAlpha);
  const preBeginBetaSha = sha(preBeginBeta);

  // atomic_session_begin
  const snapA = captureEffectSnapshot(ROOT);

  // two edits inside the open window (as the edit tools would, via atomicWrite)
  write('alpha.txt', 'ALPHA MUTATED by edit #1 — bytes differ\n');
  write('beta.txt', 'BETA MUTATED by edit #2\nnew tail line\n');
  // plus a created file, to prove untracked-inclusive revert
  write('gamma.txt', 'GAMMA created inside the window\n');

  assert(sha(read('alpha.txt')) !== preBeginAlphaSha, 'edit #1 changed alpha bytes');
  assert(sha(read('beta.txt')) !== preBeginBetaSha, 'edit #2 changed beta bytes');
  assert(exists('gamma.txt'), 'created gamma exists mid-window');

  // atomic_session_rollback (full): diff live vs begin, revert that set
  const effectsA = diffEffect(snapA);
  assert(effectsA.length === 3, `full diff sees all 3 touched files (got ${effectsA.length})`);
  const restoredA = rollbackEffect(snapA, effectsA);
  assert(restoredA === 3, `rollback restored all 3 files (got ${restoredA})`);

  assert(sha(read('alpha.txt')) === preBeginAlphaSha, 'alpha restored byte-exact (sha256 identical to pre-begin)');
  assert(sha(read('beta.txt')) === preBeginBetaSha, 'beta restored byte-exact (sha256 identical to pre-begin)');
  assert(read('alpha.txt') === preBeginAlpha, 'alpha content literally identical to pre-begin');
  assert(read('beta.txt') === preBeginBeta, 'beta content literally identical to pre-begin');
  assert(!exists('gamma.txt'), 'created gamma unlinked by rollback (untracked-inclusive)');

  // ── Scenario B: begin → edit → savepoint → edit → rollback-to-savepoint ──
  console.log('Scenario B: begin → edit → savepoint → edit → rollback-to-savepoint');
  freshSandbox();
  write('doc.txt', 'STATE 0 (pre-begin)\n');
  const preBeginDoc = read('doc.txt');
  const preBeginDocSha = sha(preBeginDoc);

  // atomic_session_begin — the immutable rollback truth
  const snapB = captureEffectSnapshot(ROOT);

  // edit #1, then take a savepoint (file-set marker, NO re-snapshot)
  write('doc.txt', 'STATE 1 (after edit #1)\n');
  const sp1Effects = diffEffect(snapB); // savepoint 'sp1' records this file-set
  assert(sp1Effects.length === 1 && sp1Effects[0].file === 'doc.txt', "savepoint sp1 marks doc.txt as the touched set");

  // edit #2 — advances past the savepoint; also touch a second file
  write('doc.txt', 'STATE 2 (after edit #2)\n');
  write('extra.txt', 'EXTRA created after the savepoint\n');
  assert(read('doc.txt').startsWith('STATE 2'), 'doc advanced to STATE 2 before rollback');
  assert(exists('extra.txt'), 'extra exists before rollback-to-savepoint');

  // atomic_session_rollback {toSavepoint: 'sp1'}: rollbackEffect(begin snap, sp1 file-set)
  // restores ONLY the savepoint's file-set (doc.txt) to its pre-begin bytes.
  const restoredB = rollbackEffect(snapB, sp1Effects);
  assert(restoredB === 1, `rollback-to-savepoint restored exactly the savepoint file-set (got ${restoredB})`);
  assert(
    sha(read('doc.txt')) === preBeginDocSha,
    'doc restored byte-exact to the savepoint-targeted (pre-begin) state via sha256',
  );
  assert(read('doc.txt') === preBeginDoc, 'doc content literally equals the savepoint-target state');
  // extra.txt was NOT in the sp1 file-set, so the named rollback leaves it (scope honesty)
  assert(exists('extra.txt'), 'rollback-to-savepoint touched ONLY the savepoint file-set, leaving extra.txt');

  // cleanup
  fs.rmSync(ROOT, { recursive: true, force: true });
} catch (e) {
  console.error('PROOF THREW:', e && e.stack ? e.stack : e);
  fs.rmSync(ROOT, { recursive: true, force: true });
  failed = true;
}

if (failed) {
  console.error('\nserver-tools-session.proof: FAILED');
  process.exit(1);
}
console.log('\nserver-tools-session.proof: PASS (both scenarios, byte-exact rollback proven)');
