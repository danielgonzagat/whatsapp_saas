#!/usr/bin/env node
/**
 * Camada 4 — trace-coverage + active host-boundary auditor.
 *
 * Cross-checks working-tree code changes against .atomic/traces and also reports
 * whether the current Codex/Claude process tree is actually inside the atomic
 * host boundary (ATOMIC_HOST_SANDBOX + ATOMIC_HOST_ATOMIC_ONLY + write root +
 * pinned temp roots + broker socket). Default mode is advisory and Stop-hook
 * safe; strict modes are available for hard gates:
 *   --strict                 hard-fail untraced code changes
 *   --strict-host-boundary   hard-fail missing active host boundary
 *
 * Zero deps. `node trace-coverage-audit.mjs [--strict] [--strict-host-boundary] [--json]`.
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
const strictHostBoundary = args.includes('--strict-host-boundary');
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

function samePath(a, b) {
  if (!a || !b) return false;
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

function socketStatus(socketPath) {
  if (!socketPath) return { present: false, isSocket: false };
  try {
    const stat = fs.statSync(socketPath);
    return { present: true, isSocket: stat.isSocket() };
  } catch {
    return { present: false, isSocket: false };
  }
}

function hostBoundaryReport() {
  const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET || '';
  const socketInfo = socketStatus(socket);
  const tempPinned = samePath(process.env.TMPDIR, REPO) && samePath(process.env.TMP, REPO) && samePath(process.env.TEMP, REPO);
  const report = {
    active:
      process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
      process.env.ATOMIC_HOST_ATOMIC_ONLY === '1',
    sandbox: process.env.ATOMIC_HOST_SANDBOX || null,
    atomicOnly: process.env.ATOMIC_HOST_ATOMIC_ONLY || null,
    writeRoot: process.env.ATOMIC_HOST_WRITE_ROOT || null,
    writeRootMatchesRepo: samePath(process.env.ATOMIC_HOST_WRITE_ROOT, REPO),
    tempPinnedToRepo: tempPinned,
    brokerSocketPresent: socketInfo.present,
    brokerSocketIsSocket: socketInfo.isSocket,
  };
  return {
    ...report,
    pass:
      report.active &&
      report.writeRootMatchesRepo &&
      report.tempPinnedToRepo &&
      report.brokerSocketPresent &&
      report.brokerSocketIsSocket,
  };
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
const tracePass = uncovered.length === 0;
const hostBoundary = hostBoundaryReport();
const report = {
  changedCodeFiles: uniqueChanged.length,
  traced: uniqueChanged.length - uncovered.length,
  uncovered,
  tracePass,
  hostBoundary,
  pass: tracePass,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (uniqueChanged.length === 0) {
    console.log('[trace-coverage] no code changes — clean');
  } else if (tracePass) {
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

  if (hostBoundary.pass) {
    console.log('[host-boundary] OK — active session has atomic host sandbox + repo write root + broker socket');
  } else {
    console.log(
      '[host-boundary] advisory — active session is NOT fully inside the atomic host boundary; ' +
        'relaunch through scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs -- <agent-command>',
    );
    if (strictHostBoundary) console.log('[host-boundary] STRICT FAIL');
  }
}

process.exit((strict && !tracePass) || (strictHostBoundary && !hostBoundary.pass) ? 1 : 0);
