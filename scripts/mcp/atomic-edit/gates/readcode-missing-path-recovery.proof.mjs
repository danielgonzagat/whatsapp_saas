#!/usr/bin/env node
/**
 * Structural proof for code_readcode_batch missing-path recovery.
 *
 * This gate locks the generic capability shape: bounded candidate scan, path
 * topology scoring, recovered readCode payloads, and summary guidance that tells
 * agents to inspect recoveredResults before glob/list retries. Runtime behavior
 * is exercised by the standard build plus MCP read gates; this file prevents the
 * operator from regressing back to raw ENOENT-only batch failures.
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
  record(results, 'recovery budgets are bounded and explicit',
    readcode.includes('MISSING_PATH_SCAN_LIMIT = 500') &&
    readcode.includes('MISSING_PATH_SUGGESTION_LIMIT = 6') &&
    readcode.includes('MISSING_PATH_RECOVERY_LIMIT = 3') &&
    readcode.includes('MISSING_PATH_RECOVERY_BUDGET = 18000') &&
    readcode.includes('MISSING_PATH_SCORE_MIN = 18'));
  record(results, 'candidate scan is generic and workspace-scoped',
    readcode.includes('function collectReadcodeCandidateFiles(root = activeWorkspaceRoot()') &&
    readcode.includes('SHALLOW_TREE_SKIP.has(entry.name)') &&
    readcode.includes('MISSING_PATH_READABLE_EXTENSIONS.has(ext)') &&
    readcode.includes('compactReadcodePath(abs)'));
  record(results, 'path topology scoring is not benchmark hardcoded',
    readcode.includes('function scoreMissingReadcodePath') &&
    readcode.includes('same filename') &&
    readcode.includes('same filename stem') &&
    readcode.includes('shared path token(s)') &&
    readcode.includes('requested directory token appears in candidate path') &&
    !readcode.includes('round078') &&
    !readcode.includes('WorkflowScheduler.test.ts'));
  record(results, 'filesystem-missing batch items carry guarded suggestions and recovered readCode payloads',
    readcode.includes('function isReadcodeMissingPathError(error: unknown): boolean') &&
    readcode.includes('const allowsMissingPathRecovery = isReadcodeMissingPathError(itemErr);') &&
    readcode.includes('const missingPathSuggestions = allowsMissingPathRecovery') &&
    readcode.includes('readcodeMissingPathSuggestions(item.path)') &&
    readcode.includes('if (allowsMissingPathRecovery) {') &&
    readcode.includes('const recoveredResults: Record<string, unknown>[] = []') &&
    readcode.includes('await readcodeRecoveredFileContext(suggestion.path, fullLimit)') &&
    readcode.includes('recoveredFromMissingPath: item.path') &&
    readcode.includes('missingPathSuggestionScore: suggestion.score'));
  record(results, 'recovered context preserves readCode target and hash shape',
    readcode.includes('function readcodeRecoveredFileContext') &&
    readcode.includes('...readcodeTargetDetails(displayPath)') &&
    readcode.includes('fileSha256: fileSha') &&
    readcode.includes('symbolSelectors: o.symbols.map((symbol) => symbol.selector)') &&
    readcode.includes('compactSignatures: formatSignaturesCompact'));
  record(results, 'agent-facing summary advertises recoveredResults fast path',
    readcode.includes('Some missing paths include recoveredResults from high-confidence real files') &&
    readcode.includes('inspect them before issuing glob/list retries'));
  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
