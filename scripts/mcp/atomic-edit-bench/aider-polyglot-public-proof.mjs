#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_PROOF_ID = 'atomic-deepseek-v4-pro-aider-polyglot-public-proof-v1';

const RUNNER_FILES = [
  'scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-runner.mjs',
  'scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-runner.proof.mjs',
  'scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-batch-runner.mjs',
  'scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-batch-runner.proof.mjs',
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeCounts(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return JSON.parse(value);
  if (!isObject(value)) throw new Error('expected language counts object');
  const out = {};
  for (const [key, count] of Object.entries(value)) {
    const number = Number(count);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`invalid count for ${key}: ${count}`);
    out[key] = number;
  }
  return out;
}

function testcaseLanguage(testcase, fallbackFile) {
  const text = String(testcase || fallbackFile || 'unknown');
  return text.split('/')[0].split('-')[0];
}

function casePassed(result) {
  return Array.isArray(result.tests_outcomes)
    && result.tests_outcomes.length > 0
    && result.tests_outcomes.every(Boolean)
    && Number(result.test_timeouts || 0) === 0;
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function compactCaseRecord({ file, hash, result }) {
  const testcase = String(result.testcase || file.replace(/\.json$/i, ''));
  const language = testcaseLanguage(testcase, file);
  return {
    file,
    sha256: hash,
    testcase,
    language,
    passed: casePassed(result),
    tests_outcomes: Array.isArray(result.tests_outcomes) ? result.tests_outcomes : [],
    test_timeouts: Number(result.test_timeouts || 0),
    duration: Number(result.duration || 0),
    repairAttempts: Number(result.deepseek_generation?.repairAttempts || 0),
    syntax_errors: Number(result.syntax_errors || 0),
    indentation_errors: Number(result.indentation_errors || 0),
    malformed_responses: Number(result.num_malformed_responses || 0),
    model: result.model || result.deepseek_generation?.model || null,
    candidateSha256: result.deepseek_generation?.candidateSha256 || null,
  };
}

function collectCaseArtifacts(runDir) {
  const casesDir = path.join(runDir, 'cases');
  if (!fs.existsSync(casesDir)) throw new Error(`missing cases directory: ${casesDir}`);
  const files = fs.readdirSync(casesDir).filter((file) => file.endsWith('.json')).sort();
  return files.map((file) => {
    const absolute = path.join(casesDir, file);
    const raw = fs.readFileSync(absolute, 'utf8');
    return compactCaseRecord({ file, hash: sha256Text(raw), result: JSON.parse(raw) });
  });
}

function collectRunnerHashes(runnerRoot) {
  const hashes = {};
  for (const rel of RUNNER_FILES) {
    const absolute = path.join(runnerRoot, rel);
    hashes[rel] = fs.existsSync(absolute) ? sha256File(absolute) : null;
  }
  return hashes;
}

function validateCounts(actual, expected, errors, label) {
  if (!expected) return;
  for (const [key, count] of Object.entries(expected)) {
    if ((actual[key] || 0) !== count) errors.push(`${label} ${key}: expected ${count}, got ${actual[key] || 0}`);
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) errors.push(`${label} ${key}: unexpected count ${actual[key]}`);
  }
}

export function collectPublicProof(options = {}) {
  const runDir = path.resolve(String(options.runDir || '.'));
  const runnerRoot = path.resolve(String(options.runnerRoot || process.cwd()));
  const expectedTotal = options.expectedTotal === undefined ? undefined : Number(options.expectedTotal);
  const expectedModel = options.expectedModel ? String(options.expectedModel) : undefined;
  const expectedLanguageCounts = normalizeCounts(options.expectedLanguageCounts);
  const summaryFile = path.join(runDir, 'all-225.json');
  const summaryRaw = fs.existsSync(summaryFile) ? fs.readFileSync(summaryFile, 'utf8') : '';
  const summaryJson = summaryRaw ? JSON.parse(summaryRaw) : null;
  const cases = collectCaseArtifacts(runDir);
  const languageCounts = {};
  const languagePassed = {};
  const failingCases = [];
  let totalDuration = 0;

  for (const item of cases) {
    increment(languageCounts, item.language);
    if (item.passed) increment(languagePassed, item.language);
    else failingCases.push(item.testcase);
    totalDuration += item.duration;
  }

  const errors = [];
  const warnings = [];
  const passedCases = cases.length - failingCases.length;
  const model = summaryJson?.model || cases.find((item) => item.model)?.model || null;
  const summaryOutcomes = Array.isArray(summaryJson?.tests_outcomes) ? summaryJson.tests_outcomes : [];

  if (expectedTotal !== undefined && cases.length !== expectedTotal) errors.push(`expected ${expectedTotal} case artifacts, found ${cases.length}`);
  if (expectedTotal !== undefined && summaryOutcomes.length !== expectedTotal) errors.push(`expected ${expectedTotal} summary outcomes, found ${summaryOutcomes.length}`);
  if (summaryOutcomes.length > 0 && !summaryOutcomes.every(Boolean)) errors.push('summary tests_outcomes contains a failing value');
  if (failingCases.length > 0) errors.push(`failing cases: ${failingCases.join(', ')}`);
  if (expectedModel && model !== expectedModel) errors.push(`expected model ${expectedModel}, got ${model || 'unknown'}`);
  if (summaryJson && summaryJson.testcase !== 'all/*') warnings.push(`summary testcase is ${summaryJson.testcase}, expected all/*`);
  validateCounts(languageCounts, expectedLanguageCounts, errors, 'language count');

  const caseIdentity = cases.map((item) => ({ file: item.file, testcase: item.testcase, sha256: item.sha256, passed: item.passed }));
  const caseArtifactSet = cases.map((item) => `${item.file}\t${item.sha256}\t${item.testcase}\t${item.passed}`).join('\n');
  const benchmarkSource = {
    name: options.benchmarkSource?.name || options.benchmarkName || 'Aider Polyglot Benchmark',
    url: options.benchmarkSource?.url || options.benchmarkUrl || 'https://github.com/Aider-AI/polyglot-benchmark',
    commit: options.benchmarkSource?.commit || options.benchmarkCommit || null,
  };
  const atomicSource = {
    repositoryCommit: options.atomicSource?.repositoryCommit || options.atomicRepositoryCommit || null,
    runnerRoot,
  };
  const leaderboardReference = options.leaderboardReference || (options.leaderboardUrl ? {
    url: options.leaderboardUrl,
    currentLeader: options.leaderboardCurrentLeader || null,
    currentLeaderScore: options.leaderboardCurrentLeaderScore === undefined ? null : Number(options.leaderboardCurrentLeaderScore),
    metric: options.leaderboardMetric || null,
    observedAt: options.leaderboardObservedAt || null,
  } : null);

  return {
    ok: errors.length === 0,
    proofId: PUBLIC_PROOF_ID,
    generatedAt: new Date().toISOString(),
    benchmarkSource,
    leaderboardReference,
    atomicSource,
    summary: {
      runDir,
      model,
      totalCases: cases.length,
      passedCases,
      failedCases: failingCases.length,
      languageCounts: sortedObject(languageCounts),
      languagePassed: sortedObject(languagePassed),
      runDurationSeconds: Number(summaryJson?.duration || totalDuration || 0),
      caseDurationTotalSeconds: Number(totalDuration.toFixed(3)),
      summaryOutcomeCount: summaryOutcomes.length,
    },
    validation: { errors, warnings },
    manifest: {
      all225Path: summaryFile,
      all225Sha256: summaryRaw ? sha256Text(summaryRaw) : null,
      caseListSha256: sha256Text(JSON.stringify(caseIdentity)),
      caseArtifactSetSha256: sha256Text(caseArtifactSet),
      expectedTotal: expectedTotal ?? null,
      expectedModel: expectedModel ?? null,
      expectedLanguageCounts: expectedLanguageCounts ? sortedObject(expectedLanguageCounts) : null,
    },
    atomic: {
      runnerFileSha256: collectRunnerHashes(runnerRoot),
    },
    cases,
  };
}

function markdownTable(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

export function renderPublicProofMarkdown(proof) {
  const languageRows = [
    ['Language', 'Cases', 'Passed'],
    ['---', '---:', '---:'],
    ...Object.keys(proof.summary.languageCounts).sort().map((language) => [
      language,
      String(proof.summary.languageCounts[language]),
      String(proof.summary.languagePassed[language] || 0),
    ]),
  ];
  const runnerRows = [
    ['File', 'SHA-256'],
    ['---', '---'],
    ...Object.entries(proof.atomic.runnerFileSha256).map(([file, hash]) => [file, hash || 'missing']),
  ];
  const validation = proof.ok
    ? 'PASS'
    : `FAIL: ${proof.validation.errors.join('; ')}`;
  const publicScore = proof.summary.totalCases > 0
    ? (100 * proof.summary.passedCases) / proof.summary.totalCases
    : 0;
  const formatScore = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : String(value ?? 'not recorded');
  const leaderboard = proof.leaderboardReference;
  const leaderboardSection = leaderboard ? [
    '## Public Leaderboard Reference',
    '',
    `- URL: ${leaderboard.url}`,
    `- Checked: ${leaderboard.observedAt || 'not recorded'}`,
    `- Current listed leader: ${leaderboard.currentLeader || 'not recorded'}`,
    `- Current listed score: ${formatScore(leaderboard.currentLeaderScore)}${leaderboard.metric ? ` ${leaderboard.metric}` : ''}`,
    `- Atomic artifact score: ${formatScore(publicScore)}% (${proof.summary.passedCases}/${proof.summary.totalCases})`,
    '',
    '',
  ].join('\n') : '';
  const leaderboardCommandArgs = leaderboard ? [
    `  --leaderboard-url '${leaderboard.url}'`,
    `  --leaderboard-current-leader '${leaderboard.currentLeader}'`,
    `  --leaderboard-current-leader-score ${formatScore(leaderboard.currentLeaderScore)}`,
    `  --leaderboard-metric ${leaderboard.metric}`,
    `  --leaderboard-observed-at ${leaderboard.observedAt}`,
  ] : [];
  const reproductionCommand = [
    'node scripts/mcp/atomic-edit-bench/aider-polyglot-public-proof.mjs',
    `  --run-dir ${proof.summary.runDir}`,
    `  --expected-total ${proof.manifest.expectedTotal ?? proof.summary.totalCases}`,
    `  --expected-model ${proof.manifest.expectedModel ?? proof.summary.model}`,
    `  --expected-language-counts-json '${JSON.stringify(proof.manifest.expectedLanguageCounts ?? proof.summary.languageCounts)}'`,
    ...leaderboardCommandArgs,
    '  --out-json artifacts/atomic-edit-bench/public-proof.json',
    '  --out-md docs/evidence/atomic-deepseek-v4-pro-aider-polyglot-225.md',
  ].join(' \\\n');

  return `# Atomic + DeepSeek V4 Pro Aider Polyglot Public Proof\n\n` +
    `**Result:** ${validation} ${proof.summary.passedCases}/${proof.summary.totalCases}\n\n` +
    `**Scope:** Aider Polyglot all-language benchmark snapshot. This report proves the supplied artifact set, not an unbounded claim about future benchmark commits.\n\n` +
    `## Benchmark Source\n\n` +
    `- Name: ${proof.benchmarkSource.name}\n` +
    `- URL: ${proof.benchmarkSource.url}\n` +
    `- Commit: ${proof.benchmarkSource.commit || 'not recorded'}\n` +
    `- Model: ${proof.summary.model}\n` +
    `- Atomic repository commit: ${proof.atomicSource.repositoryCommit || 'not recorded'}\n` +
    `- Run directory: ${proof.summary.runDir}\n\n` +
    leaderboardSection +
    `## Result By Language\n\n` +
    `${markdownTable(languageRows)}\n\n` +
    `## Manifest Hashes\n\n` +
    `- all-225.json SHA-256: ${proof.manifest.all225Sha256 || 'missing'}\n` +
    `- Case list SHA-256: ${proof.manifest.caseListSha256}\n` +
    `- Case artifact set SHA-256: ${proof.manifest.caseArtifactSetSha256}\n` +
    `- Case artifact count: ${proof.summary.totalCases}\n` +
    `- Summary outcome count: ${proof.summary.summaryOutcomeCount}\n` +
    `- Reported run duration seconds: ${proof.summary.runDurationSeconds}\n\n` +
    `## Atomic Runner Hashes\n\n` +
    `${markdownTable(runnerRows)}\n\n` +
    `## Reproduction command\n\n` +
    `\`\`\`sh\n${reproductionCommand}\n\`\`\`\n\n` +
    `## Validation Notes\n\n` +
    `- Validation errors: ${proof.validation.errors.length === 0 ? 'none' : proof.validation.errors.join('; ')}\n` +
    `- Validation warnings: ${proof.validation.warnings.length === 0 ? 'none' : proof.validation.warnings.join('; ')}\n` +
    `- Raw candidate source is intentionally not embedded in this Markdown; the JSON proof contains per-case artifact hashes and metadata.\n`;
}



function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };
    if (arg === '--run-dir') options.runDir = next();
    else if (arg === '--runner-root') options.runnerRoot = next();
    else if (arg === '--expected-total') options.expectedTotal = Number(next());
    else if (arg === '--expected-model') options.expectedModel = next();
    else if (arg === '--expected-language-counts-json') options.expectedLanguageCounts = JSON.parse(next());
    else if (arg === '--benchmark-name') options.benchmarkName = next();
    else if (arg === '--benchmark-url') options.benchmarkUrl = next();
    else if (arg === '--benchmark-commit') options.benchmarkCommit = next();
    else if (arg === '--atomic-repository-commit') options.atomicRepositoryCommit = next();
    else if (arg === '--leaderboard-url') options.leaderboardUrl = next();
    else if (arg === '--leaderboard-current-leader') options.leaderboardCurrentLeader = next();
    else if (arg === '--leaderboard-current-leader-score') options.leaderboardCurrentLeaderScore = Number(next());
    else if (arg === '--leaderboard-metric') options.leaderboardMetric = next();
    else if (arg === '--leaderboard-observed-at') options.leaderboardObservedAt = next();
    else if (arg === '--out-json') options.outJson = next();
    else if (arg === '--out-md') options.outMd = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const proof = collectPublicProof(options);
  if (options.outJson) writeFile(options.outJson, JSON.stringify(proof, null, 2) + '\n');
  if (options.outMd) writeFile(options.outMd, renderPublicProofMarkdown(proof));
  if (!options.outJson && !options.outMd) process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
  return proof;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const proof = await runCli(process.argv.slice(2));
    if (!proof.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  }
}
