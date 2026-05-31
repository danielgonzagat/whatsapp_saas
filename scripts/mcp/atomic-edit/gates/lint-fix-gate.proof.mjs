#!/usr/bin/env node
/**
 * lint-fix-gate.proof.mjs — standalone node proof for the MECHANICALLY-FIXABLE-LINT gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/lint-fix-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory over a throwaway temp project; no repo
 * source is ever written. It proves the gate in BOTH polarities plus the honesty
 * properties the doctrine demands, and the convergence property the corpus needs:
 *
 *   RED        — an UNFORMATTED overlay file is reddened, with a whole-content locus.
 *   GREEN      — an ALREADY-CANONICAL overlay file passes (no red).
 *   FIX        — proposeFixes returns the whole-content splice to the canonical form;
 *                applying it (in overlay) makes a SECOND run GREEN (green-convergent).
 *   IDEMPOTENT — formatting the canonical form again is a no-op (format∘format = format):
 *                the fix is a fixpoint, so the operator's re-gate accepts it.
 *   UNJUDGED   — a path with no prettier parser, and a too-broad (lens-shaped) change
 *                set, both bail honestly rather than red-by-guess or green-by-assumption.
 *   SYNTAX≠FMT — a syntactically BROKEN file is UNJUDGED (a syntax error is the
 *                binding/type gate's fact), never reddened as "unformatted".
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'lint-fix-gate.js'))).default;

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

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-lint-gate-'));
}
/** Write a .prettierrc so the temp project's canonical form is deterministic and known. */
function writePrettierrc(d) {
  fs.writeFileSync(path.join(d, '.prettierrc.json'), JSON.stringify({ singleQuote: true, semi: true }));
}
async function judge(repoRoot, overlay, changed) {
  return gate.run(makeContext(repoRoot, new Map(Object.entries(overlay)), changed));
}

const UNFORMATTED = 'const x=1\nconst y =  2;\n'; // bad spacing, missing semi
const CANONICAL = "const x = 1;\nconst y = 2;\n"; // prettier(singleQuote,semi) output

// 1) RED — an unformatted overlay file is reddened with a whole-content locus.
{
  const d = mkTmp();
  writePrettierrc(d);
  fs.writeFileSync(path.join(d, 'a.ts'), CANONICAL); // disk is clean; overlay is the candidate
  const res = await judge(d, { 'a.ts': UNFORMATTED }, ['a.ts']);
  check('RED: unformatted file reddens', res.green === false && !res.unjudged && res.reds.length === 1);
  check('RED: red carries a whole-content b0-<len> locus', /^b0-\d+$/.test(res.reds[0]?.locus || ''));
  check('RED: fact names the canonical-form violation', /canonical prettier-fixed form/.test(res.reds[0]?.fact || ''));
  fs.rmSync(d, { recursive: true, force: true });
}

// 2) GREEN — an already-canonical overlay file passes.
{
  const d = mkTmp();
  writePrettierrc(d);
  fs.writeFileSync(path.join(d, 'a.ts'), CANONICAL);
  const res = await judge(d, { 'a.ts': CANONICAL }, ['a.ts']);
  check('GREEN: canonical file passes', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// 3) FIX + IDEMPOTENT — proposeFixes drives the red GREEN, and the fix is a fixpoint.
{
  const d = mkTmp();
  writePrettierrc(d);
  fs.writeFileSync(path.join(d, 'a.ts'), CANONICAL);
  const ctx = makeContext(d, new Map([['a.ts', UNFORMATTED]]), ['a.ts']);
  const before = await gate.run(ctx); // populates the per-ctx stash proposeFixes reads
  const fixes = gate.proposeFixes(ctx);
  check('FIX: exactly one whole-content splice proposed', fixes.length === 1 && fixes[0].byteStart === 0 && fixes[0].byteEnd === UNFORMATTED.length);
  const fixed = UNFORMATTED.slice(0, fixes[0].byteStart) + fixes[0].replacement + UNFORMATTED.slice(fixes[0].byteEnd);
  check('FIX: replacement equals the canonical form', fixed === CANONICAL);
  // green-convergent: re-running the gate over the fixed overlay is GREEN
  const after = await judge(d, { 'a.ts': fixed }, ['a.ts']);
  check('FIX: applying the splice makes a second run GREEN (green-convergent)', before.green === false && after.green === true && after.reds.length === 0);
  // idempotent: the fixed form proposes NO further fix (it is a fixpoint)
  const ctx2 = makeContext(d, new Map([['a.ts', fixed]]), ['a.ts']);
  await gate.run(ctx2);
  check('IDEMPOTENT: canonical form proposes no further fix', gate.proposeFixes(ctx2).length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 4) SYNTAX≠FMT — a syntactically BROKEN file is UNJUDGED, not reddened. prettier
//    throws on unparseable bytes; that is a syntax error (the binding/type gate's
//    fact), NOT "unformatted code", so the gate defers instead of red-by-guessing.
{
  const d = mkTmp();
  writePrettierrc(d);
  fs.writeFileSync(path.join(d, 'broken.ts'), CANONICAL);
  const res = await judge(d, { 'broken.ts': 'const x = (((;\n' }, ['broken.ts']); // unparseable
  check('SYNTAX≠FMT: a syntactically broken file is UNJUDGED, not red', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 5) UNJUDGED — a too-broad change set (the whole-repo READ-lens shape) bails.
{
  const d = mkTmp();
  writePrettierrc(d);
  const overlay = {};
  const changed = [];
  for (let i = 0; i < 12; i += 1) {
    const f = `f${i}.ts`;
    fs.writeFileSync(path.join(d, f), CANONICAL);
    overlay[f] = UNFORMATTED; // all would be red — but the lens-shape must bail first
    changed.push(f);
  }
  const res = await judge(d, overlay, changed);
  check('UNJUDGED: >MAX_CHANGED files → unjudged (lens bail, no per-file reformat)', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// 6) NON-SOURCE — a file the gate does not apply to is never judged (appliesTo guard).
{
  check('APPLIES: .d.ts and unknown extensions are skipped by appliesTo', gate.appliesTo('a.ts') === true && gate.appliesTo('a.d.ts') === false && gate.appliesTo('a.bin') === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
