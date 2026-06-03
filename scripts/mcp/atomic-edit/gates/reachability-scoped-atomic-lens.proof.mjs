#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lensModule = await import(path.join(sourceDir, 'dist', 'gates', 'lens.js'));
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function writeFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-reachability-scoped-'));
try {
  for (let i = 0; i < 12050; i += 1) {
    writeFile(repoRoot, `outside/noise-${String(i).padStart(5, '0')}.ts`, `export const noise${i} = ${i};\n`);
  }

  const localSpec = './server-tools-lens';
  writeFile(
    repoRoot,
    'scripts/mcp/atomic-edit/server.ts',
    `import { registerToolsLens } from ${JSON.stringify(localSpec)};\nexport function boot(): void { registerToolsLens(); }\n`,
  );
  writeFile(
    repoRoot,
    'scripts/mcp/atomic-edit/server-tools-lens.ts',
    "export function registerToolsLens(): string { return 'lens'; }\n",
  );

  const report = await lensModule.runLens(repoRoot, 'scripts/mcp/atomic-edit/server-tools-lens.ts');
  const reachabilityEvidence = (report.unjudgedEvidence ?? []).filter((entry) => entry.gate === 'reachability');
  record('synthetic Atomic lens scanned the changed target', report.scanned === 1, { scanned: report.scanned });
  record(
    'Atomic-scoped lens reachability does not degrade to repo-wide cap',
    !report.unjudged.includes('reachability') && reachabilityEvidence.length === 0,
    { unjudged: report.unjudged, reachabilityEvidence },
  );
} finally {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else if (!payload.ok) process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
process.exit(payload.ok ? 0 : 1);
