#!/usr/bin/env node
/**
 * lsp-semantic-delta.proof.mjs — proves the lsp-semantic DYNAMIC gate is DELTA-correct
 * against a REAL language server, in all four polarities the doctrine demands:
 *
 *   RED       — an edit that INTRODUCES a new intrinsic type error is refused.
 *   DELTA     — a pre-existing error carried through the edit is TOLERATED (no red).
 *   GREEN     — a type-valid edit passes.
 *   EXCLUDED  — a NEW cross-file resolution error (cannot-find-name) is NOT red
 *               (single-file isolation is unreliable there; owned by other gates).
 *
 * HONEST SKIP: if no typescript-language-server resolves, self-skip (exit 0) — the
 * gate itself abstains (unjudged) in that case, which `verify.mjs` probes for.
 *
 * Drives the COMPILED gate through the real registry GateContext (makeContext), so it
 * exercises exactly what `atomic_converge` runs.
 *
 * Run:  node src/build.mjs && node src/gates/lsp-semantic-delta.proof.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distGates = path.join(here, '..', 'dist', 'gates');
const jsonMode = process.argv.includes('--json');

const binDirs = [
  path.join(here, '..', '..', 'node_modules', '.bin'),
  path.join(here, '..', 'node_modules', '.bin'),
].filter((d) => fs.existsSync(d));
const augmentedPath = [...binDirs, process.env.PATH || ''].join(path.delimiter);
function serverResolvable() {
  return spawnSync('sh', ['-c', 'command -v typescript-language-server'], {
    env: { ...process.env, PATH: augmentedPath },
  }).status === 0;
}

function skip(reason) {
  if (jsonMode) process.stdout.write(JSON.stringify({ ok: true, skipped: true, reason, pass: 0, fail: 0, results: [] }) + '\n', () => process.exit(0));
  else process.stdout.write(`\n  SKIP — ${reason}\n`, () => process.exit(0));
}

if (!serverResolvable()) skip('no typescript-language-server resolvable (npm i -g typescript-language-server)');
process.env.PATH = augmentedPath;

const results = [];
let pass = 0, fail = 0;
function check(name, cond, detail = {}) {
  const ok = Boolean(cond);
  results.push({ name, ok, detail });
  if (ok) { pass += 1; if (!jsonMode) console.log('  PASS ', name); }
  else { fail += 1; if (!jsonMode) console.log('  FAIL ', name, JSON.stringify(detail).slice(0, 220)); }
}

const { makeContext } = await import(path.join(distGates, 'contract.js'));
const gate = (await import(path.join(distGates, 'lsp-semantic-gate.js'))).default;

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-semantic-delta-'));
fs.writeFileSync(path.join(repoRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }));

/** Write `before` to disk (so ctx.priorOf reads it), overlay `after`, run the gate. */
async function judge(rel, before, after) {
  fs.writeFileSync(path.join(repoRoot, rel), before);
  const ctx = makeContext(repoRoot, new Map([[rel, after]]), [rel]);
  return gate.run(ctx);
}

try {
  // RED — clean → introduces a TS2322 assignability error.
  const red = await judge('a.ts', 'export const n: number = 1;\n', 'export const n: number = "not a number";\n');
  check('RED: edit introducing a new type error is refused',
    red.green === false && red.reds.length >= 1 && /2322|assignable/i.test(JSON.stringify(red.reds)),
    { green: red.green, reds: red.reds, unjudged: red.unjudged });

  // DELTA — a pre-existing error carried through is tolerated (green, not red).
  const delta = await judge('b.ts', 'export const n: number = "still bad";\n', 'export const n: number = "still bad";\nexport const m: number = 2;\n');
  check('DELTA: pre-existing error tolerated (no new error → green)',
    delta.green === true && delta.reds.length === 0,
    { green: delta.green, reds: delta.reds, unjudged: delta.unjudged });

  // GREEN — a type-valid edit passes.
  const green = await judge('c.ts', 'export const n: number = 1;\n', 'export const n: number = 42;\nexport const ok: string = "fine";\n');
  check('GREEN: a type-valid edit passes',
    green.green === true && green.reds.length === 0 && green.unjudged !== true,
    { green: green.green, reds: green.reds, unjudged: green.unjudged });

  // EXCLUDED — a NEW cross-file resolution error (cannot-find-name) is NOT red.
  const excl = await judge('d.ts', 'export const n = 1;\n', 'export const n = 1;\nexport const r = someUndefinedCrossFileThing;\n');
  check('EXCLUDED: new cross-file resolution error is NOT red (delta gate excludes it)',
    excl.green === true && excl.reds.length === 0,
    { green: excl.green, reds: excl.reds, unjudged: excl.unjudged });
} finally {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

const payload = { ok: fail === 0, pass, fail, results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n', () => process.exit(payload.ok ? 0 : 1));
else process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(payload.ok ? 0 : 1));
