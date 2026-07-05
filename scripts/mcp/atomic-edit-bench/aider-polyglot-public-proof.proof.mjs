#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname);
const proofPath = path.join(here, 'aider-polyglot-public-proof.mjs');
const {
  collectPublicProof,
  renderPublicProofMarkdown,
  runCli,
} = await import(pathToFileURL(proofPath).href);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function makeCase(testcase, ok = true, extra = {}) {
  return {
    testcase,
    model: 'deepseek-v4-pro',
    tests_outcomes: [ok],
    test_timeouts: 0,
    duration: 1.25,
    syntax_errors: 0,
    indentation_errors: 0,
    num_malformed_responses: 0,
    deepseek_generation: { repairAttempts: 0, candidateSha256: `candidate-${testcase}` },
    ...extra,
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-polyglot-public-proof-'));
const runDir = path.join(root, 'run');
const casesDir = path.join(runDir, 'cases');
fs.mkdirSync(casesDir, { recursive: true });
writeJson(path.join(casesDir, 'cpp-two-fer.json'), makeCase('cpp/two-fer'));
writeJson(path.join(casesDir, 'rust-book-store.json'), makeCase('rust/book-store'));
writeJson(path.join(runDir, 'all-225.json'), {
  testcase: 'all/*',
  model: 'deepseek-v4-pro',
  tests_outcomes: [true, true],
  duration: 2.5,
  test_timeouts: 0,
  batchRunnerId: 'atomic-aider-polyglot-deepseek-batch-runner-v1',
});

const runnerRoot = path.join(root, 'runner-root');
const runnerDir = path.join(runnerRoot, 'scripts/mcp/atomic-edit-bench');
fs.mkdirSync(runnerDir, { recursive: true });
for (const file of [
  'aider-polyglot-deepseek-runner.mjs',
  'aider-polyglot-deepseek-runner.proof.mjs',
  'aider-polyglot-deepseek-batch-runner.mjs',
  'aider-polyglot-deepseek-batch-runner.proof.mjs',
]) {
  fs.writeFileSync(path.join(runnerDir, file), `${file}\n`);
}

const proof = collectPublicProof({
  runDir,
  runnerRoot,
  expectedTotal: 2,
  expectedModel: 'deepseek-v4-pro',
  expectedLanguageCounts: { cpp: 1, rust: 1 },
  benchmarkSource: {
    name: 'Aider Polyglot Benchmark',
    url: 'https://github.com/Aider-AI/polyglot-benchmark',
    commit: '7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f',
  },
  atomicSource: {
    repositoryCommit: '7a5f30623b95e06bf47dd61f9ac0c2e432a0d71b',
  },
  leaderboardReference: {
    url: 'https://aider.chat/docs/leaderboards/',
    currentLeader: 'gpt-5 (high)',
    currentLeaderScore: 88.0,
    metric: 'pass_rate_2_pct',
    observedAt: '2026-06-17',
  },
});
assert.equal(proof.ok, true);
assert.equal(proof.summary.totalCases, 2);
assert.equal(proof.summary.passedCases, 2);
assert.deepEqual(proof.summary.languageCounts, { cpp: 1, rust: 1 });
assert.equal(proof.summary.model, 'deepseek-v4-pro');
assert.equal(proof.validation.errors.length, 0);
assert.equal(proof.cases.length, 2);
assert.match(proof.manifest.caseListSha256, /^[a-f0-9]{64}$/);
assert.match(proof.manifest.caseArtifactSetSha256, /^[a-f0-9]{64}$/);
assert.equal(Object.keys(proof.atomic.runnerFileSha256).length, 4);

const markdown = renderPublicProofMarkdown(proof);
assert.match(markdown, /225\/225|2\/2/);
assert.match(markdown, /Aider Polyglot Benchmark/);
assert.match(markdown, /deepseek-v4-pro/);
assert.match(markdown, /cpp\s*\|\s*1\s*\|\s*1/);
assert.match(markdown, /Public Leaderboard Reference/);
assert.match(markdown, /gpt-5 \(high\)/);
assert.match(markdown, /88\.0/);
assert.match(markdown, /100\.0%|100%/);
assert.match(markdown, /--leaderboard-url/);
assert.match(markdown, /rust\s*\|\s*1\s*\|\s*1/);

writeJson(path.join(casesDir, 'rust-book-store.json'), makeCase('rust/book-store', false, { syntax_errors: 1 }));
const failedProof = collectPublicProof({
  runDir,
  runnerRoot,
  expectedTotal: 2,
  expectedModel: 'deepseek-v4-pro',
  expectedLanguageCounts: { cpp: 1, rust: 1 },
});
assert.equal(failedProof.ok, false);
assert.match(failedProof.validation.errors.join('\n'), /rust\/book-store/);

writeJson(path.join(casesDir, 'rust-book-store.json'), makeCase('rust/book-store'));
const outJson = path.join(root, 'proof.json');
const outMarkdown = path.join(root, 'proof.md');
const cliResult = await runCli([
  '--run-dir', runDir,
  '--runner-root', runnerRoot,
  '--expected-total', '2',
  '--expected-model', 'deepseek-v4-pro',
  '--expected-language-counts-json', JSON.stringify({ cpp: 1, rust: 1 }),
  '--benchmark-name', 'Aider Polyglot Benchmark',
  '--benchmark-url', 'https://github.com/Aider-AI/polyglot-benchmark',
  '--benchmark-commit', '7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f',
  '--atomic-repository-commit', '7a5f30623b95e06bf47dd61f9ac0c2e432a0d71b',
  '--leaderboard-url', 'https://aider.chat/docs/leaderboards/',
  '--leaderboard-current-leader', 'gpt-5 (high)',
  '--leaderboard-current-leader-score', '88.0',
  '--leaderboard-metric', 'pass_rate_2_pct',
  '--leaderboard-observed-at', '2026-06-17',
  '--out-json', outJson,
  '--out-md', outMarkdown,
]);
assert.equal(cliResult.ok, true);
assert.equal(JSON.parse(fs.readFileSync(outJson, 'utf8')).ok, true);
assert.match(fs.readFileSync(outMarkdown, 'utf8'), /Reproduction command/);

assert.equal(JSON.parse(fs.readFileSync(outJson, 'utf8')).leaderboardReference.currentLeaderScore, 88);
assert.match(fs.readFileSync(outMarkdown, 'utf8'), /Public Leaderboard Reference/);
console.log(JSON.stringify({ ok: true, proof: 'aider-polyglot-public-proof', checked: 17 }, null, 2));
