/**
 * Compile the atomic-edit server graph to dist/ as ESM, using the
 * already-installed `typescript` module (no tsx, no npx, no network). The
 * launcher calls this only when dist is missing or stale, so normal startup
 * is a plain fast `node dist/server.js`.
 *
 * Why ESM out: the MCP SDK is ESM-only and the sources already use `.js`
 * import specifiers (NodeNext style). A tiny dist/package.json pins
 * {"type":"module"} so Node treats the emitted .js as ESM even though the
 * repo root is CommonJS.
 */
import { createRequire } from 'node:module';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeManifest } from './dist-freshness.mjs';

function hostVisibleDir(target) {
  const host = process.env.ATOMIC_HOST_WRITE_ROOT?.trim();
  if (!host) return path.resolve(target);
  try {
    const hostRoot = path.resolve(host);
    const hostReal = fs.realpathSync.native(hostRoot);
    const targetReal = fs.realpathSync.native(path.resolve(target));
    const rel = path.relative(hostReal, targetReal);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return path.join(hostRoot, rel);
    }
  } catch {
    // Fall back to the resolved path below.
  }
  return path.resolve(target);
}

const dir = hostVisibleDir(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require('typescript');

const ENTRY = [
  'server.ts',
  'server-helpers-self-expansion.ts',
  'server-helpers-negative-proof.ts',
  'server-tools-self.ts',
  'server-tools-disproof.ts',
  'server-tools-positive-bytes.ts',
  'server-tools-codex-config.ts',
  'engine.ts',
  'engine-rename.ts',
  'engine-ops.ts',
  'engine-universal.ts',
  'engine-causal-blame.ts',
  'engine-complete.ts',
  'lang-bridge.ts',
  'guard.ts',
  'nav.ts',
  'symbols.ts',
  'advanced.ts',
  'trace.ts',
  'replay-admissible.ts',
  'textunit.ts',
  'founder.ts',
  'smoke.ts',
  'gates/registry.ts',
  'gates/reexport-symbol-gate.ts',
  'gates/prisma-reference-gate.ts',
  'gates/config-key-gate.ts',
  'gates/structural-lint-gate.ts',
  'gates/security-gate.ts',
  'gates/test-execution-gate.ts',
  'gates/lint-fix-gate.ts',
  'gates/temporal-session-gate.ts',
  'gates/lens.ts',
  'gates/repair.ts',
  'gates/algebra.ts',
  'gates/merge.ts',
  'gates/converge-operator.ts',
  'gates/corpus.ts',
  'gates/closure-universal.ts',
  'gates/reachability-gate.proof.ts',
  'gates/binding-gate.proof.ts',
  'gates/property-gate.proof.ts',
  'gates/formal-gate.proof.ts',
  'gates/contract-edge-gate.proof.ts',
  'gates/findings-delta-gate.proof.ts',
  'gates/probe-convergence-gate.proof.ts',
  'gates/codex-config-edit-tool.proof.ts',
].map((f) => path.join(dir, f));
const OUT = path.join(dir, 'dist');
const BUILD_OUT = fs.mkdtempSync(path.join(os.tmpdir(), `atomic-edit-dist-${process.pid}-`));
const REQUIRED_DIST_ARTIFACTS = [
  'server.js',
  'server-helpers-hot-reload.js',
  'server-helpers-io.js',
  'server-helpers-effect.js',
  'server-tools-exec.js',
  'server-tools-self.js',
  'server-tools-disproof.js',
  'server-tools-y.js',
  'server-tools-codex-config.js',
  'engine.js',
  'trace.js',
  'gates/contract.js',
  'gates/algebra.js',
  'gates/converge-operator.js',
  'gates/reachability-gate.proof.js',
  'gates/binding-gate.proof.js',
  'gates/probe-convergence-gate.proof.js',
  'gates/formal-gate.proof.js',
  'gates/property-gate.proof.js',
  'gates/findings-delta-gate.proof.js',
  'gates/contract-edge-gate.proof.js',
  'gates/codex-config-edit-tool.proof.js',
];

function assertRequiredBuildArtifacts(outDir) {
  const missing = REQUIRED_DIST_ARTIFACTS.filter((rel) => !fs.existsSync(path.join(outDir, rel)));
  if (missing.length > 0) {
    throw new Error('missing required dist artifact(s): ' + missing.join(', '));
  }
}

function copyTree(srcRoot, destRoot, options = {}) {
  const skipRel = options.skipRel;
  const walk = (srcDir) => {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src = path.join(srcDir, entry.name);
      const rel = path.relative(srcRoot, src).split(path.sep).join('/');
      if (rel === skipRel) continue;
      const dest = path.join(destRoot, rel);
      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        walk(src);
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  };
  walk(srcRoot);
}

function publishBuildOutput(stagingOutDir, outDir) {
  const entrypointRel = 'server.js';
  fs.mkdirSync(outDir, { recursive: true });
  copyTree(stagingOutDir, outDir, { skipRel: entrypointRel });
  fs.copyFileSync(path.join(stagingOutDir, entrypointRel), path.join(outDir, entrypointRel));
}

function brokerSocketPath() {
  const value = process.env.ATOMIC_EXEC_BROKER_SOCKET;
  return value && value.trim() ? value : null;
}

function shellPath(value) {
  return JSON.stringify(String(value));
}

function canUseBrokerBuild(error) {
  return Boolean(brokerSocketPath()) && error && typeof error === 'object' &&
    (error.code === 'EPERM' || error.code === 'EACCES');
}

function runBuildViaBroker() {
  const socket = brokerSocketPath();
  if (!socket) throw new Error('build broker fallback unavailable: ATOMIC_EXEC_BROKER_SOCKET is unset' );
  const client = path.join(dir, 'atomic-exec-broker-client.mjs');
  const repoRoot = process.env.ATOMIC_HOST_WRITE_ROOT || path.dirname(path.dirname(path.dirname(dir)));
  const req = {
    command: shellPath(process.execPath) + ' ' + shellPath(fileURLToPath(import.meta.url)),
    cwd: dir,
    effectRoot: dir,
    timeoutMs: 120000,
    env: {
      ATOMIC_BUILD_BROKER: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
    },
  };
  const res = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: dir,
    encoding: 'utf8',
    input: JSON.stringify(req),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 125000,
  });
  if (res.error) throw res.error;
  try {
    return JSON.parse(res.stdout || '{}');
  } catch {
    throw new Error('build broker fallback returned unparseable output: ' + String(res.stdout).slice(0, 300));
  }
}

function ensureBuildWriteAccessOrDelegate() {
  if (process.env.ATOMIC_BUILD_BROKER === '1') return;
  const probe = path.join(dir, '.atomic-build-probe-' + process.pid + '.tmp');
  try {
    fs.writeFileSync(probe, '');
    fs.rmSync(probe, { force: true });
  } catch (e) {
    try { fs.rmSync(probe, { force: true }); } catch { }
    if (!canUseBrokerBuild(e)) throw e;
    const reply = runBuildViaBroker();
    if (reply.ok !== true) {
      process.stderr.write(String(reply.error || reply.stderr || 'atomic-edit broker build failed') + String.fromCharCode(10));
      process.exit(typeof reply.exitCode === 'number' ? reply.exitCode : 1);
    }
    if (typeof reply.stdout === 'string' && reply.stdout) process.stdout.write(reply.stdout);
    if (typeof reply.stderr === 'string' && reply.stderr) process.stderr.write(reply.stderr);
    process.exit(0);
  }
}
ensureBuildWriteAccessOrDelegate();

const options = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  types: ['node'],
  outDir: BUILD_OUT,
  rootDir: dir,
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  declaration: false,
  sourceMap: false,
};

// Compile into a private staging dir first. The live dist directory is an
// agent runtime surface: deleting it before emit creates a window where a
// concurrent MCP process can load server.js without its imported helpers.
function main() {
  fs.rmSync(BUILD_OUT, { recursive: true, force: true });
  fs.mkdirSync(BUILD_OUT, { recursive: true });

  const program = ts.createProgram(ENTRY, options);
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const fmt = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => dir,
      getCanonicalFileName: (f) => f,
      getNewLine: () => '\n',
    });
    process.stderr.write(fmt + `
atomic-edit build FAILED (${errors.length} error(s))
`);
    return 1;
  }

  fs.writeFileSync(path.join(BUILD_OUT, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
  for (const asset of ['worker-scope-check.mjs']) {
    fs.copyFileSync(path.join(dir, asset), path.join(BUILD_OUT, asset));
  }

  try {
    assertRequiredBuildArtifacts(BUILD_OUT);
  } catch (error) {
    process.stderr.write(`atomic-edit build FAILED: ${error instanceof Error ? error.message : String(error)}
`);
    return 1;
  }

  publishBuildOutput(BUILD_OUT, OUT);

  // Emit the build manifest (a sha256 over all engine .ts source) so the running
  // server / cert can detect when this dist is STALE vs current source — closing
  // the false-green-from-stale-dist hole. Best-effort: a manifest failure must not
  // fail an otherwise-successful build.
  try {
    writeManifest(dir);
  } catch (e) {
    process.stderr.write(`build: manifest write skipped: ${e instanceof Error ? e.message : String(e)}
`);
  }
  process.stderr.write(`atomic-edit build OK -> ${OUT}
`);
  return 0;
}

let exitCode = 1;
try {
  exitCode = main();
} catch (error) {
  process.stderr.write(`atomic-edit build FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  exitCode = 1;
} finally {
  fs.rmSync(BUILD_OUT, { recursive: true, force: true });
}
process.exitCode = exitCode;
