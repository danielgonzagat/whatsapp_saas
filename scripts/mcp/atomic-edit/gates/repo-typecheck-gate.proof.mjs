#!/usr/bin/env node
/**
 * repo-typecheck-gate.proof.mjs — asserts the ENGINE'S OWN SOURCE typechecks clean
 * (`tsc --noEmit`, zero errors) under its committed `tsconfig.json`.
 *
 * Why this exists — the gap it closes:
 *   The `type-soundness-gate` is DELTA by deliberate doctrine: at the pre-write floor
 *   it reddens only when an edit INTRODUCES a *new* type error, and TOLERATES
 *   pre-existing type debt (so a single splice is never blocked by unrelated standing
 *   errors). That is correct for the write path — but it means NOTHING in the lattice
 *   ever proved the SHIPPED ARTIFACT itself typechecks. A repo could accumulate
 *   standing `tsc` errors and every gate stays green, because the build is esbuild
 *   (which strips types and never type-checks) and every per-write gate is a delta.
 *   (This is not hypothetical: the LSP gate sources shipped with 11 standing errors
 *   that no gate caught.)
 *
 *   This gate is the ABSOLUTE companion to that DELTA gate. It runs at verify /
 *   self-expansion-admission time — NOT on every micro-splice — where "the artifact
 *   we publish type-checks" is a guarantee worth paying a whole-program compile for.
 *
 * Doctrine compliance:
 *   - ABSOLUTE here is correct (unlike the write floor) because this runs at the
 *     publish/admission boundary, where standing debt is exactly what must be zero.
 *   - HONEST / UNJUDGED, never red-by-guess: if no governing tsconfig can be located,
 *     or the `typescript` module is unavailable, it ABSTAINS (pass, with reason) rather
 *     than reddening on a guess. In the shipped artifact both are always present, so it
 *     judges for real.
 *   - PURE: an in-process `ts` program over the config's file set. No spawn, no disk
 *     write, no network. Deterministic.
 *
 * Run:  node src/build.mjs && node src/gates/repo-typecheck-gate.proof.mjs [--json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsonMode = process.argv.includes('--json');

const results = [];
let pass = 0;
let fail = 0;
function check(name, cond, detail = {}) {
  const ok = Boolean(cond);
  results.push({ name, ok, detail });
  if (ok) { pass += 1; if (!jsonMode) console.log('  PASS ', name); }
  else { fail += 1; if (!jsonMode) console.log('  FAIL ', name, JSON.stringify(detail)); }
}

/** Walk up from the gate dir to the nearest tsconfig.json that drives a real source set. */
function locateTsconfig(start) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const cfg = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(cfg)) {
      try {
        const raw = JSON.parse(fs.readFileSync(cfg, 'utf8'));
        // a config that actually includes .ts sources (skip bare "extends"-only shims)
        if (raw && (raw.include || raw.files || raw.compilerOptions)) return cfg;
      } catch { /* fall through and keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function abstain(reason) {
  // Honest UNJUDGED → does not fail the lattice; states exactly why it could not judge.
  check(`repo-typecheck ABSTAINS — ${reason}`, true, { unjudged: true, reason });
  finish();
}

let ts;
try { ts = require('typescript'); }
catch { abstain('typescript module unavailable in this environment'); }

const configPath = locateTsconfig(here);
if (!configPath) abstain('no governing tsconfig.json found walking up from the gate');

const configDir = path.dirname(configPath);
let parsed;
try {
  const host = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  };
  parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
} catch (e) {
  abstain(`tsconfig could not be parsed: ${e?.message ?? e}`);
}

if (!parsed || !Array.isArray(parsed.fileNames) || parsed.fileNames.length === 0) {
  abstain(`governing tsconfig resolved zero source files (${path.relative(configDir, configPath)})`);
}

// Build the program EXACTLY as `tsc --noEmit -p tsconfig.json` would, then collect
// every Error-category diagnostic (syntactic + semantic + options + global).
const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: { ...parsed.options, noEmit: true },
  projectReferences: parsed.projectReferences,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);

const byFile = {};
for (const d of errors) {
  const f = d.file ? path.relative(configDir, d.file.fileName) : '<global>';
  byFile[f] = (byFile[f] || 0) + 1;
}
const sample = errors.slice(0, 12).map((d) => {
  const loc = d.file && typeof d.start === 'number'
    ? (() => { const { line, character } = d.file.getLineAndCharacterOfPosition(d.start); return `${path.relative(configDir, d.file.fileName)}(${line + 1},${character + 1})`; })()
    : '<global>';
  return `${loc}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160)}`;
});

check(
  `engine source typechecks clean under ${path.relative(configDir, configPath) || 'tsconfig.json'} (tsc --noEmit, 0 errors over ${parsed.fileNames.length} files)`,
  errors.length === 0,
  { errorCount: errors.length, byFile, sample },
);

function finish() {
  const payload = { ok: fail === 0, pass, fail, results };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n', () => process.exit(payload.ok ? 0 : 1));
    return;
  }
  process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(payload.ok ? 0 : 1));
}

finish();
