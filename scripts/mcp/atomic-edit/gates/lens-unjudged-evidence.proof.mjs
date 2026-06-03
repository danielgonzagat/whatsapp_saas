#!/usr/bin/env node
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const lensModule = await import(path.join(sourceDir, 'dist', 'gates', 'lens.js'));
const report = await lensModule.runLens(repoRoot, 'scripts/mcp/atomic-edit');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

record('lens preserves legacy unjudged domain list', Array.isArray(report.unjudged), report.unjudged);
record('lens emits structured unjudged evidence list', Array.isArray(report.unjudgedEvidence), report.unjudgedEvidence);
record('every unjudged domain has structured evidence', report.unjudged.length === report.unjudgedEvidence.length, {
  unjudged: report.unjudged,
  unjudgedEvidence: report.unjudgedEvidence,
});
record(
  'every unjudged evidence item has gate and reason',
  report.unjudgedEvidence.every((entry) => typeof entry.gate === 'string' && entry.gate.length > 0 && typeof entry.reason === 'string' && entry.reason.length > 0),
  report.unjudgedEvidence,
);
record(
  'type-soundness unjudged reason is byte-auditable when present',
  !report.unjudged.includes('type-soundness') || report.unjudgedEvidence.some((entry) => entry.gate === 'type-soundness' && entry.reason.includes('MAX_CHANGED')),
  report.unjudgedEvidence.filter((entry) => entry.gate === 'type-soundness'),
);
record(
  'reachability unjudged reason is byte-auditable when present',
  !report.unjudged.includes('reachability') || report.unjudgedEvidence.some((entry) => entry.gate === 'reachability' && entry.reason.length > 20),
  report.unjudgedEvidence.filter((entry) => entry.gate === 'reachability'),
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else if (!payload.ok) process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
process.exit(payload.ok ? 0 : 1);
