#!/usr/bin/env node
/**
 * lsp-mesh-e2e.proof.mjs — proves the LSP MESH is a REAL capability, not scaffolding.
 *
 * The LSP gates (lsp-diagnostic-gate et al.) are async, opt-in plugin gates: their
 * synchronous lattice entry abstains by design, and the real semantic check happens
 * through `lsp-router.mjs`, which speaks the LSP wire protocol to an actual language
 * server. Nothing else in the suite ever exercised that real round-trip — so the
 * capability was *claimed* but never *proven*. This gate closes that: it drives the
 * REAL router against a REAL `typescript-language-server` and asserts both polarities.
 *
 *   RED   — a file with a genuine type error yields a severity-1 diagnostic (TS2322).
 *   GREEN — a type-valid file yields zero severity-1 diagnostics.
 *
 * HONEST SKIP (the doctrine's "unjudged, never green-by-assumption"): if no TypeScript
 * language server is resolvable (not installed), this self-skips with exit 0 and a
 * precise reason rather than faking a pass. `verify.mjs` also probes the prerequisite
 * and marks it SKIPPED before running on a bare clone; when a server IS present (local
 * devDep or global install) it runs for real. Install: `npm i -g typescript-language-server`.
 *
 * Run:  npm i -D typescript-language-server && node src/gates/lsp-mesh-e2e.proof.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..');
const repoRoot = path.resolve(srcDir, '..');
const router = path.join(here, 'lsp-router.mjs');
const jsonMode = process.argv.includes('--json');

const results = [];
let pass = 0;
let fail = 0;
function check(name, cond, detail = {}) {
  const ok = Boolean(cond);
  results.push({ name, ok, detail });
  if (ok) { pass += 1; if (!jsonMode) console.log('  PASS ', name); }
  else { fail += 1; if (!jsonMode) console.log('  FAIL ', name, JSON.stringify(detail).slice(0, 200)); }
}

// PATH that can see a locally-installed server (devDep) as well as global installs.
const binDirs = [
  path.join(repoRoot, 'node_modules', '.bin'),
  path.join(srcDir, 'node_modules', '.bin'),
].filter((d) => fs.existsSync(d));
const augmentedPath = [...binDirs, process.env.PATH || ''].join(path.delimiter);

function serverResolvable() {
  const r = spawnSync('sh', ['-c', 'command -v typescript-language-server'], {
    env: { ...process.env, PATH: augmentedPath },
  });
  return r.status === 0 && String(r.stdout).trim().length > 0;
}

function skip(reason) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok: true, skipped: true, reason, pass: 0, fail: 0, results: [] }, null, 2) + '\n',
      () => process.exit(0));
  } else {
    process.stdout.write(`\n  SKIP — ${reason}\n`, () => process.exit(0));
  }
}

if (!fs.existsSync(router)) skip(`lsp-router.mjs not found at ${router}`);
if (!serverResolvable()) skip('no typescript-language-server resolvable on PATH (npm i -g typescript-language-server)');

/** Drive the real router for one diagnostics round-trip; returns the parsed result. */
function routerDiagnostics(absFile, content, rootUri, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [router, 'diagnostics', absFile, 'typescript'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: augmentedPath },
      timeout: timeoutMs,
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('error', (e) => resolve({ ok: false, error: e.message }));
    proc.on('close', () => {
      try { resolve(JSON.parse(out)); }
      catch { resolve({ ok: false, error: `unparseable router output: ${out.slice(0, 200)}` }); }
    });
    proc.stdin.write(JSON.stringify({ content, rootUri }));
    proc.stdin.end();
  });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-lsp-e2e-'));
  try {
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true } }));
    const rootUri = 'file://' + dir;

    const badPath = path.join(dir, 'bad.ts');
    const badSrc = 'const offender: number = "definitely not a number";\nexport {};\n';
    fs.writeFileSync(badPath, badSrc);
    const bad = await routerDiagnostics(badPath, badSrc, rootUri);
    const badErrors = (bad.diagnostics || []).filter((d) => d.severity === 1);
    check(
      'REAL language server reports a severity-1 diagnostic for a genuine type error',
      bad.ok === true && badErrors.length >= 1,
      { ok: bad.ok, errorCount: badErrors.length, first: badErrors[0]?.message?.slice(0, 100), code: badErrors[0]?.code, routerError: bad.error },
    );
    check(
      'the diagnostic is the expected assignability error (TS2322)',
      badErrors.some((d) => d.code === 2322 || /not assignable/i.test(d.message || '')),
      { codes: badErrors.map((d) => d.code) },
    );

    const goodPath = path.join(dir, 'good.ts');
    const goodSrc = 'export const fine: number = 42;\nexport const label: string = "ok";\n';
    fs.writeFileSync(goodPath, goodSrc);
    const good = await routerDiagnostics(goodPath, goodSrc, rootUri);
    const goodErrors = (good.diagnostics || []).filter((d) => d.severity === 1);
    check(
      'REAL language server reports ZERO severity-1 diagnostics for type-valid code',
      good.ok === true && goodErrors.length === 0,
      { ok: good.ok, errorCount: goodErrors.length, first: goodErrors[0]?.message?.slice(0, 100), routerError: good.error },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const payload = { ok: fail === 0, pass, fail, results };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n', () => process.exit(payload.ok ? 0 : 1));
  } else {
    process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(payload.ok ? 0 : 1));
  }
}

main();
