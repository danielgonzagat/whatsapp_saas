#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const batchPath = path.join(here, 'aider-polyglot-deepseek-batch-runner.mjs');
assert.equal(fs.existsSync(batchPath), true, 'aider-polyglot-deepseek-batch-runner.mjs must exist');

const batch = await import(pathToFileURL(batchPath).href);
const {
  DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID,
  discoverPolyglotCases,
  discoverPythonCases,
  aggregateBatchResults,
  runDeepSeekAtomicPolyglotBatch,
} = batch;

const python = process.env.PYTHON_BIN || 'python3';
const fakeKey = 'test-secret-do-not-return';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-deepseek-batch-proof-'));
const pythonPracticeRoot = path.join(root, 'python', 'exercises', 'practice');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeDocs(dir, body = '# Instructions\n\nReturn the requested value.\n') {
  fs.mkdirSync(path.join(dir, '.docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.docs', 'instructions.md'), body);
}

function writeMeta(dir, files) {
  writeJson(path.join(dir, '.meta', 'config.json'), { files });
}

function writeExercise(slug, moduleName, expectedValue) {
  const dir = path.join(pythonPracticeRoot, slug);
  writeDocs(dir, `# Instructions\n\nImplement ${moduleName}() so it returns ${expectedValue}.\n`);
  writeMeta(dir, { solution: [`${moduleName}.py`], test: [`${moduleName}_test.py`], editor: [`${moduleName}_support.py`] });
  fs.writeFileSync(path.join(dir, `${moduleName}.py`), `def ${moduleName}():\n    return 0\n`);
  fs.writeFileSync(path.join(dir, `${moduleName}_support.py`), `SUPPORT_SENTINEL = "${moduleName}"\n`);
  fs.writeFileSync(path.join(dir, `${moduleName}_test.py`), `import unittest\nfrom ${moduleName} import ${moduleName}\n\nclass ${moduleName}Test(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(${moduleName}(), ${expectedValue})\n\nif __name__ == '__main__':\n    unittest.main()\n`);
}

function writeJsExercise() {
  const dir = path.join(root, 'javascript', 'exercises', 'practice', 'js-answer');
  writeDocs(dir, '# Instructions\n\nWrite a JavaScript file containing return 3.\n');
  writeMeta(dir, { solution: ['js-answer.js'], test: ['js-answer.spec.js'] });
  fs.writeFileSync(path.join(dir, 'js-answer.js'), 'export function answer() { return 0; }\n');
  fs.writeFileSync(path.join(dir, 'js-answer.spec.js'), "const fs = require('node:fs');\nconst source = fs.readFileSync('js-answer.js', 'utf8');\nif (!source.includes('return 3')) throw new Error('wrong answer');\n");
}

function writeConfiguredCase(language, slug, files) {
  const dir = path.join(root, language, 'exercises', 'practice', slug);
  writeDocs(dir);
  writeMeta(dir, files);
  for (const file of [...(files.solution ?? []), ...(files.test ?? [])]) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '// fixture\n');
  }
}

writeExercise('answer-one', 'answer_one', 1);
writeExercise('answer-two', 'answer_two', 2);
writeJsExercise();
const jsNodeModules = path.join(root, 'javascript', 'exercises', 'practice', 'node_modules');
fs.mkdirSync(jsNodeModules, { recursive: true });
fs.writeFileSync(path.join(jsNodeModules, 'not-a-benchmark.js'), 'module.exports = {};\n');
writeConfiguredCase('go', 'go-answer', { solution: ['go_answer.go'], test: ['go_answer_test.go'] });
writeConfiguredCase('rust', 'rust-answer', { solution: ['src/lib.rs', 'Cargo.toml'], test: ['tests/rust_answer.rs'] });
writeConfiguredCase('java', 'java-answer', { solution: ['src/main/java/JavaAnswer.java', 'src/main/java/JavaHelper.java'], test: ['src/test/java/JavaAnswerTest.java'], editor: ['src/main/java/JavaSupport.java'] });
fs.writeFileSync(path.join(root, 'java', 'exercises', 'practice', 'java-answer', 'src/main/java/JavaSupport.java'), '// support source\n');
writeConfiguredCase('cpp', 'cpp-answer', { solution: ['cpp_answer.cpp', 'cpp_answer.h'], test: ['cpp_answer_test.cpp'] });

const cases = discoverPythonCases({ exercisesRoot: root, language: 'python' });
assert.equal(cases.length, 2);
assert.deepEqual(cases.map((item) => item.testcase), ['python/answer-one', 'python/answer-two']);
assert.deepEqual(cases.map((item) => item.file), ['answer_one.py', 'answer_two.py']);
assert.deepEqual(cases[0].docFiles, ['.docs/instructions.md', 'answer_one_support.py']);
assert.equal(cases[0].files.includes('answer_one_support.py'), false);

const allCases = discoverPolyglotCases({ exercisesRoot: root, language: 'all' });
assert.deepEqual(allCases.map((item) => item.testcase), [
  'cpp/cpp-answer',
  'go/go-answer',
  'java/java-answer',
  'javascript/js-answer',
  'python/answer-one',
  'python/answer-two',
  'rust/rust-answer',
]);
const byCase = Object.fromEntries(allCases.map((item) => [item.testcase, item]));
assert.equal(byCase['javascript/js-answer'].file, 'js-answer.js');
assert.deepEqual(byCase['javascript/js-answer'].testFiles, ['js-answer.spec.js']);
assert.deepEqual(byCase['javascript/js-answer'].testCommand, ['bash', '-c', 'npm install --no-audit --fund=false && npm test -- --runInBand']);
assert.equal(byCase['go/go-answer'].file, 'go_answer.go');
assert.equal(byCase['rust/rust-answer'].file, 'src/lib.rs');
assert.equal(byCase['java/java-answer'].file, 'src/main/java/JavaAnswer.java');
assert.deepEqual(byCase['java/java-answer'].files, ['src/main/java/JavaAnswer.java', 'src/main/java/JavaHelper.java']);
assert.deepEqual(byCase['java/java-answer'].docFiles, ['.docs/instructions.md', 'src/main/java/JavaSupport.java']);
assert.equal(byCase['java/java-answer'].files.includes('src/main/java/JavaSupport.java'), false);
assert.equal(byCase['java/java-answer'].multiFile, true);
assert.equal(byCase['cpp/cpp-answer'].file, 'cpp_answer.cpp');
assert.deepEqual(byCase['cpp/cpp-answer'].files, ['cpp_answer.cpp', 'cpp_answer.h']);
assert.equal(byCase['cpp/cpp-answer'].multiFile, true);
assert.deepEqual(byCase['cpp/cpp-answer'].testCommand, ['bash', '-c', 'cmake -S . -B build -DEXERCISM_RUN_ALL_TESTS=1 && cmake --build build']);
assert.deepEqual(discoverPolyglotCases({ exercisesRoot: root, language: 'go', limit: 1 }).map((item) => item.testcase), ['go/go-answer']);

const aggregate = aggregateBatchResults({
  exercisesRoot: root,
  language: 'python',
  results: [
    { testcase: 'python/answer-one', ok: true, result: { tests_outcomes: [true], duration: 1.25, prompt_tokens: 10, completion_tokens: 20, syntax_errors: 0, indentation_errors: 0, lazy_comments: 0, test_timeouts: 0, num_error_outputs: 0, num_user_asks: 0, num_exhausted_context_windows: 0, num_malformed_responses: 0 } },
    { testcase: 'python/answer-two', ok: false, result: { tests_outcomes: [false], duration: 2.5, prompt_tokens: 11, completion_tokens: 21, syntax_errors: 1, indentation_errors: 0, lazy_comments: 0, test_timeouts: 0, num_error_outputs: 1, num_user_asks: 0, num_exhausted_context_windows: 0, num_malformed_responses: 0 } },
  ],
});
assert.equal(aggregate.batchRunnerId, DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID);
assert.deepEqual(aggregate.tests_outcomes, [true, false]);
assert.equal(aggregate.duration, 3.75);
assert.equal(aggregate.prompt_tokens, 21);
assert.equal(aggregate.syntax_errors, 1);

let requestCount = 0;
let answerTwoRequests = 0;
const outFile = path.join(root, 'batch-results.json');
const run = await runDeepSeekAtomicPolyglotBatch({
  exercisesRoot: root,
  language: 'python',
  limit: 2,
  maxRepairs: 1,
  env: { DEEPSEEK_API_KEY: fakeKey },
  pythonBin: python,
  out: outFile,
  fetchImpl: async (_url, init) => {
    requestCount += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    assert.equal(prompt.includes(fakeKey), false);
    if (prompt.includes('answer_one.py')) {
      assert.equal(prompt.includes('answer_one_support.py'), true);
      assert.equal(prompt.includes('SUPPORT_SENTINEL'), true);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: '```python\ndef answer_one():\n    return 1\n```\n' } }],
          usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
        }),
      };
    }
    answerTwoRequests += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: answerTwoRequests === 1
          ? 'def answer_two():\n    return 0\n'
          : 'def answer_two():\n    return 2\n' } }],
        usage: { prompt_tokens: 7, completion_tokens: 8, total_tokens: 15 },
      }),
    };
  },
});
assert.equal(run.ok, true);
assert.equal(requestCount, 3);
assert.equal(answerTwoRequests, 2);
assert.equal(run.result.tests_outcomes.length, 2);
assert.deepEqual(run.result.tests_outcomes, [true, true]);
assert.equal(run.result.prompt_tokens, 19);
assert.equal(run.result.completion_tokens, 22);
assert.equal(fs.existsSync(outFile), true);
const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
assert.equal(persisted.batchRunnerId, DEEPSEEK_POLYGLOT_BATCH_RUNNER_ID);
assert.deepEqual(persisted.tests_outcomes, [true, true]);
assert.equal(JSON.stringify(persisted).includes(fakeKey), false);
assert.equal(fs.existsSync(path.join(root, 'batch-results.cases', 'python-answer-one.json')), true);
assert.equal(fs.existsSync(path.join(root, 'batch-results.cases', 'python-answer-two.json')), true);

const resumeOutFile = path.join(root, 'batch-results-resumed.json');
const resumed = await runDeepSeekAtomicPolyglotBatch({
  exercisesRoot: root,
  language: 'python',
  limit: 2,
  resumeExisting: true,
  caseOutDir: path.join(root, 'batch-results.cases'),
  out: resumeOutFile,
  env: { DEEPSEEK_API_KEY: fakeKey },
  pythonBin: python,
  fetchImpl: async () => {
    throw new Error('resumeExisting must not call DeepSeek for existing case artifacts');
  },
});
assert.equal(resumed.ok, true);
assert.deepEqual(resumed.result.tests_outcomes, [true, true]);
assert.equal(fs.existsSync(resumeOutFile), true);

const rerunCaseDir = path.join(root, 'batch-results.rerun-cases');
fs.mkdirSync(rerunCaseDir, { recursive: true });
writeJson(path.join(rerunCaseDir, 'python-answer-one.json'), {
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
});
let rerunFailedRequestCount = 0;
const rerunFailedOutFile = path.join(root, 'batch-results-rerun-failed.json');
const rerunFailed = await runDeepSeekAtomicPolyglotBatch({
  exercisesRoot: root,
  language: 'python',
  limit: 1,
  resumeExisting: true,
  rerunFailedExisting: true,
  caseOutDir: rerunCaseDir,
  out: rerunFailedOutFile,
  env: { DEEPSEEK_API_KEY: fakeKey },
  pythonBin: python,
  fetchImpl: async () => {
    rerunFailedRequestCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: 'def answer_one():\n    return 1\n' } }],
        usage: { prompt_tokens: 11, completion_tokens: 12, total_tokens: 23 },
      }),
    };
  },
});
assert.equal(rerunFailed.ok, true);
assert.equal(rerunFailedRequestCount, 1);
assert.deepEqual(rerunFailed.result.tests_outcomes, [true]);
const rerunFailedCase = JSON.parse(fs.readFileSync(path.join(rerunCaseDir, 'python-answer-one.json'), 'utf8'));
assert.deepEqual(rerunFailedCase.tests_outcomes, [true]);

let batchSplitSignal = null;
const batchSplitTimeoutRun = await runDeepSeekAtomicPolyglotBatch({
  exercisesRoot: root,
  language: 'python',
  limit: 1,
  timeoutMs: 25,
  requestTimeoutMs: 500,
  testTimeoutMs: 3000,
  env: { DEEPSEEK_API_KEY: fakeKey },
  pythonBin: python,
  fetchImpl: async (_url, init = {}) => {
    batchSplitSignal = init.signal ?? null;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: 'def answer_one():\n    return 1\n' } }],
        usage: { prompt_tokens: 11, completion_tokens: 12, total_tokens: 23 },
      }),
    };
  },
});
assert.equal(batchSplitSignal instanceof AbortSignal, true);
assert.equal(batchSplitSignal.aborted, false);
assert.equal(batchSplitTimeoutRun.ok, true);

let jsRequestCount = 0;
const jsRun = await runDeepSeekAtomicPolyglotBatch({
  exercisesRoot: root,
  language: 'javascript',
  limit: 1,
  thinkingType: 'disabled',
  reasoningEffort: 'max',
  env: { DEEPSEEK_API_KEY: fakeKey },
  testCommand: [process.execPath, 'js-answer.spec.js'],
  fetchImpl: async (_url, init) => {
    jsRequestCount += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.thinking.type, 'disabled');
    assert.equal(body.reasoning_effort, 'max');
    const prompt = body.messages.map((message) => message.content).join('\n');
    assert.equal(prompt.includes(fakeKey), false);
    assert.equal(prompt.includes('js-answer.js'), true);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: '```javascript\nexport function answer() { return 3; }\n```\n' } }],
        usage: { prompt_tokens: 9, completion_tokens: 10, total_tokens: 19 },
      }),
    };
  },
});
assert.equal(jsRun.ok, true);
assert.equal(jsRequestCount, 1);
assert.deepEqual(jsRun.result.tests_outcomes, [true]);
assert.equal(jsRun.result.testcase, 'javascript/*');
assert.equal(jsRun.result.prompt_tokens, 9);

const hangingServer = http.createServer((_req, _res) => {});
await new Promise((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
const hangingPort = hangingServer.address().port;
const subprocessTimeoutOut = path.join(root, 'subprocess-timeout.json');
const subprocessTimeoutCases = path.join(root, 'subprocess-timeout-cases');
writeJson(path.join(subprocessTimeoutCases, 'python-answer-one.json'), { tests_outcomes: [true], duration: 0, prompt_tokens: 999, completion_tokens: 999 });
try {
  const subprocessTimeoutRun = await runDeepSeekAtomicPolyglotBatch({
    exercisesRoot: root,
    language: 'python',
    limit: 1,
    model: 'deepseek-v4-pro',
    baseUrl: `http://127.0.0.1:${hangingPort}`,
    maxRepairs: 0,
    requestTimeoutMs: 5000,
    caseSubprocess: true,
    caseTimeoutMs: 250,
    out: subprocessTimeoutOut,
    caseOutDir: subprocessTimeoutCases,
    env: { DEEPSEEK_API_KEY: fakeKey },
    pythonBin: python,
  });
  assert.equal(subprocessTimeoutRun.ok, false);
  assert.deepEqual(subprocessTimeoutRun.result.tests_outcomes, [false]);
  assert.equal(subprocessTimeoutRun.result.test_timeouts, 1);
  assert.match(subprocessTimeoutRun.blockers.join('\n'), /case subprocess timed out after 250ms/);
  const subprocessCase = JSON.parse(fs.readFileSync(path.join(subprocessTimeoutCases, 'python-answer-one.json'), 'utf8'));
  assert.equal(subprocessCase.atomic_batch_subprocess.timeoutMs, 250);
} finally {
  hangingServer.closeAllConnections?.();
  await new Promise((resolve) => hangingServer.close(resolve));
}

console.log(JSON.stringify({ ok: true, proof: 'aider-polyglot-deepseek-batch-runner', checked: 25 }, null, 2));
