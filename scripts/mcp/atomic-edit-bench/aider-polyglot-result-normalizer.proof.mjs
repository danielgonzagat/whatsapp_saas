#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const normalizerPath = path.join(here, 'aider-polyglot-result-normalizer.mjs');
const normalizer = await import(pathToFileURL(normalizerPath).href);
const { buildCombinedEvidenceResult, normalizeAiderResult, fixture, runCli } = normalizer;

const failedSmoke = normalizeAiderResult(fixture('failed-smoke'), {
  systemId: 'aider+deepseek-v4-pro',
  observedAt: '2026-06-16T21:24:00.000Z',
  artifactUrl: 'artifacts/atomic-edit-bench/atomic-deepseek-v4-pro-diff-pov-results.json',
});
assert.equal(failedSmoke.ok, true);
assert.equal(failedSmoke.benchmarkId, 'aider-polyglot');
assert.equal(failedSmoke.model, 'deepseek/deepseek-v4-pro');
assert.equal(failedSmoke.editFormat, 'diff');
assert.equal(failedSmoke.completedCases, 1);
assert.equal(failedSmoke.passedCases, 0);
assert.equal(failedSmoke.samplePassRatePct, 0);
assert.equal(failedSmoke.completePublicRun, false);
assert.equal(failedSmoke.claimEligible, false);
assert.match(failedSmoke.blockers.join('\n'), /incomplete run: 1 of 225 cases/);
assert.match(failedSmoke.blockers.join('\n'), /system is not Atomic/);

const winningAtomic = normalizeAiderResult(fixture('complete-winning-atomic-run'), {
  systemId: 'atomic+deepseek-v4-pro',
  observedAt: '2026-06-16T21:30:00.000Z',
  artifactUrl: 'https://example.invalid/atomic/aider-polyglot/run.json',
});
assert.equal(winningAtomic.completePublicRun, true);
assert.equal(winningAtomic.claimEligible, true);
assert.equal(winningAtomic.samplePassRatePct, 100);
assert.deepEqual(winningAtomic.blockers, []);

const cliPayload = runCli(
  ['--json', '--system-id', 'aider+deepseek-v4-pro', '--artifact-url', 'artifacts/result.json', '--observed-at', '2026-06-16T21:24:00.000Z'],
  JSON.stringify(fixture('failed-smoke')),
);
assert.equal(cliPayload.ok, true);
assert.equal(cliPayload.claimEligible, false);
assert.equal(cliPayload.systemId, 'aider+deepseek-v4-pro');

const combinedSources = [
  {
    sourcePath: 'artifacts/python.json',
    sourceSha256: 'a'.repeat(64),
    rawResult: {
      testcase: 'python/*',
      model: 'deepseek-v4-pro',
      edit_format: 'atomic-validated-full-file',
      tests_outcomes: Array.from({ length: 100 }, () => true),
      total_tests: 225,
      duration: 10,
      prompt_tokens: 100,
      completion_tokens: 10,
      syntax_errors: 0,
      num_malformed_responses: 0,
      atomic_batch: { language: 'python', cases: [] },
    },
  },
  {
    sourcePath: 'artifacts/rust.json',
    sourceSha256: 'b'.repeat(64),
    rawResult: {
      testcase: 'rust/*',
      model: 'deepseek-v4-pro',
      edit_format: 'atomic-validated-full-file',
      tests_outcomes: Array.from({ length: 125 }, () => true),
      total_tests: 225,
      duration: 20,
      prompt_tokens: 200,
      completion_tokens: 20,
      syntax_errors: 0,
      num_malformed_responses: 1,
      atomic_batch: { language: 'rust', cases: [] },
    },
  },
];
const combined = buildCombinedEvidenceResult(combinedSources, {
  systemId: 'atomic+deepseek-v4-pro',
  observedAt: '2026-06-17T12:00:00.000Z',
  artifactUrl: 'https://example.invalid/atomic/aider-polyglot/combined.json',
});
assert.equal(combined.ok, true);
assert.equal(combined.evidenceKind, 'combined-subset-artifacts');
assert.equal(combined.combinedRawResult.tests_outcomes.length, 225);
assert.equal(combined.combinedRawResult.atomic_combined_evidence.sourceArtifactCount, 2);
assert.equal(combined.combinedRawResult.atomic_combined_evidence.packageSha256.length, 64);
assert.equal(combined.normalized.completePublicRun, true);
assert.equal(combined.normalized.fullRunPassRatePct, 100);
assert.equal(combined.normalized.claimEligible, false);
assert.match(combined.normalized.blockers.join('\n'), /combined subset evidence is not a single public Aider run/);
const combinedCli = runCli([
  '--combine-evidence',
  '--system-id', 'atomic+deepseek-v4-pro',
  '--observed-at', '2026-06-17T12:00:00.000Z',
  '--artifact-url', 'https://example.invalid/atomic/aider-polyglot/combined.json',
], JSON.stringify(combinedSources.map((source) => source.rawResult)));
assert.equal(combinedCli.combinedRawResult.tests_outcomes.length, 225);
assert.equal(combinedCli.normalized.claimEligible, false);

const realArtifact = path.join(here, '../../../artifacts/atomic-edit-bench/atomic-deepseek-v4-pro-diff-pov-results.json');
if (fs.existsSync(realArtifact)) {
  const real = runCli(['--json', '--system-id', 'aider+deepseek-v4-pro', realArtifact], '');
  assert.equal(real.ok, true);
  assert.equal(real.model, 'deepseek/deepseek-v4-pro');
  assert.equal(real.editFormat, 'diff');
  assert.equal(real.completedCases, 1);
}

console.log(JSON.stringify({ ok: true, proof: 'aider-polyglot-result-normalizer', checked: 5 }, null, 2));
