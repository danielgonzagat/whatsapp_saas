#!/usr/bin/env node
/**
 * Proof for gates/test-execution-gate.ts (proof #3 test-execution layer). Drives
 * the BUILT gate over crafted overlays via dynamic import.
 *
 * Test command is COUNT-BASED and self-match-safe:
 *   test $(grep -c MARKER {file}) -ge 2
 * MARKER appears once in the directive line itself; a passing body adds a 2nd
 * occurrence, so the count is >=2 (pass). Removing the body marker drops the
 * count to 1 (the directive's own) → deterministic FAIL. No inner double-quotes
 * (the directive value is double-quote delimited), so the directive regex keeps
 * the whole command. Hermetic — only grep/test, no project toolchain.
 *
 * Asserts:
 *   1. no directive            -> notApplicable
 *   2. new content passes test  -> green
 *   3. write BREAKS a passing test (prior passed, new fails) -> RED
 *   4. test already failing on prior bytes -> not this write's claim (no red)
 *   5. brand-new file (no prior) whose test fails -> not a regression (no red)
 *   6. runner-ERROR command (non-existent binary) -> unjudged -> never red-by-guess (green)
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const atomicDir = path.resolve(here, '..');

const { default: gate } = await import(path.join(atomicDir, 'dist', 'gates', 'test-execution-gate.js'));
const { makeContext } = await import(path.join(atomicDir, 'dist', 'gates', 'contract.js'));

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

function run(rel, content, prior) {
  const overlay = new Map([[rel, content]]);
  const ctx = makeContext(atomicDir, overlay, [rel], false);
  ctx.priorOf = (r) => (r === rel ? (prior ?? '') : '');
  return gate.run(ctx);
}

// Count-based, self-match-safe, no inner double-quotes.
const dir = '// @test-on-change cmd="test $(grep -c MARKER {file}) -ge 2"\n';
const withMark = dir + 'const y = 1; // MARKER\n'; // body adds the 2nd MARKER -> count 2 -> pass
const noMark = dir + 'const y = 1;\n'; // only the directive MARKER -> count 1 -> fail

// 1. no directive
rec('no directive is notApplicable', run('a.ts', 'export const x = 1;\n').notApplicable === true);
// 2. passes
rec('passing test is green', run('a.ts', withMark).green === true, run('a.ts', withMark));
// 3. breaks a passing test
{
  const r = run('a.ts', noMark, withMark);
  rec('breaking a passing test is RED', r.green === false && /FAIL where it passed/i.test(JSON.stringify(r.reds)), r.reds);
}
// 4. already failing on prior (both lack the body marker)
rec('already-failing test does not block edit', run('a.ts', noMark, noMark).green === true);
// 5. brand-new failing file (no prior)
rec('brand-new failing file is not a regression', run('a.ts', noMark, '').green === true);
// 6. runner-error -> unjudged -> never red-by-guess (DETERMINISTIC: the binary does not exist,
//    so spawnSync sets res.error on EVERY run -> runTest returns null -> gate defers to unjudged).
{
  const errCmd = '// @test-on-change cmd="atomic-nonexistent-binary-zzz {file}"\n' + 'const y = 1;\n';
  const r = run('a.ts', errCmd, '// @test-on-change cmd="atomic-nonexistent-binary-zzz {file}"\nconst y = 0;\n');
  rec('runner-error command never red-by-guess', r.green === true, r);
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
