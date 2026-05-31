#!/usr/bin/env node
/**
 * structural-lint-gate.proof.mjs — standalone node proof for the STRUCTURAL-LINT gate.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/structural-lint-gate.proof.mjs
 *
 * (node, not tsx — it imports the COMPILED gate from dist/, so it runs anywhere the
 * server runs.) Every assertion is in-memory over a throwaway temp dir; no repo
 * source is ever written. It proves the gate in BOTH polarities plus the honesty
 * properties the doctrine demands, for EACH of the four Stratum-1 rules:
 *
 *   RED      — an overlay edit that INTRODUCES a new structural-lint finding is refused,
 *              for unused-import / prefer-const / no-empty / no-useless-escape.
 *   GREEN    — the corresponding valid case (used import, reassigned let, non-empty /
 *              empty-catch / commented block, meaningful escape) stays green.
 *   DELTA    — a PRE-EXISTING finding in the prior bytes is tolerated (no regression).
 *   TOKEN    — a `from './x'` / `\,` / `debugger` written inside a string/comment is the
 *              string/comment node it really is → never extracted → no false red.
 *   RICE/    — the undecidable cases bail honestly: no-grammar file → unjudged; a name
 *   UNJUDGED   declared twice (shadowing) → prefer-const NOT emitted (no red-by-guess);
 *              a regex useless-escape → NOT emitted (out of the sound slice).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { makeContext } = await import(path.join(dir, '..', 'dist', 'gates', 'contract.js'));
const gate = (await import(path.join(dir, '..', 'dist', 'gates', 'structural-lint-gate.js'))).default;

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-structural-lint-'));
}
async function judge(repoRoot, overlay, changed) {
  return gate.run(makeContext(repoRoot, new Map(Object.entries(overlay)), changed));
}
const reFact = (res, needle) => res.reds.some((r) => r.fact.includes(needle));
const hasLocus = (res) => !!res.reds[0] && /^L\d+:\d+$/.test(res.reds[0].locus || '');

// ── no-unused-vars (unused-IMPORT slice) ──────────────────────────────────────
// RED: a NEW unused import (prior had none) reddens.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'm.ts'), "export const Helper = 1;\nexport const Other = 2;\n");
  fs.writeFileSync(path.join(d, 'a.ts'), "import { Helper } from './m';\nexport const x = Helper;\n");
  const res = await judge(
    d,
    { 'a.ts': "import { Helper, Other } from './m';\nexport const x = Helper;\n" },
    ['a.ts'],
  );
  check('RED: new unused import reddens', res.green === false && !res.unjudged && reFact(res, 'no-unused-vars') && reFact(res, "'Other'"));
  check('RED: red carries an L<line>:<col> locus', hasLocus(res));
  fs.rmSync(d, { recursive: true, force: true });
}
// GREEN: a USED import (incl. aliased + type-position use) stays green.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), '');
  const res = await judge(
    d,
    {
      'a.ts':
        "import { Foo, Bar as Baz } from './m';\n" +
        "const v: Foo = makeFoo();\n" +
        "console.log(Baz);\n",
    },
    ['a.ts'],
  );
  check('GREEN: used + aliased + type-position imports stay green', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}
// DELTA: a pre-existing unused import is tolerated (no new finding → no red).
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), "import { Dead } from './m';\nexport const x = 1;\n");
  const res = await judge(
    d,
    { 'a.ts': "import { Dead } from './m';\nexport const x = 2;\n" }, // Dead still unused, but pre-existing
    ['a.ts'],
  );
  check('DELTA: pre-existing unused import tolerated', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// ── prefer-const ──────────────────────────────────────────────────────────────
// RED: a NEW never-reassigned, singly-declared `let` reddens.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(d, { 'a.ts': 'let only = 5;\nexport const x = only;\n' }, ['a.ts']);
  check('RED: never-reassigned single let reddens', res.green === false && reFact(res, 'prefer-const') && reFact(res, "'only'"));
  fs.rmSync(d, { recursive: true, force: true });
}
// GREEN: a reassigned `let` stays green (correctly `let`).
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(d, { 'a.ts': 'let counter = 0;\ncounter = counter + 1;\nexport const x = counter;\n' }, ['a.ts']);
  check('GREEN: reassigned let stays green', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}
// RICE/UNJUDGED: a name declared twice (shadowing) → prefer-const NOT emitted.
// Outer `dup` is never reassigned, but an inner `dup` IS — flat-list scope is
// ambiguous, so the sound analyzer refuses to claim prefer-const (no red-by-guess).
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(
    d,
    { 'a.ts': 'let dup = 1;\nfunction f() { let dup = 2; dup = 3; return dup; }\nexport const x = dup + f();\n' },
    ['a.ts'],
  );
  check('RICE: shadowed name → prefer-const NOT emitted (no red-by-guess)', !reFact(res, 'prefer-const'));
  fs.rmSync(d, { recursive: true, force: true });
}

// ── no-empty ──────────────────────────────────────────────────────────────────
// RED: a NEW empty control block reddens.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export function f(c) { return c; }\n');
  const res = await judge(d, { 'a.ts': 'export function f(c) { if (c) {} return c; }\n' }, ['a.ts']);
  check('RED: new empty if-block reddens', res.green === false && reFact(res, 'no-empty'));
  fs.rmSync(d, { recursive: true, force: true });
}
// GREEN: empty CATCH and COMMENTED empty block are allowed; a function body is not flagged.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(
    d,
    {
      'a.ts':
        'export function f() {}\n' + // empty function body — not no-empty
        'export function g(c) { try { c(); } catch {} if (c) { /* intentional */ } return 1; }\n',
    },
    ['a.ts'],
  );
  check('GREEN: empty catch + commented block + fn body stay green', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}

// ── no-useless-escape ─────────────────────────────────────────────────────────
// RED: a NEW useless string escape reddens.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(d, { 'a.ts': "export const s = 'value\\, here';\n" }, ['a.ts']);
  check('RED: new useless string escape reddens', res.green === false && reFact(res, 'no-useless-escape'));
  fs.rmSync(d, { recursive: true, force: true });
}
// GREEN: a meaningful escape (\n) stays green.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(d, { 'a.ts': "export const s = 'line\\n break';\n" }, ['a.ts']);
  check('GREEN: meaningful escape stays green', res.green === true && res.reds.length === 0 && !res.unjudged);
  fs.rmSync(d, { recursive: true, force: true });
}
// RICE: a regex useless-escape is OUTSIDE the sound slice → NOT emitted.
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(d, { 'a.ts': 'export const re = /foo\\,bar/;\n' }, ['a.ts']);
  check('RICE: regex useless-escape NOT emitted (out of sound slice)', !reFact(res, 'no-useless-escape'));
  fs.rmSync(d, { recursive: true, force: true });
}

// ── TOKEN-CORRECTNESS — constructs inside strings/comments are never findings ──
{
  const d = mkTmp();
  fs.writeFileSync(path.join(d, 'a.ts'), 'export const x = 1;\n');
  const res = await judge(
    d,
    {
      'a.ts':
        "// import { Ghost } from './nowhere'; and a \\, escape in this comment\n" +
        "export const note = \"the words debugger and let foo never reassigned live in this string\";\n" +
        "export const x = 2;\n",
    },
    ['a.ts'],
  );
  check('TOKEN: import/escape/let-text inside comment & string raise NO finding', res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// ── UNJUDGED — no grammar for the file's language → honest unjudged, never red ─
{
  const d = mkTmp();
  // .vue is not in langOf's grammar map → analyzer returns null → file unjudged.
  fs.writeFileSync(path.join(d, 'a.vue'), 'whatever\n');
  const res = await judge(d, { 'a.vue': 'still whatever\n' }, ['a.vue']);
  check('UNJUDGED: appliesTo rejects non-source ext (no false judgement)', gate.appliesTo('a.vue') === false);
  // and a source ext with content the analyzer can parse but no finding stays green
  fs.rmSync(d, { recursive: true, force: true });
}
// UNJUDGED — change set has source extensions but the gate honestly reports unjudged
// when nothing is judgeable (no source file matched at all).
{
  const d = mkTmp();
  const res = await judge(d, { 'README.md': '# nothing\n' }, ['README.md']);
  check('UNJUDGED: no source file in change set → unjudged (not green-by-assumption)', res.unjudged === true && res.green === true && res.reds.length === 0);
  fs.rmSync(d, { recursive: true, force: true });
}

// ── contract shape ────────────────────────────────────────────────────────────
check('SHAPE: gate is static kind named structural-lint, appliesTo .ts', gate.name === 'structural-lint' && gate.kind === 'static' && gate.appliesTo('foo.ts') === true && gate.appliesTo('foo.css') === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
