#!/usr/bin/env node
/**
 * proof-chain.proof.mjs — standalone node proof for the PROOF-CHAINED MUTATION LEDGER.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/proof-chain.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED trace module from dist/, so it runs
 * anywhere the server runs.) Every case is a throwaway temp repoRoot: buildTrace
 * is given an absolute `repoRoot`, so writeTrace persists traces + advances
 * `.atomic/HEAD` ENTIRELY inside the temp dir — no repo state is ever touched.
 *
 * It proves the two ledger invariants the doctrine demands:
 *
 *   CHAIN     — two sequential writeTrace calls link: the child's parentSha256
 *               equals the parent's chainHash (the head advanced to it), and the
 *               head marker file holds the latest chainHash.
 *   TAMPER    — recomputing chainHash over a TAMPERED gateVerdict no longer equals
 *               the child's stored parent pointer: any edit to the admitting verdict
 *               (or the after-content, or the parent) breaks the link, tamper-evident.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const trace = await import(path.join(dir, 'dist', 'trace.js'));
const { buildTrace, writeTrace, chainHashOf, canonicalJSON } = trace;

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

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-proof-chain-'));
}

const verdict = (ran) => ({ green: true, reds: [], unjudged: [], ran });

// Build a committed trace into an absolute temp repoRoot, persist it, return it.
function commit(repoRoot, file, before, after, gateVerdict) {
  const t = buildTrace({
    file,
    repoRoot,
    operator: 'atomic_converge',
    before,
    newText: after,
    inlinePreview: `committed ${file}`,
    validation: { language: 'ts', before: 0, after: 0 },
    targetUnit: 'converged_file',
    intention: 'correct-by-construction commit',
    semanticImpact: 'green_convergent_commit',
    changed: true,
    gateVerdict,
  });
  const res = writeTrace(t); // mutates t.parentSha256 + t.chainHash in place
  return { trace: t, res };
}

// 1) CHAIN — two sequential commits link parent → child, and HEAD advances.
{
  const repo = mkRepo();
  const headPath = path.join(repo, '.atomic', 'HEAD');

  const a = commit(repo, 'a.ts', 'export const x = 1;\n', 'export const x = 2;\n', verdict(['syntax', 'connection']));
  check('A1: first commit persisted a trace', !a.res.traceWriteError && !!a.res.tracePath);
  check('A2: genesis parent is empty', a.trace.parentSha256 === '');
  check('A3: chainHash is set + non-empty', typeof a.trace.chainHash === 'string' && a.trace.chainHash.length === 64);
  check('A4: HEAD marker holds the first chainHash', fs.readFileSync(headPath, 'utf8').trim() === a.trace.chainHash);

  const b = commit(repo, 'b.ts', 'export const y = 1;\n', 'export const y = 9;\n', verdict(['syntax', 'connection']));
  check('B1: second commit persisted a trace', !b.res.traceWriteError && !!b.res.tracePath);
  check('B2: child.parentSha256 === parent.chainHash (THE LINK)', b.trace.parentSha256 === a.trace.chainHash);
  check('B3: child.chainHash differs from parent (advanced)', b.trace.chainHash !== a.trace.chainHash);
  check('B4: HEAD advanced to the child chainHash', fs.readFileSync(headPath, 'utf8').trim() === b.trace.chainHash);

  // The child's stored chainHash is exactly the recomputation over its own bound fields.
  const recomputedChild = chainHashOf(b.trace.parentSha256, b.trace.afterSha256, b.trace.gateVerdict);
  check('B5: child chainHash == chainHashOf(parent, after, verdict)', recomputedChild === b.trace.chainHash);

  fs.rmSync(repo, { recursive: true, force: true });
}

// 2) TAMPER — editing the admitting gateVerdict breaks the recomputed link.
{
  const repo = mkRepo();

  const parent = commit(repo, 'p.ts', 'export const a = 0;\n', 'export const a = 1;\n', verdict(['syntax']));
  const child = commit(repo, 'c.ts', 'export const b = 0;\n', 'export const b = 1;\n', verdict(['syntax', 'connection']));

  // Honest baseline: with the REAL verdict, the recomputation reproduces the link.
  const honest = chainHashOf(child.trace.parentSha256, child.trace.afterSha256, child.trace.gateVerdict);
  check('T0: honest recompute reproduces the child chainHash', honest === child.trace.chainHash);

  // Tamper the verdict (flip green / inject a fake red) — recompute must NOT match.
  const tamperedVerdict = { ...child.trace.gateVerdict, green: false, reds: [{ gate: 'forged', file: 'c.ts', fact: 'forged' }] };
  const tampered = chainHashOf(child.trace.parentSha256, child.trace.afterSha256, tamperedVerdict);
  check('T1: tampered-verdict recompute ≠ stored chainHash', tampered !== child.trace.chainHash);

  // The parent pointer is content-addressed too: re-pointing it breaks the recompute.
  const repointed = chainHashOf('0'.repeat(64), child.trace.afterSha256, child.trace.gateVerdict);
  check('T2: re-pointed parent recompute ≠ stored chainHash', repointed !== child.trace.chainHash);

  // And swapping the after-content (the actual bytes committed) breaks it too.
  const swappedAfter = chainHashOf(child.trace.parentSha256, 'f'.repeat(64), child.trace.gateVerdict);
  check('T3: swapped after-content recompute ≠ stored chainHash', swappedAfter !== child.trace.chainHash);

  // canonicalJSON is order-insensitive on object keys (stable hash regardless of insertion order).
  const v1 = canonicalJSON({ green: true, reds: [], ran: ['x'] });
  const v2 = canonicalJSON({ ran: ['x'], reds: [], green: true });
  check('T4: canonicalJSON is key-order-insensitive (stable chain)', v1 === v2);

  // sanity: parent linked to genesis, child linked to parent.
  check('T5: parent is genesis, child links to parent', parent.trace.parentSha256 === '' && child.trace.parentSha256 === parent.trace.chainHash);

  fs.rmSync(repo, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
