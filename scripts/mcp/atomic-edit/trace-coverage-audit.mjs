#!/usr/bin/env node
/**
 * Camada 4 — trace-coverage auditor.
 *
 * "Falhar se houver mudança de código sem AtomicEditTrace." Cross-checks the
 * working-tree code changes (git diff) against the traces in
 * .atomic/traces/: every changed code file should have ≥1 trace whose
 * `file` matches it. A changed code file with NO trace means a native /
 * shell edit slipped past the ban — exactly what the TUI-abolished rule
 * forbids.
 *
 * Two modes (honest about the danger of a hard-blocking Stop hook):
 *   default  — ADVISORY: prints findings, exits 0. Safe as a Stop hook
 *              (a hard-failing Stop hook traps the session in a loop).
 *   --strict — exits 1 on any uncovered code change. For CI / manual gate,
 *              NOT for the Stop hook.
 *
 * Zero deps. `node trace-coverage-audit.mjs [--strict] [--json]`.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const TRACES = path.join(REPO, '.atomic', 'traces');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');

const CODE =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|ipynb|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma)$/i;
// atomic-edit's own source is exempt — it is bootstrapped BY native edits
// before the tool can edit itself; auditing it would be circular.
const EXEMPT = /scripts\/mcp\/atomic-edit\/|scripts\/decomp\/|\.smoke|\/dist\//;

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const changed = sh('git diff --name-only HEAD')
  .split('\n')
  .concat(sh('git diff --name-only --cached').split('\n'))
  .map((s) => s.trim())
  .filter((f) => f && CODE.test(f) && !EXEMPT.test(f));
const uniqueChanged = [...new Set(changed)];

const tracedFiles = new Set();
if (fs.existsSync(TRACES)) {
  for (const f of fs.readdirSync(TRACES).filter((x) => x.endsWith('.json'))) {
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TRACES, f), 'utf8'));
      if (t.file) tracedFiles.add(String(t.file).replace(/^\.?\//, ''));
    } catch {
      /* ignore unparseable */
    }
  }
}

const uncovered = uniqueChanged.filter((f) => !tracedFiles.has(f.replace(/^\.?\//, '')));
const report = {
  changedCodeFiles: uniqueChanged.length,
  traced: uniqueChanged.length - uncovered.length,
  uncovered,
  pass: uncovered.length === 0,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (uniqueChanged.length === 0) {
  console.log('[trace-coverage] no code changes — clean');
} else if (report.pass) {
  console.log(`[trace-coverage] OK — ${report.traced}/${uniqueChanged.length} code files traced`);
} else {
  console.log(
    `[trace-coverage] ${uncovered.length} code file(s) changed WITHOUT an AtomicEditTrace ` +
      `(native/shell edit slipped the TUI-abolished ban):`,
  );
  for (const f of uncovered.slice(0, 20)) console.log(`  - ${f}`);
  console.log(
    strict
      ? '[trace-coverage] STRICT FAIL'
      : '[trace-coverage] advisory (Stop-hook safe; run with --strict for a hard gate)',
  );
}

process.exit(strict && !report.pass ? 1 : 0);
