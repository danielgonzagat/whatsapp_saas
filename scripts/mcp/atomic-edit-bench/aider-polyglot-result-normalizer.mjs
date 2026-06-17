#!/usr/bin/env node
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NORMALIZER_ID = 'atomic-aider-polyglot-result-normalizer-v1';
export const AIDER_POLYGLOT_TOTAL_CASES = 225;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finitePositiveInteger(value, fallback) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) return number;
  return fallback;
}

function pct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(3));
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validIsoDate(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

function isAtomicSystem(systemId) {
  return typeof systemId === 'string' && /^atomic(?:$|[+:/-])/i.test(systemId);
}

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseArgs(argv) {
  const options = { json: false, files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--combine-evidence') {
      options.combineEvidence = true;
    } else if (arg === '--system-id') {
      options.systemId = argv[++index];
    } else if (arg === '--artifact-url') {
      options.artifactUrl = argv[++index];
    } else if (arg === '--observed-at') {
      options.observedAt = argv[++index];
    } else if (arg === '--total-cases') {
      options.totalCases = Number(argv[++index]);
    } else if (arg === '--leaderboard-url') {
      options.leaderboardUrl = argv[++index];
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.files.push(arg);
    }
  }
  return options;
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJsonSources(files, stdinText) {
  if (files.length > 0) {
    return files.map((file) => ({
      sourcePath: file,
      sourceSha256: sha256File(file),
      rawResult: JSON.parse(fs.readFileSync(file, 'utf8')),
    }));
  }
  const trimmed = stdinText.trim();
  if (!trimmed) throw new Error('No Aider result JSON provided on stdin or as a file path');
  const parsed = JSON.parse(trimmed);
  const inputs = Array.isArray(parsed) ? parsed : [parsed];
  return inputs.map((rawResult, index) => ({
    sourcePath: null,
    sourceIndex: index,
    sourceSha256: sha256Text(JSON.stringify(rawResult)),
    rawResult,
  }));
}

function readJsonInput(files, stdinText) {
  return readJsonSources(files, stdinText).map((source) => source.rawResult);
}

function numericSum(values, key) {
  return values.reduce((total, value) => total + (Number.isFinite(value?.[key]) ? value[key] : 0), 0);
}

function sourceLanguage(rawResult, sourcePath) {
  const explicit = stringOrNull(rawResult?.atomic_batch?.language);
  if (explicit) return explicit;
  const testcase = stringOrNull(rawResult?.testcase);
  if (testcase && testcase.includes('/')) return testcase.split('/')[0];
  const pathMatch = String(sourcePath ?? '').match(/(?:^|[-/])(python|cpp|go|java|javascript|rust)(?:[-/]|$)/i);
  return pathMatch ? pathMatch[1].toLowerCase() : 'unknown';
}

function uniqueOrMixed(values) {
  const unique = [...new Set(values.filter((value) => typeof value === 'string' && value.trim() !== ''))];
  if (unique.length === 0) return 'unknown';
  return unique.length === 1 ? unique[0] : `mixed:${unique.join(',')}`;
}

function resultOutcomes(rawResult) {
  return Array.isArray(rawResult?.tests_outcomes) ? rawResult.tests_outcomes : [];
}

export function buildCombinedEvidenceResult(sources, options = {}) {
  const entries = sources.map((source) => {
    const rawResult = source.rawResult;
    const outcomes = resultOutcomes(rawResult);
    const language = sourceLanguage(rawResult, source.sourcePath);
    const failedCases = rawResult?.atomic_batch?.cases
      ?.filter((item) => item && item.ok === false)
      .map((item) => item.testcase)
      ?? [];
    return {
      language,
      sourcePath: source.sourcePath,
      sourceIndex: source.sourceIndex,
      sourceSha256: source.sourceSha256,
      testcase: stringOrNull(rawResult?.testcase) ?? `${language}/*`,
      completedCases: outcomes.length,
      passedCases: outcomes.filter(Boolean).length,
      failedCases,
      durationSeconds: Number.isFinite(rawResult?.duration) ? Number(rawResult.duration.toFixed(3)) : null,
      promptTokens: Number.isFinite(rawResult?.prompt_tokens) ? rawResult.prompt_tokens : 0,
      completionTokens: Number.isFinite(rawResult?.completion_tokens) ? rawResult.completion_tokens : 0,
      syntaxErrors: Number.isFinite(rawResult?.syntax_errors) ? rawResult.syntax_errors : 0,
      malformedResponses: Number.isFinite(rawResult?.num_malformed_responses) ? rawResult.num_malformed_responses : 0,
      testTimeouts: Number.isFinite(rawResult?.test_timeouts) ? rawResult.test_timeouts : 0,
    };
  }).sort((left, right) => left.language.localeCompare(right.language));
  const rawResults = entries.map((entry) => sources.find((source) => source.sourceSha256 === entry.sourceSha256)?.rawResult);
  const testsOutcomes = sources.flatMap((source) => resultOutcomes(source.rawResult));
  const totalCases = finitePositiveInteger(options.totalCases, AIDER_POLYGLOT_TOTAL_CASES);
  const combinedRawResult = {
    testcase: 'polyglot-combined-subsets',
    model: uniqueOrMixed(sources.map((source) => source.rawResult?.model)),
    edit_format: uniqueOrMixed(sources.map((source) => source.rawResult?.edit_format)),
    tests_outcomes: testsOutcomes,
    total_tests: totalCases,
    duration: numericSum(rawResults, 'duration'),
    prompt_tokens: numericSum(rawResults, 'prompt_tokens'),
    completion_tokens: numericSum(rawResults, 'completion_tokens'),
    syntax_errors: numericSum(rawResults, 'syntax_errors'),
    indentation_errors: numericSum(rawResults, 'indentation_errors'),
    lazy_comments: numericSum(rawResults, 'lazy_comments'),
    test_timeouts: numericSum(rawResults, 'test_timeouts'),
    num_malformed_responses: numericSum(rawResults, 'num_malformed_responses'),
    atomic_combined_evidence: {
      evidenceKind: 'combined-subset-artifacts',
      sourceArtifactCount: entries.length,
      completedCases: testsOutcomes.length,
      passedCases: testsOutcomes.filter(Boolean).length,
      totalCases,
      sourceArtifacts: entries,
      packageSha256: sha256Text(JSON.stringify(entries)),
    },
  };
  const normalized = normalizeAiderResult(combinedRawResult, options);
  return {
    ok: true,
    normalizerId: NORMALIZER_ID,
    benchmarkId: 'aider-polyglot',
    evidenceKind: 'combined-subset-artifacts',
    claimEligible: false,
    combinedRawResult,
    normalized,
    blockers: normalized.blockers,
  };
}

export function normalizeAiderResult(rawResult, options = {}) {
  if (!isObject(rawResult)) {
    throw new TypeError('Aider result must be a JSON object');
  }

  const outcomes = Array.isArray(rawResult.tests_outcomes) ? rawResult.tests_outcomes : [];
  const completedCases = outcomes.length;
  const passedCases = outcomes.filter(Boolean).length;
  const totalCases = finitePositiveInteger(options.totalCases ?? rawResult.total_tests, AIDER_POLYGLOT_TOTAL_CASES);
  const model = stringOrNull(rawResult.model) ?? 'unknown-model';
  const editFormat = stringOrNull(rawResult.edit_format) ?? 'unknown-edit-format';
  const testcase = stringOrNull(rawResult.testcase) ?? 'unknown-testcase';
  const systemId = stringOrNull(options.systemId) ?? `${model}:${editFormat}`;
  const artifactUrl = stringOrNull(options.artifactUrl);
  const observedAt = stringOrNull(options.observedAt);
  const leaderboardUrl = stringOrNull(options.leaderboardUrl) ?? 'https://aider.chat/docs/leaderboards/';
  const completePublicRun = completedCases >= totalCases;

  const blockers = [];
  if (completedCases === 0) blockers.push('no completed Aider cases');
  if (!completePublicRun) blockers.push(`incomplete run: ${completedCases} of ${totalCases} cases`);
  if (!isAtomicSystem(systemId)) blockers.push('system is not Atomic');
  if (!isHttpUrl(artifactUrl)) blockers.push('missing public artifact URL');
  if (!validIsoDate(observedAt)) blockers.push('missing observedAt timestamp');
  if (rawResult.atomic_combined_evidence?.evidenceKind === 'combined-subset-artifacts') {
    blockers.push('combined subset evidence is not a single public Aider run');
  }

  return {
    ok: true,
    normalizerId: NORMALIZER_ID,
    benchmarkId: 'aider-polyglot',
    source: 'aider .aider.results.json',
    metric: 'case_pass_pct',
    higherIsBetter: true,
    systemId,
    model,
    editFormat,
    testcase,
    completedCases,
    passedCases,
    totalCases,
    samplePassRatePct: pct(passedCases, completedCases),
    fullRunPassRatePct: pct(passedCases, totalCases),
    completePublicRun,
    claimEligible: blockers.length === 0,
    artifactUrl,
    observedAt,
    leaderboardUrl,
    durationSeconds: Number.isFinite(rawResult.duration) ? Number(rawResult.duration.toFixed(3)) : null,
    promptTokens: Number.isFinite(rawResult.prompt_tokens) ? rawResult.prompt_tokens : null,
    completionTokens: Number.isFinite(rawResult.completion_tokens) ? rawResult.completion_tokens : null,
    syntaxErrors: Number.isFinite(rawResult.syntax_errors) ? rawResult.syntax_errors : null,
    indentationErrors: Number.isFinite(rawResult.indentation_errors) ? rawResult.indentation_errors : null,
    lazyComments: Number.isFinite(rawResult.lazy_comments) ? rawResult.lazy_comments : null,
    blockers,
  };
}

export function fixture(kind) {
  if (kind === 'failed-smoke') {
    return {
      testcase: 'pov',
      model: 'deepseek/deepseek-v4-pro',
      edit_format: 'diff',
      tests_outcomes: [false],
      duration: 106.80190467834473,
      prompt_tokens: 2844,
      completion_tokens: 8310,
      syntax_errors: 0,
      indentation_errors: 0,
      lazy_comments: 0,
    };
  }

  if (kind === 'complete-winning-atomic-run') {
    return {
      testcase: 'polyglot-full-suite',
      model: 'deepseek/deepseek-v4-pro',
      edit_format: 'atomic',
      tests_outcomes: Array.from({ length: AIDER_POLYGLOT_TOTAL_CASES }, () => true),
      duration: 1000,
      prompt_tokens: 100000,
      completion_tokens: 50000,
      syntax_errors: 0,
      indentation_errors: 0,
      lazy_comments: 0,
    };
  }

  throw new Error(`Unknown fixture: ${kind}`);
}

export function runCli(argv = [], stdinText = '') {
  const options = parseArgs(argv);
  if (options.combineEvidence) {
    return buildCombinedEvidenceResult(readJsonSources(options.files, stdinText), options);
  }
  const inputs = readJsonInput(options.files, stdinText);
  const results = inputs.map((input) => normalizeAiderResult(input, options));
  return results.length === 1 ? results[0] : { ok: true, normalizerId: NORMALIZER_ID, results };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const stdinText = process.stdin.isTTY ? '' : fs.readFileSync(0, 'utf8');
  const payload = runCli(process.argv.slice(2), stdinText);
  console.log(JSON.stringify(payload, null, 2));
}
