#!/usr/bin/env node
/**
 * Structural proof for code_readcode_batch selector-error precision.
 *
 * Missing-path recovery is a latency optimization for hallucinated file paths.
 * It must not run when the path exists and only the selector is wrong; otherwise
 * a semantic read miss can inject unrelated recovered files and inflate context.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function main() {
  const results = [];
  const readcode = read('scripts/mcp/atomic-edit/server-tools-readcode.ts');
  record(results, 'missing-path recovery has an explicit filesystem-error predicate',
    readcode.includes('function isReadcodeMissingPathError(error: unknown): boolean') &&
    readcode.includes('ENOENT') &&
    readcode.includes('no such file or directory'));
  record(results, 'batch catch computes path recovery permission before suggestions',
    readcode.includes('const allowsMissingPathRecovery = isReadcodeMissingPathError(itemErr);'));
  record(results, 'selector errors receive no missingPathSuggestions',
    readcode.includes('const missingPathSuggestions = allowsMissingPathRecovery') &&
    readcode.includes('readcodeMissingPathSuggestions(item.path)') &&
    readcode.includes(': [];'));
  record(results, 'selector errors receive no recoveredResults loop',
    readcode.includes('if (allowsMissingPathRecovery) {') &&
    readcode.includes('for (const suggestion of missingPathSuggestions.slice(0, MISSING_PATH_RECOVERY_LIMIT))'));
  record(results, 'agent summary only advertises recoveredResults for actual recovered payloads',
    readcode.includes('failed.some((result: any) => Array.isArray(result.recoveredResults) && result.recoveredResults.length > 0)'));
  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
