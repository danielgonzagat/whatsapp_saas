#!/usr/bin/env node
/**
 * server-helpers-io.byte-floor.proof.mjs — standalone node proof that the FULL-GATE
 * BYTE FLOOR in atomicWrite() is INESCAPABLE: a write that does not converge green is
 * refused AT the byte floor (in atomicWrite itself), not only later in atomic_converge.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/server-helpers-io.byte-floor.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED module from dist/, so it runs anywhere the
 * server runs.) It exercises the REAL atomicWrite — the same function every tool
 * (atomic_edit, atomic_rename_symbol, …) reaches disk through. Because atomicWrite
 * computes relPath against the real REPO_ROOT and type-soundness walks up for a
 * tsconfig, the throwaway project is created UNDER the repo root with its own tsconfig,
 * then removed. No tracked repo source is ever written.
 *
 * Proves the four properties the F1 byte-floor contract demands:
 *   (1) RED at the floor      — a write introducing a NEW unresolved reference / dead wire
 *                               is THROWN by atomicWrite itself (type-soundness rung), and
 *                               a dangling relative import is THROWN (connection rung).
 *   (2) GREEN                  — a valid, type-sound write passes and lands on disk.
 *   (3) MULTI-FILE not false-reddened — with a pending A→B set registered, the per-file
 *                               type-soundness rung is deferred (sibling-blind) so the set
 *                               is not reddened mid-write.
 *   (4) UNJUDGED blocks        — a write with no resolvable tsconfig leaves type-soundness
 *                               unjudged, which is not green approval, so the byte is refused.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, 'dist');
const io = await import(path.join(distDir, 'server-helpers-io.js'));
const conn = await import(path.join(distDir, 'connection-gate.js'));
const { atomicWrite } = io;
const { registerPendingWrites, clearPendingWrites } = conn;

// REPO_ROOT the compiled module uses: walk up from dist looking for .git, mirroring guard.
function findRepoRoot(start) {
  let d = start;
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return start;
    d = up;
  }
}
const REPO_ROOT = findRepoRoot(dir);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log('  PASS ', name);
  } else {
    fail += 1;
    console.log('  FAIL ', name);
  }
}
function threw(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// A throwaway project UNDER the repo root (so relPath + nearestTsconfig resolve), with a
// tsconfig that type-soundness can find, and a valid prior a.ts already on disk.
const proj = fs.mkdtempSync(path.join(REPO_ROOT, '.atomic-byte-floor-proof-'));
try {
  fs.writeFileSync(
    path.join(proj, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true } }),
  );
  const aAbs = path.join(proj, 'a.ts');
  fs.writeFileSync(aAbs, 'export const x: number = 1;\n'); // valid prior on disk

  // (1a) RED — a write introducing a NEW type error / unresolved reference is THROWN
  //      by atomicWrite itself (type-soundness rung). nope() is an undeclared name →
  //      TS2304 (unresolved reference: the dead-wire fact in type space).
  {
    const msg = threw(() => atomicWrite(aAbs, 'export const x: number = nope();\n'));
    check('(1a) RED at floor: NEW unresolved reference is THROWN by atomicWrite', !!msg && /type-soundness/.test(msg));
    // The disk file is unchanged — the red write never landed.
    check('(1a) refused write did NOT touch disk', fs.readFileSync(aAbs, 'utf8') === 'export const x: number = 1;\n');
  }

  // (1b) RED — a dangling RELATIVE import is THROWN at the floor (connection rung of the
  //      same full floor). ./ghost resolves to nothing.
  {
    const msg = threw(() => atomicWrite(aAbs, "import { z } from './ghost';\nexport const x = z;\n"));
    check('(1b) RED at floor: dangling relative import is THROWN by atomicWrite', !!msg && /convergence/.test(msg));
    check('(1b) refused write did NOT touch disk', fs.readFileSync(aAbs, 'utf8') === 'export const x: number = 1;\n');
  }

  // (2) GREEN — a valid, type-sound write passes and lands.
  {
    const msg = threw(() => atomicWrite(aAbs, 'export const x: number = 42;\n'));
    check('(2) GREEN: valid type-sound write passes (no throw)', msg === null);
    check('(2) GREEN: the bytes actually landed on disk', fs.readFileSync(aAbs, 'utf8') === 'export const x: number = 42;\n');
    fs.writeFileSync(aAbs, 'export const x: number = 1;\n'); // restore prior for later cases
  }

  // (3) MULTI-FILE not false-reddened — register a 2-file pending set (A→B). With the set
  //     in flight, the sibling-blind per-file type-soundness rung is DEFERRED, so a write of
  //     A that would otherwise look type-broken in isolation is not reddened mid-set.
  {
    const bAbs = path.join(proj, 'b.ts');
    registerPendingWrites([aAbs, bAbs]); // pendingWriteCount() === 2 → multi-file in flight
    try {
      // A candidate that, judged ALONE, has a NEW type error — but because a multi-file set
      // is in flight, type-soundness is deferred to convergeStatic (which sees the overlay).
      // The byte floor must NOT throw on the type-soundness rung here.
      const msg = threw(() => atomicWrite(aAbs, 'export const x: number = nope();\n'));
      check('(3) MULTI-FILE: type-soundness deferred mid-set → not false-reddened', msg === null);
    } finally {
      clearPendingWrites();
    }
    fs.writeFileSync(aAbs, 'export const x: number = 1;\n'); // restore
  }

  // (4) GREEN new-file materialization — a valid, type-sound new file in a missing
  //     subdirectory is admitted and atomicWrite creates the parent directory inside
  //     the Atomic materializer after all gates pass.
  {
    const nestedAbs = path.join(proj, 'nested', 'deep', 'new.ts');
    const msg = threw(() => atomicWrite(nestedAbs, 'export const nested: number = 7;\n'));
    check('(4) GREEN: valid new file in missing subdirectory passes', msg === null);
    check('(4) GREEN: atomicWrite created the parent directory and wrote bytes', fs.readFileSync(nestedAbs, 'utf8') === 'export const nested: number = 7;\n');
  }

  // (5) UNJUDGED blocks — write a file in a dir with NO resolvable tsconfig up to
  //     REPO_ROOT-relative path: type-soundness bails unjudged. Under Y, an honest
  //     cannot-decide is not green approval, so the byte is refused before disk.
  {
    fs.rmSync(path.join(proj, 'tsconfig.json'));
    const cAbs = path.join(proj, 'c.ts');
    // c.ts has no relative imports (connection green), no bare deps (supply-chain green); the
    // only applicable rung is type-soundness, which is now unjudged (no tsconfig) and must block.
    const msg = threw(() => atomicWrite(cAbs, 'export const y: number = nope();\n'));
    check('(5) UNJUDGED at floor: no-tsconfig write is refused before disk', !!msg && /UNJUDGED|unjudged/.test(msg) && !fs.existsSync(cAbs));
  }
} finally {
  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
