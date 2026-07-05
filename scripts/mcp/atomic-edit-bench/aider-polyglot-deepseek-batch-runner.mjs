#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATOMIC_EDIT_FORMAT } from './aider-polyglot-atomic-adapter.mjs';
import { runDeepSeekAtomicPolyglotCase } from './aider-polyglot-deepseek-runner.mjs';
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from './deepseek-v4-pro-smoke.mjs';
import { AIDER_POLYGLOT_TOTAL_CASES } from './aider-polyglot-result-normalizer.mjs';

export const DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID = 'atomic-aider-polyglot-deepseek-batch-runner-v1';

export const SUPPORTED_POLYGLOT_LANGUAGES = Object.freeze(['cpp', 'go', 'java', 'javascript', 'python', 'rust']);

const PY_TEST_RE = /(^test[_-].+|.+[_-]test)\.py$/i;
const SOURCE_EXTENSIONS = Object.freeze({
  cpp: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
  go: ['.go'],
  java: ['.java'],
  javascript: ['.js', '.mjs', '.cjs'],
  python: ['.py'],
  rust: ['.rs'],
});
const TEST_FILE_RE = Object.freeze({
  cpp: /(^|\/).+_test\.(cpp|cc|cxx)$/i,
  go: /(^|\/).+_test\.go$/i,
  java: /(^|\/).+Test\.java$/,
  javascript: /(^|\/).+\.(spec|test)\.(js|mjs|cjs)$/i,
  python: /(^|\/)(^test[_-].+|.+[_-]test)\.py$/i,
  rust: /(^|\/)tests\/.+\.rs$/i,
});
const DISCOVERY_IGNORED_DIRS = new Set(['.git', '.pytest_cache', 'build', 'coverage', 'dist', 'node_modules', 'target']);
const DEFAULT_DOC_FILES = Object.freeze(['.docs/instructions.md', '.docs/introduction.md']);

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function tail(value, limit = 4000) {
  const text = String(value ?? '');
  return text.length <= limit ? text : text.slice(-limit);
}

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function normalizeRel(value) {
  return value.split(path.sep).join('/');
}

function sanitizeCaseId(testcase) {
  return String(testcase).replace(/[^a-zA-Z0-9_.-]+/g, '-');
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
    if (arg === '--exercises-root') options.exercisesRoot = next();
    else if (arg === '--language') options.language = next();
    else if (arg === '--limit') options.limit = parsePositiveInteger(next(), undefined);
    else if (arg === '--out') options.out = next();
    else if (arg === '--case-out-dir') options.caseOutDir = next();
    else if (arg === '--model') options.model = next();
    else if (arg === '--base-url') options.baseUrl = next();
    else if (arg === '--thinking') options.thinkingType = next();
    else if (arg === '--reasoning-effort') options.reasoningEffort = next();
    else if (arg === '--max-tokens') options.maxTokens = parsePositiveInteger(next(), undefined);
    else if (arg === '--max-repairs') options.maxRepairs = parsePositiveInteger(next(), 0);
    else if (arg === '--timeout-ms') options.timeoutMs = parsePositiveInteger(next(), undefined);
    else if (arg === '--request-timeout-ms') options.requestTimeoutMs = parsePositiveInteger(next(), undefined);
    else if (arg === '--test-timeout-ms') options.testTimeoutMs = parsePositiveInteger(next(), undefined);
    else if (arg === '--case-timeout-ms') options.caseTimeoutMs = parsePositiveInteger(next(), undefined);
    else if (arg === '--case-subprocess') options.caseSubprocess = true;
    else if (arg === '--resume-existing') options.resumeExisting = true;
    else if (arg === '--rerun-failed-existing') options.rerunFailedExisting = true;
    else if (arg === '--test-command-json') options.testCommand = JSON.parse(next());
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function requireArrayCommand(command) {
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string' || !part)) {
    throw new Error('testCommand must be a non-empty string array');
  }
  return command;
}

function languagesForDiscovery(language) {
  const normalized = stringOrNull(language) ?? 'python';
  if (normalized === 'all') return SUPPORTED_POLYGLOT_LANGUAGES;
  if (!SUPPORTED_POLYGLOT_LANGUAGES.includes(normalized)) throw new Error(`unsupported language: ${normalized}`);
  return [normalized];
}

function resolvePracticeRoot(exercisesRoot, language) {
  const root = path.resolve(exercisesRoot || '.');
  const candidates = [
    path.join(root, language, 'exercises', 'practice'),
    path.join(root, 'exercises', 'practice'),
    root,
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  if (!found) throw new Error(`could not find ${language} practice exercises under ${root}`);
  return found;
}

function walkFiles(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'target' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(root, full, out);
    else if (entry.isFile()) out.push(normalizeRel(path.relative(root, full)));
  }
  return out;
}

function readExerciseFilesConfig(exerciseDir) {
  const configFile = path.join(exerciseDir, '.meta', 'config.json');
  if (!fs.existsSync(configFile)) return null;
  const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object' ? parsed.files : null;
}

function existingRelFiles(exerciseDir, files = []) {
  return files
    .filter((file) => typeof file === 'string' && file.trim())
    .map(normalizeRel)
    .filter((file) => fs.existsSync(path.join(exerciseDir, file)) && fs.statSync(path.join(exerciseDir, file)).isFile());
}

function isSourceFile(language, file) {
  const ext = path.extname(file).toLowerCase();
  return (SOURCE_EXTENSIONS[language] ?? []).includes(ext) && !isTestFile(language, file);
}

function isTestFile(language, file) {
  return Boolean(TEST_FILE_RE[language]?.test(normalizeRel(file)));
}

function expectedPrimaryFile(language, slug) {
  const snake = slug.replace(/-/g, '_');
  if (language === 'cpp') return `${snake}.cpp`;
  if (language === 'go') return `${snake}.go`;
  if (language === 'javascript') return `${slug}.js`;
  if (language === 'python') return `${snake}.py`;
  if (language === 'rust') return 'src/lib.rs';
  return null;
}

function targetRank(language, slug, file) {
  const normalized = normalizeRel(file);
  const expected = expectedPrimaryFile(language, slug);
  if (expected && normalized === expected) return 0;
  if (language === 'java' && normalized.startsWith('src/main/java/')) return 1;
  if (language === 'cpp' && /\.(cpp|cc|cxx)$/i.test(normalized)) return 1;
  return 2;
}

function sortSourceFiles(language, slug, files) {
  return [...files].sort((a, b) => targetRank(language, slug, a) - targetRank(language, slug, b) || a.localeCompare(b));
}

function configuredSourceFiles(exerciseDir, language, slug, configFiles) {
  const configured = existingRelFiles(exerciseDir, configFiles?.solution ?? []).filter((file) => isSourceFile(language, file));
  if (configured.length > 0) return sortSourceFiles(language, slug, configured);
  const fallback = walkFiles(exerciseDir)
    .filter((file) => !file.startsWith('.meta/') && !file.startsWith('.docs/'))
    .filter((file) => !file.startsWith('test/') && !file.startsWith('tests/') && !file.startsWith('src/test/'))
    .filter((file) => isSourceFile(language, file));
  return sortSourceFiles(language, slug, fallback);
}

function configuredTestFiles(exerciseDir, language, configFiles) {
  const configured = existingRelFiles(exerciseDir, configFiles?.test ?? []);
  if (configured.length > 0) return configured.sort();
  return walkFiles(exerciseDir).filter((file) => isTestFile(language, file)).sort();
}

function configuredDocFiles(exerciseDir, language, configFiles) {
  const docs = existingRelFiles(exerciseDir, DEFAULT_DOC_FILES);
  const editor = existingRelFiles(exerciseDir, configFiles?.editor ?? []).filter((file) => isSourceFile(language, file));
  return [...new Set([...docs, ...editor])];
}

function discoverLanguageCases({ exercisesRoot, language }) {
  const practiceRoot = resolvePracticeRoot(exercisesRoot, language);
  return fs.readdirSync(practiceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !DISCOVERY_IGNORED_DIRS.has(entry.name))
    .map((entry) => {
      const exerciseDir = path.join(practiceRoot, entry.name);
      const configFiles = readExerciseFilesConfig(exerciseDir);
      const files = configuredSourceFiles(exerciseDir, language, entry.name, configFiles);
      const testFiles = configuredTestFiles(exerciseDir, language, configFiles);
      const docFiles = configuredDocFiles(exerciseDir, language, configFiles);
      if (files.length === 0 || testFiles.length === 0) return null;
      return {
        testcase: `${language}/${entry.name}`,
        language,
        slug: entry.name,
        exerciseDir,
        file: files[0],
        files,
        docFiles,
        multiFile: files.length > 1,
        testFiles,
        testCommand: defaultTestCommand({ language }),
      };
    })
    .filter(Boolean);
}

export function discoverPolyglotCases(options = {}) {
  const languages = languagesForDiscovery(options.language);
  const cases = languages.flatMap((language) => discoverLanguageCases({ exercisesRoot: options.exercisesRoot, language }))
    .sort((a, b) => a.testcase.localeCompare(b.testcase));
  return typeof options.limit === 'number' ? cases.slice(0, options.limit) : cases;
}

export function discoverPythonCases(options = {}) {
  const language = stringOrNull(options.language) ?? 'python';
  if (language !== 'python') throw new Error(`discoverPythonCases only supports python, got ${language}`);
  return discoverPolyglotCases({ ...options, language: 'python' });
}

function defaultTestCommand(options = {}) {
  const language = stringOrNull(options.language) ?? 'python';
  const pythonBin = stringOrNull(options.pythonBin) ?? process.env.PYTHON_BIN ?? 'python3';
  if (language === 'cpp') return ['bash', '-c', 'cmake -S . -B build -DEXERCISM_RUN_ALL_TESTS=1 && cmake --build build'];
  if (language === 'go') return ['go', 'test', './...'];
  if (language === 'java') return ['bash', './gradlew', 'test', '--no-daemon'];
  if (language === 'javascript') return ['bash', '-c', 'npm install --no-audit --fund=false && npm test -- --runInBand'];
  if (language === 'rust') return ['cargo', 'test', '--quiet'];
  return [pythonBin, '-m', 'unittest', 'discover', '-s', '.', '-p', '*_test.py'];
}

function caseOutputPath(options, testcase) {
  const explicitDir = stringOrNull(options.caseOutDir);
  const baseDir = explicitDir
    ? path.resolve(explicitDir)
    : path.resolve(path.dirname(path.resolve(options.out)), `${path.basename(options.out, path.extname(options.out))}.cases`);
  return path.join(baseDir, `${sanitizeCaseId(testcase)}.json`);
}

function writeJson(file, value) {
  if (!file) return;
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

function pushOptionalArg(args, flag, value) {
  if (value === undefined || value === null || value === '') return;
  args.push(flag, String(value));
}

function syntheticSubprocessFailureResult({ testcase, model, blocker, child, timeoutMs }) {
  const duration = timeoutMs ? Number((timeoutMs / 1000).toFixed(3)) : 0;
  return {
    tests_outcomes: [false],
    duration,
    prompt_tokens: 0,
    completion_tokens: 0,
    thinking_tokens: 0,
    syntax_errors: 0,
    indentation_errors: 0,
    lazy_comments: 0,
    test_timeouts: timeoutMs ? 1 : 0,
    num_error_outputs: 1,
    num_user_asks: 0,
    num_exhausted_context_windows: 0,
    num_malformed_responses: 1,
    model: stringOrNull(model) ?? DEEPSEEK_MODEL,
    testcase,
    atomic_batch_subprocess: {
      ok: false,
      blocker,
      status: child?.status ?? null,
      signal: child?.signal ?? null,
      error: child?.error?.message ?? null,
      stdout: tail(child?.stdout),
      stderr: tail(child?.stderr),
      timeoutMs: timeoutMs ?? null,
    },
  };
}

function runCaseInSubprocess({ item, options, caseLanguage, testCommand, resultFile }) {
  const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'aider-polyglot-deepseek-runner.mjs');
  const files = item.files ?? [item.file].filter(Boolean);
  const args = [
    runnerPath,
    '--exercise-dir', item.exerciseDir,
    '--file', item.file,
    '--files-json', JSON.stringify(files),
    '--testcase', item.testcase,
    '--language', caseLanguage,
    '--test-command-json', JSON.stringify(testCommand),
  ];
  pushOptionalArg(args, '--model', options.model);
  pushOptionalArg(args, '--base-url', options.baseUrl ?? DEEPSEEK_BASE_URL);
  pushOptionalArg(args, '--thinking', options.thinkingType);
  pushOptionalArg(args, '--reasoning-effort', options.reasoningEffort);
  pushOptionalArg(args, '--max-tokens', options.maxTokens);
  pushOptionalArg(args, '--max-repairs', options.maxRepairs);
  pushOptionalArg(args, '--timeout-ms', options.timeoutMs);
  pushOptionalArg(args, '--request-timeout-ms', options.requestTimeoutMs);
  pushOptionalArg(args, '--test-timeout-ms', options.testTimeoutMs);
  for (const docFile of item.docFiles ?? []) pushOptionalArg(args, '--doc-file', docFile);
  for (const testFile of item.testFiles ?? []) pushOptionalArg(args, '--test-file', testFile);
  pushOptionalArg(args, '--out', resultFile);
  if (resultFile && fs.existsSync(resultFile)) fs.rmSync(resultFile, { force: true });

  const timeoutMs = parsePositiveInteger(options.caseTimeoutMs, undefined);
  const child = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (resultFile && fs.existsSync(resultFile)) {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    const ok = Array.isArray(result.tests_outcomes) && result.tests_outcomes.every(Boolean);
    return { ok, result, blockers: ok ? [] : (result.atomic_adapter?.apply?.blockers ?? result.atomic_adapter?.generationFailure?.blockers ?? [`case subprocess exited with status ${child.status ?? 'null'}`]) };
  }
  const timedOut = child.error?.code === 'ETIMEDOUT';
  const blocker = timedOut
    ? `case subprocess timed out after ${timeoutMs}ms`
    : `case subprocess failed before writing result: ${child.error?.message ?? child.stderr ?? child.status ?? 'unknown failure'}`;
  const result = syntheticSubprocessFailureResult({ testcase: item.testcase, model: options.model, blocker, child, timeoutMs: timedOut ? timeoutMs : undefined });
  writeJson(resultFile, result);
  return { ok: false, result, blockers: [blocker] };
}

function sumField(results, field) {
  return results.reduce((total, item) => total + finiteNumber(item.result?.[field]), 0);
}

export function aggregateBatchResults(options = {}) {
  const results = Array.isArray(options.results) ? options.results : [];
  const firstResult = results.find((item) => item?.result)?.result;
  const outcomes = results.map((item) => Boolean(item?.ok && item?.result?.tests_outcomes?.every(Boolean)));
  const duration = Number(results.reduce((total, item) => total + finiteNumber(item.result?.duration), 0).toFixed(3));
  const language = stringOrNull(options.language) ?? 'python';
  const model = stringOrNull(firstResult?.model) ?? stringOrNull(options.model) ?? DEEPSEEK_MODEL;

  return {
    testdir: path.resolve(options.exercisesRoot || '.'),
    testcase: `${language}/*`,
    model,
    edit_format: ATOMIC_EDIT_FORMAT,
    tests_outcomes: outcomes,
    total_tests: parsePositiveInteger(options.totalTests, AIDER_POLYGLOT_TOTAL_CASES),
    cost: 0,
    duration,
    test_timeouts: sumField(results, 'test_timeouts'),
    commit_hash: null,
    num_error_outputs: sumField(results, 'num_error_outputs'),
    num_user_asks: sumField(results, 'num_user_asks'),
    num_exhausted_context_windows: sumField(results, 'num_exhausted_context_windows'),
    num_malformed_responses: sumField(results, 'num_malformed_responses'),
    syntax_errors: sumField(results, 'syntax_errors'),
    indentation_errors: sumField(results, 'indentation_errors'),
    lazy_comments: sumField(results, 'lazy_comments'),
    reasoning_effort: 'high',
    prompt_tokens: sumField(results, 'prompt_tokens'),
    completion_tokens: sumField(results, 'completion_tokens'),
    thinking_tokens: sumField(results, 'thinking_tokens'),
    chat_hashes: [],
    batchRunnerId: DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID,
    atomic_batch: {
      batchRunnerId: DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID,
      language,
      completedCases: results.length,
      passedCases: outcomes.filter(Boolean).length,
      cases: results.map((item) => ({
        testcase: item.testcase,
        language: item.language ?? null,
        ok: Boolean(item.ok),
        file: item.file ?? null,
        files: Array.isArray(item.files) ? item.files : [item.file].filter(Boolean),
        multiFile: Boolean(item.multiFile),
        testCommand: Array.isArray(item.testCommand) ? item.testCommand : null,
        resultFile: item.resultFile ? normalizeRel(path.relative(process.cwd(), path.resolve(item.resultFile))) : null,
        blockers: item.blockers ?? [],
        duration: Number.isFinite(item.result?.duration) ? item.result.duration : null,
      })),
    },
  };
}

export async function runDeepSeekAtomicPolyglotBatch(options = {}) {
  const language = stringOrNull(options.language) ?? 'python';
  const exercisesRoot = path.resolve(options.exercisesRoot || '.');
  const cases = discoverPolyglotCases({ exercisesRoot, language, limit: options.limit });
  if (cases.length === 0) throw new Error(`no ${language} cases discovered under ${exercisesRoot}`);

  const results = [];
  for (const item of cases) {
    const caseLanguage = item.language ?? language;
    const testCommand = requireArrayCommand(options.testCommand ?? item.testCommand ?? defaultTestCommand({ ...options, language: caseLanguage }));
    const resultFile = options.out ? caseOutputPath(options, item.testcase) : null;
    try {
      if (options.resumeExisting && resultFile && fs.existsSync(resultFile)) {
        const existing = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        const existingOutcomes = Array.isArray(existing.tests_outcomes) ? existing.tests_outcomes : [];
        const existingOk = existingOutcomes.length > 0 && existingOutcomes.every(Boolean);
        if (existingOk || !options.rerunFailedExisting) {
          results.push({
            testcase: item.testcase,
            language: caseLanguage,
            file: item.file,
            files: item.files ?? [item.file].filter(Boolean),
            multiFile: Boolean(item.multiFile),
            testCommand,
            ok: existingOk,
            result: existing,
            resultFile,
            blockers: existingOk ? [] : ['resumed existing case artifact is failing'],
            resumed: true,
          });
          continue;
        }
      }
      const run = options.caseSubprocess
        ? runCaseInSubprocess({ item, options, caseLanguage, testCommand, resultFile })
        : await runDeepSeekAtomicPolyglotCase({
          exerciseDir: item.exerciseDir,
          file: item.file,
          files: item.files ?? [item.file].filter(Boolean),
          testcase: item.testcase,
          language: caseLanguage,
          model: options.model,
          baseUrl: options.baseUrl ?? DEEPSEEK_BASE_URL,
          maxTokens: options.maxTokens,
          maxRepairs: options.maxRepairs,
          thinkingType: options.thinkingType,
          reasoningEffort: options.reasoningEffort,
          timeoutMs: options.timeoutMs,
          requestTimeoutMs: options.requestTimeoutMs,
          testTimeoutMs: options.testTimeoutMs,
          testCommand,
          testFiles: item.testFiles,
          docFiles: item.docFiles,
          pythonBin: options.pythonBin,
          env: options.env ?? process.env,
          fetchImpl: options.fetchImpl,
          out: resultFile,
        });
      results.push({
        testcase: item.testcase,
        language: caseLanguage,
        file: item.file,
        files: item.files ?? [item.file].filter(Boolean),
        multiFile: Boolean(item.multiFile),
        testCommand,
        ok: run.ok,
        result: run.result,
        resultFile,
        blockers: run.blockers ?? [],
      });
    } catch (error) {
      results.push({
        testcase: item.testcase,
        language: caseLanguage,
        file: item.file,
        files: item.files ?? [item.file].filter(Boolean),
        multiFile: Boolean(item.multiFile),
        testCommand,
        ok: false,
        result: {
          tests_outcomes: [false],
          duration: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          thinking_tokens: 0,
          syntax_errors: 0,
          indentation_errors: 0,
          lazy_comments: 0,
          test_timeouts: 0,
          num_error_outputs: 1,
          num_user_asks: 0,
          num_exhausted_context_windows: 0,
          num_malformed_responses: 1,
        },
        resultFile,
        blockers: [error?.message ?? String(error)],
      });
    }
  }

  const result = aggregateBatchResults({
    exercisesRoot,
    language,
    totalTests: options.totalTests,
    model: options.model,
    results,
  });
  writeJson(options.out, result);
  return {
    ok: result.tests_outcomes.length > 0 && result.tests_outcomes.every(Boolean),
    runnerId: DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID,
    result,
    cases: results,
    blockers: results.flatMap((item) => item.blockers ?? []),
  };
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (!options.exercisesRoot) throw new Error('--exercises-root is required');
  return runDeepSeekAtomicPolyglotBatch({ ...options, env });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const run = await runCli(process.argv.slice(2), process.env);
    console.log(JSON.stringify({
      ok: run.ok,
      runnerId: DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID,
      completedCases: run.result.tests_outcomes.length,
      passedCases: run.result.tests_outcomes.filter(Boolean).length,
      resultFile: process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null,
    }, null, 2));
    process.exitCode = run.ok ? 0 : 1;
  } catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  }
}
