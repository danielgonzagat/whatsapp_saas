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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('typescript');

const ENTRY = [
  'server.ts',
  'engine.ts',
  'guard.ts',
  'nav.ts',
  'symbols.ts',
  'advanced.ts',
  'trace.ts',
  'textunit.ts',
  'founder.ts',
  'smoke.ts',
].map((f) => path.join(dir, f));
const OUT = path.join(dir, 'dist');

const options = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  types: ['node'],
  outDir: OUT,
  rootDir: dir,
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  declaration: false,
  sourceMap: false,
};

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
  process.stderr.write(fmt + `\natomic-edit build FAILED (${errors.length} error(s))\n`);
  process.exit(1);
}
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
for (const asset of ['worker-scope-check.mjs']) {
  fs.copyFileSync(path.join(dir, asset), path.join(OUT, asset));
}
process.stderr.write(`atomic-edit build OK -> ${OUT}\n`);
