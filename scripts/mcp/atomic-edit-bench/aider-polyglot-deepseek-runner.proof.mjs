#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(here, 'aider-polyglot-deepseek-runner.mjs');
assert.equal(fs.existsSync(runnerPath), true, 'aider-polyglot-deepseek-runner.mjs must exist');

const runner = await import(pathToFileURL(runnerPath).href);
const {
  DEEPSEEK_POLYGLOT_RUNNER_ID,
  buildExercisePrompt,
  extractFullFileFromResponse,
  extractFullFilesFromResponse,
  runDeepSeekAtomicPolyglotCase,
} = runner;

const python = process.env.PYTHON_BIN || 'python3';
const fakeKey = 'test-secret-do-not-return';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-deepseek-polyglot-proof-'));
const exerciseDir = path.join(root, 'python', 'exercises', 'practice', 'answer');
fs.mkdirSync(path.join(exerciseDir, '.docs'), { recursive: true });
fs.writeFileSync(path.join(exerciseDir, '.docs', 'instructions.md'), '# Instructions\n\nImplement answer() so it returns 42.\n');
fs.writeFileSync(path.join(exerciseDir, '.docs', 'introduction.md'), '# Introduction\n\nA tiny proof exercise.\n');
fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'test_answer.py'), "import unittest\nfrom answer import answer\n\nclass AnswerTest(unittest.TestCase):\n    def test_answer(self):\n        self.assertEqual(answer(), 42)\n\nif __name__ == '__main__':\n    unittest.main()\n");

async function captureRepairPromptForFailure({ scriptName, scriptBody, testcase }) {
  fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
  fs.writeFileSync(path.join(exerciseDir, scriptName), scriptBody);
  let requests = 0;
  let repairPrompt = '';
  const run = await runDeepSeekAtomicPolyglotCase({
    exerciseDir,
    file: 'answer.py',
    testcase,
    language: 'python',
    maxRepairs: 1,
    pythonBin: python,
    env: { DEEPSEEK_API_KEY: fakeKey },
    fetchImpl: async (_url, init) => {
      requests += 1;
      const body = JSON.parse(init.body);
      const prompt = body.messages.map((message) => message.content).join('\n');
      if (requests === 2) repairPrompt = prompt;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: requests === 1
            ? 'def answer():\n    return 0\n'
            : 'def answer():\n    return 42\n' } }],
          usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
        }),
      };
    },
    testCommand: [process.execPath, scriptName],
  });
  assert.equal(run.ok, true, `${testcase} fixture should pass after repair`);
  assert.equal(requests, 2, `${testcase} fixture should request one repair`);
  return repairPrompt;
}

const promptPlan = buildExercisePrompt({ exerciseDir, file: 'answer.py', language: 'python' });
const promptText = promptPlan.messages.map((message) => message.content).join('\n');
assert.equal(promptPlan.runnerId, DEEPSEEK_POLYGLOT_RUNNER_ID);
assert.match(promptText, /Implement answer\(\) so it returns 42/);
assert.match(promptText, /def answer\(\):/);
assert.match(promptText, /class AnswerTest/);
assert.equal(promptText.includes(fakeKey), false, 'prompt must not contain API secrets');
assert.deepEqual(promptPlan.sources.docs.sort(), ['.docs/instructions.md', '.docs/introduction.md'].sort());
assert.deepEqual(promptPlan.sources.tests, ['test_answer.py']);
assert.equal(promptText.includes('shared channel'), false, 'non-Go prompts must not include Go concurrency guidance');

const cppDir = path.join(root, 'cpp', 'exercises', 'practice', 'binary-search-tree');
fs.mkdirSync(path.join(cppDir, '.docs'), { recursive: true });
fs.writeFileSync(path.join(cppDir, '.docs', 'instructions.md'), '# Instructions\n\nBuild a binary search tree.\n');
fs.writeFileSync(path.join(cppDir, 'binary_search_tree.cpp'), '#include "binary_search_tree.h"\n');
fs.writeFileSync(path.join(cppDir, 'binary_search_tree.h'), '#if !defined(BINARY_SEARCH_TREE_H)\n#define BINARY_SEARCH_TREE_H\nnamespace binary_search_tree {}\n#endif\n');
fs.writeFileSync(path.join(cppDir, 'binary_search_tree_test.cpp'), '#include "binary_search_tree.h"\n#include <memory>\n#include <vector>\ntemplate<typename T>\nusing tree_ptr = typename std::unique_ptr<binary_search_tree::binary_tree<T>>;\ntemplate<typename T>\nstatic tree_ptr<T> make_tree(const std::vector<T> &data);\n');
const cppPromptPlan = buildExercisePrompt({ exerciseDir: cppDir, file: 'binary_search_tree.cpp', files: ['binary_search_tree.cpp', 'binary_search_tree.h'], language: 'cpp' });
const cppPromptText = cppPromptPlan.messages.map((message) => message.content).join('\n');
assert.deepEqual(cppPromptPlan.sources.tests, ['binary_search_tree_test.cpp']);
assert.match(cppPromptText, /binary_search_tree::binary_tree<T>/);
assert.match(cppPromptText, /make_tree/);

const goDir = path.join(root, 'go', 'exercises', 'practice', 'robot');
fs.mkdirSync(goDir, { recursive: true });
fs.writeFileSync(path.join(goDir, 'robot.go'), 'package robot\n\nfunc Room3() {}\n');
fs.writeFileSync(path.join(goDir, 'robot_test.go'), 'package robot\n\nfunc TestRoom3() {}\n');
const goPromptPlan = buildExercisePrompt({ exerciseDir: goDir, file: 'robot.go', language: 'go' });
const goPromptText = goPromptPlan.messages.map((message) => message.content).join('\n');
assert.match(goPromptText, /finite completion protocol/);
assert.match(goPromptText, /shared channel/);

const robotNameDir = path.join(root, 'rust', 'exercises', 'practice', 'robot-name');
fs.mkdirSync(path.join(robotNameDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(robotNameDir, 'src', 'lib.rs'), 'pub struct Robot;\n');
const robotNamePromptPlan = buildExercisePrompt({ exerciseDir: robotNameDir, file: 'src/lib.rs', language: 'rust' });
const robotNamePromptText = robotNamePromptPlan.messages.map((message) => message.content).join('\n');
assert.match(robotNamePromptText, /standard library and dependencies already declared/);
assert.match(robotNamePromptText, /Robot-name constraint/);
assert.match(robotNamePromptText, /AtomicUsize/);
assert.match(robotNamePromptText, /must not contain rand, rand::, thread_rng, lazy_static, HashSet, Mutex/);
assert.equal(robotNamePromptText.includes('shared channel'), false, 'Rust robot-name prompts must not include Go concurrency guidance');

const xorcismDir = path.join(root, 'rust', 'exercises', 'practice', 'xorcism');
fs.mkdirSync(path.join(xorcismDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(xorcismDir, 'src', 'lib.rs'), 'pub struct Xorcism;\n');
const xorcismPromptPlan = buildExercisePrompt({ exerciseDir: xorcismDir, file: 'src/lib.rs', language: 'rust' });
const xorcismPromptText = xorcismPromptPlan.messages.map((message) => message.content).join('\n');
assert.match(xorcismPromptText, /Xorcism constraint/);
assert.match(xorcismPromptText, /data\.into_iter\(\)\.map/);
assert.match(xorcismPromptText, /owned Vec<u8>|output\.into_iter\(\)/);
assert.match(xorcismPromptText, /use std::borrow::Borrow/);

const extracted = extractFullFileFromResponse('Here is the file:\n```python\ndef answer():\n    return 42\n```\n');
assert.equal(extracted.text, 'def answer():\n    return 42\n');
assert.equal(extracted.kind, 'fenced-code');

const multiExtracted = extractFullFilesFromResponse('```widget.h\n// new header\n```\n```widget.cpp\n// new impl\n```\n', {
  files: ['widget.h', 'widget.cpp'],
  language: 'cpp',
});
assert.equal(multiExtracted.kind, 'multi-fenced-code');
assert.deepEqual(multiExtracted.files, {
  'widget.h': '// new header\n',
  'widget.cpp': '// new impl\n',
});

let captured;
const validRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer',
  language: 'python',
  pythonBin: python,
  thinkingType: 'disabled',
  reasoningEffort: 'max',
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (url, init) => {
    captured = { url, init };
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: '```python\ndef answer():\n    return 42\n```\n' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      }),
    };
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(validRun.ok, true);
assert.deepEqual(validRun.result.tests_outcomes, [true]);
assert.equal(validRun.result.deepseek_generation.runnerId, DEEPSEEK_POLYGLOT_RUNNER_ID);
assert.equal(validRun.result.deepseek_generation.model, 'deepseek-v4-pro');
assert.equal(validRun.result.deepseek_generation.usage.total_tokens, 18);
assert.equal(validRun.result.duration >= 0.2, true, 'duration must include DeepSeek generation latency, not only adapter write/test time');
assert.equal(fs.readFileSync(path.join(exerciseDir, 'answer.py'), 'utf8'), 'def answer():\n    return 0\n');
assert.equal(validRun.result.atomic_adapter.sourceTestdir, exerciseDir);
assert.notEqual(validRun.result.atomic_adapter.workDir, exerciseDir);
assert.equal(validRun.result.atomic_adapter.isolatedWorkDir, true);
assert.match(captured.url, /https:\/\/api\.deepseek\.com\/chat\/completions$/);
assert.equal(captured.init.headers.authorization, `Bearer ${fakeKey}`);
assert.equal(captured.init.body.includes(fakeKey), false, 'request body must not contain API secrets');
const capturedPayload = JSON.parse(captured.init.body);
assert.equal(capturedPayload.thinking.type, 'disabled');
assert.equal(capturedPayload.reasoning_effort, 'max');
assert.equal(validRun.result.deepseek_generation.thinkingType, 'disabled');
assert.equal(validRun.result.deepseek_generation.reasoningEffort, 'max');
assert.match(captured.init.body, /Implement answer\(\) so it returns 42/);
assert.equal(JSON.stringify(validRun.result).includes(fakeKey), false, 'result must not contain API secrets');

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
let repairRequests = 0;
let repairPrompt = '';
const repairedRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer',
  language: 'python',
  pythonBin: python,
  maxRepairs: 1,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    repairRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (repairRequests === 2) repairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: repairRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
    };
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(repairedRun.ok, true);
assert.equal(repairRequests, 2);
assert.match(repairPrompt, /Previous candidate failed/);
assert.match(repairPrompt, /AssertionError|FAILED|FAIL/);
assert.equal(repairedRun.result.deepseek_generation.repairAttempts, 1);
assert.equal(repairedRun.result.deepseek_generation.attempts.length, 2);
assert.equal(repairedRun.result.prompt_tokens, 6);
assert.equal(fs.readFileSync(path.join(exerciseDir, 'answer.py'), 'utf8'), 'def answer():\n    return 0\n');

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
let lateFailureRequests = 0;
const generationFailureAfterTestRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-generation-failure-after-test',
  language: 'python',
  pythonBin: python,
  maxRepairs: 1,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async () => {
    lateFailureRequests += 1;
    return lateFailureRequests === 1
      ? {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: 'def answer():\n    return 0\n' } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        }),
      }
      : {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'model unavailable' } }),
      };
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(generationFailureAfterTestRun.ok, false);
assert.match(generationFailureAfterTestRun.blockers.join('\n'), /model unavailable/);
assert.equal(generationFailureAfterTestRun.result.atomic_adapter.isolatedWorkDir, true);
assert.notEqual(generationFailureAfterTestRun.result.atomic_adapter.test, null);
assert.equal(generationFailureAfterTestRun.result.deepseek_generation.attempts.length, 1);
assert.equal(fs.readFileSync(path.join(exerciseDir, 'answer.py'), 'utf8'), 'def answer():\n    return 0\n');

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'hang-check.cjs'), "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nsetTimeout(() => {}, 1000);\n");
let timeoutRepairRequests = 0;
let timeoutRepairPrompt = '';
const timeoutRepairedRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-timeout-repair',
  language: 'python',
  maxRepairs: 1,
  timeoutMs: 250,
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    timeoutRepairRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (timeoutRepairRequests === 2) timeoutRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: timeoutRepairRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
      }),
    };
  },
  testCommand: [process.execPath, 'hang-check.cjs'],
});
assert.equal(timeoutRepairedRun.ok, true);
assert.equal(timeoutRepairRequests, 2);
assert.match(timeoutRepairPrompt, /timedOut:\s*true/);
assert.match(timeoutRepairPrompt, /durationSeconds:/);
assert.match(timeoutRepairPrompt, /deadlock|infinite loop/i);
assert.match(timeoutRepairPrompt, /sentinel|completion action|completion message/i);
assert.match(timeoutRepairPrompt, /shared channel/i);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'go-stack-fail.cjs'), "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('goroutine 47 [chan receive]:\\nrobot.Room3(...)\\nfor act := range action');\nprocess.exit(1);\n");
let goStackRequests = 0;
let goStackRepairPrompt = '';
const goStackDiagnosticRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-go-stack-diagnostic',
  language: 'python',
  maxRepairs: 1,
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    goStackRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (goStackRequests === 2) goStackRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: goStackRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
      }),
    };
  },
  testCommand: [process.execPath, 'go-stack-fail.cjs'],
});
assert.equal(goStackDiagnosticRun.ok, true);
assert.match(goStackRepairPrompt, /Room3/);
assert.match(goStackRepairPrompt, /chan receive/);
assert.match(goStackRepairPrompt, /finite receive|finite completion|tests never close/i);
assert.match(goStackRepairPrompt, /for range action/i);

const forthDictionaryPrompt = await captureRepairPromptForFailure({
  scriptName: 'forth-dictionary-fail.cjs',
  testcase: 'answer-forth-dictionary-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestForth (0.00s)');\nconsole.log('forth_test.go:19: Forth([]string{\": foo dup ;\", \"1 foo\"}) expected [1 1], got an error: \"unknown word: foo\"');\nprocess.exit(1);\n",
});
assert.match(forthDictionaryPrompt, /Forth dictionary diagnostic/);
assert.match(forthDictionaryPrompt, /Definitions can override built-ins|dictionary snapshot/i);

const matrixNilPrompt = await captureRepairPromptForFailure({
  scriptName: 'matrix-nil-compile-fail.cjs',
  testcase: 'answer-matrix-nil-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('# matrix [matrix.test]');\nconsole.error('./matrix_test.go:165:16: invalid operation: got == nil (mismatched types Matrix and untyped nil)');\nprocess.exit(1);\n",
});
assert.match(matrixNilPrompt, /nil-comparable type/i);
assert.match(matrixNilPrompt, /type Matrix \[\]\[\]int|struct Matrix cannot be compared to nil/i);

const scaleSlicePrompt = await captureRepairPromptForFailure({
  scriptName: 'scale-slice-compare-fail.cjs',
  testcase: 'answer-scale-slice-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('# scale [scale.test]');\nconsole.error('./scale_generator.go:70:5: invalid operation: base == sharps (slice can only be compared to nil)');\nprocess.exit(1);\n",
});
assert.match(scaleSlicePrompt, /slice comparison diagnostic/i);
assert.match(scaleSlicePrompt, /Do not compare two slices with ==|boolean, enum, or index/i);

const ledgerWhitespacePrompt = await captureRepairPromptForFailure({
  scriptName: 'ledger-whitespace-fail.cjs',
  testcase: 'answer-ledger-whitespace-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestFormatLedgerSuccess (0.00s)');\nconsole.log('ledger_test.go:259: FormatLedger for input named \"euros\" failed');\nconsole.log('got:');\nconsole.log('Date       | Description               | Change');\nconsole.log('01/01/2015 | Buy present               |    (€10.00)');\nconsole.log('want:');\nconsole.log('Date       | Description               | Change');\nconsole.log('01/01/2015 | Buy present               |      (€10.00)');\nprocess.exit(1);\n",
});
assert.match(ledgerWhitespacePrompt, /Exact whitespace diagnostic/);
assert.match(ledgerWhitespacePrompt, /byte-exact|left padding|fixed-width/i);

const goFloorDivisionPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-floor-division-fail.cjs',
  testcase: 'answer-go-floor-division-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestModifier (0.00s)');\nconsole.log('dnd_character_test.go:10: Modifier(3) = -3, want -4');\nconsole.log('dnd_character_test.go:10: Modifier(9) = 0, want -1');\nprocess.exit(1);\n",
});
assert.match(goFloorDivisionPrompt, /Go floor-division diagnostic/);
assert.match(goFloorDivisionPrompt, /truncates toward zero|negative odd/i);

const goCounterConsistencyPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-counter-consistency-fail.cjs',
  testcase: 'answer-go-counter-consistency-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestReadCountConsistencyReader (0.00s)');\nconsole.log('paasio_test.go:218: expected 1759 ops@87950 bytes read; 1758 ops reported');\nconsole.log('paasio_test.go:256: expected 555 nops@27750 bytes written; 554 ops reported');\nprocess.exit(1);\n",
});
assert.match(goCounterConsistencyPrompt, /Go counter consistency diagnostic/);
assert.match(goCounterConsistencyPrompt, /linearizable pair|same mutex|independent atomics/i);

const goBowlingTenthFramePrompt = await captureRepairPromptForFailure({
  scriptName: 'go-bowling-tenth-frame-fail.cjs',
  testcase: 'answer-go-bowling-tenth-frame-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestRoll (0.00s)');\nconsole.log('bowling_test.go:32: Roll(6) after Previous Rolls: []int{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 5} expected an error, got nil');\nconsole.log('Explanation: Pin count exceeds pins on the lane');\nconsole.log('the second bonus rolls after a strike in the last frame cannot be a strike if the first one is not a strike');\nprocess.exit(1);\n",
});
assert.match(goBowlingTenthFramePrompt, /Go bowling tenth-frame diagnostic/);
assert.match(goBowlingTenthFramePrompt, /second bonus|first bonus|10 - first/i);

const goFoodChainRefrainPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-food-chain-refrain-fail.cjs',
  testcase: 'answer-go-food-chain-refrain-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestSong (0.00s)');\nconsole.log('food_chain_test.go:99: first difference in line 2:');\nconsole.log('-- got : \"I don\\'t know why she swallowed the fly. Perhaps she\\'ll die.I don\\'t know why she swallowed the fly. Perhaps she\\'ll die.\"');\nconsole.log('-- want: \"I don\\'t know why she swallowed the fly. Perhaps she\\'ll die.\"');\nprocess.exit(1);\n",
});
assert.match(goFoodChainRefrainPrompt, /Go food-chain refrain diagnostic/);
assert.match(goFoodChainRefrainPrompt, /Verse\(1\)|exactly once|duplicate/i);

const goScaleEnharmonicPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-scale-generator-enharmonic-fail.cjs',
  testcase: 'answer-go-scale-generator-enharmonic-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestScale (0.00s)');\nconsole.log('    --- FAIL: TestScale/Locrian_mode (0.00s)');\nconsole.log('        scale_generator_test.go:13: Scale(\"g\", \"mMMmMMM\")');\nconsole.log('             got:[]string{\"G\", \"G#\", \"A#\", \"C\", \"C#\", \"D#\", \"F\", \"G\"}');\nconsole.log('            want:[]string{\"G\", \"Ab\", \"Bb\", \"C\", \"Db\", \"Eb\", \"F\", \"G\"}');\nconsole.log('    --- FAIL: TestScale/Harmonic_minor (0.00s)');\nconsole.log('        scale_generator_test.go:13: Scale(\"d\", \"MmMMmAm\")');\nconsole.log('             got:[]string{\"D\", \"E\", \"F\", \"G\", \"A\", \"A#\", \"C#\", \"D\"}');\nconsole.log('            want:[]string{\"D\", \"E\", \"F\", \"G\", \"A\", \"Bb\", \"Db\", \"D\"}');\nprocess.exit(1);\n",
});
assert.match(goScaleEnharmonicPrompt, /Go scale-generator enharmonic spelling diagnostic/);
assert.match(goScaleEnharmonicPrompt, /original tonic case|flat chromatic|minor flat keys/i);

const javaPublicFieldAccessPrompt = await captureRepairPromptForFailure({
  scriptName: 'java-public-field-access-fail.cjs',
  testcase: 'answer-java-public-field-access-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('/tmp/rest-api/src/main/java/RestApi.java:159: error: cannot find symbol');\nconsole.error('            if (iou.name().equals(name)) {');\nconsole.error('                   ^');\nconsole.error('  symbol:   method name()');\nconsole.error('  location: variable iou of type Iou');\nconsole.error('/tmp/rest-api/src/main/java/RestApi.java:160: error: cannot find symbol');\nconsole.error('            builder.owedBy(iou.name(), iou.amount());');\nconsole.error('                                          ^');\nconsole.error('  symbol:   method amount()');\nconsole.error('  location: variable iou of type Iou');\nconsole.error('28 errors');\nprocess.exit(1);\n",
});
assert.match(javaPublicFieldAccessPrompt, /Java public field accessor diagnostic/);
assert.match(javaPublicFieldAccessPrompt, /public fields|iou\.name|iou\.amount|Do not call/i);

const javaRestApiIouDirectionPrompt = await captureRepairPromptForFailure({
  scriptName: 'java-rest-api-iou-direction-fail.cjs',
  testcase: 'answer-java-rest-api-iou-direction-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('RestApiTest > bothUsersHave0Balance() FAILED');\nconsole.log('expected: \"{\\\"users\\\":[{\\\"owes\\\":{},\\\"balance\\\":3,\\\"name\\\":\\\"Adam\\\",\\\"owedBy\\\":{\\\"Bob\\\":3}},{\\\"owes\\\":{\\\"Adam\\\":3},\\\"balance\\\":-3,\\\"name\\\":\\\"Bob\\\",\\\"owedBy\\\":{}}]}\"');\nconsole.log(' but was: \"{\\\"users\\\":[{\\\"owes\\\":{\\\"Bob\\\":3},\\\"balance\\\":-3,\\\"name\\\":\\\"Adam\\\",\\\"owedBy\\\":{}},{\\\"owes\\\":{},\\\"balance\\\":3,\\\"name\\\":\\\"Bob\\\",\\\"owedBy\\\":{\\\"Adam\\\":3}}]}\"');\nprocess.exit(1);\n",
});
assert.match(javaRestApiIouDirectionPrompt, /Java REST IOU direction diagnostic/);
assert.match(javaRestApiIouDirectionPrompt, /borrower owes lender|lender.*owedBy|positive balance/i);

const javaMazeBoundaryPrompt = await captureRepairPromptForFailure({
  scriptName: 'java-maze-boundary-fail.cjs',
  testcase: 'answer-java-maze-boundary-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('MazeGeneratorTest > theDimensionsOfTheMazeAreCorrect() FAILED');\nconsole.log('    java.lang.ArrayIndexOutOfBoundsException: Index 18 out of bounds for length 18');\nconsole.log('        at MazeGenerator.generatePerfectMaze(MazeGenerator.java:101)');\nconsole.log('        at MazeGenerator.generatePerfectMaze(MazeGenerator.java:38)');\nconsole.log('        at MazeGeneratorTest.theDimensionsOfTheMazeAreCorrect(MazeGeneratorTest.java:41)');\nprocess.exit(1);\n",
});
assert.match(javaMazeBoundaryPrompt, /Java maze boundary diagnostic/);
assert.match(javaMazeBoundaryPrompt, /2\*rows \+ 1|2\*columns \+ 1|x == columns|y == rows|array bounds/i);

const goForthTimeoutPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-forth-timeout-fail.cjs',
  testcase: 'answer-go-forth-timeout-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('goroutine 18 gp=0x1 m=nil [chan receive]:');\nconsole.log('testing.(*T).Run(0x1, {0x598c6f?, 0x0?}, 0x1)');\nconsole.log('forth.TestForth(0x1)');\nconsole.log('FAIL\\tforth\\t1.123s');\nprocess.exit(1);\n",
});
assert.match(goForthTimeoutPrompt, /Forth dictionary diagnostic/);
assert.match(goForthTimeoutPrompt, /dictionary snapshot|override built-ins|case-insensitive/i);

const goPokerTieOrderPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-poker-tie-order-fail.cjs',
  testcase: 'answer-go-poker-tie-order-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestBestHandValid (0.00s)');\nconsole.log('    --- FAIL: TestBestHandValid/a_tie_has_multiple_winners (0.00s)');\nconsole.log('        poker_test.go:62: BestHand([A♤ K♤ Q♤ J♤ 9♤ A♡ K♡ Q♡ J♡ 9♡]) = [A♡ K♡ Q♡ J♡ 9♡ A♤ K♤ Q♤ J♤ 9♤], want: [A♤ K♤ Q♤ J♤ 9♤ A♡ K♡ Q♡ J♡ 9♡]');\nprocess.exit(1);\n",
});
assert.match(goPokerTieOrderPrompt, /Go poker tie-order diagnostic/);
assert.match(goPokerTieOrderPrompt, /original input order|Do not sort winners|append tied originals/i);

const goPokerUtf8CardPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-poker-utf8-card-fail.cjs',
  testcase: 'answer-go-poker-utf8-card-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestBestHandValid/three_of_a_kind_beats_two_pair (0.00s)');\nconsole.log('        poker_test.go:59: BestHand([2♤ 8♡ 2♡ 8♢ J♡ 4♤ 5♡ 4♧ 8♤ 4♡]) returned error: invalid card: 2♤, want: [4♤ 5♡ 4♧ 8♤ 4♡]');\nprocess.exit(1);\n",
});
assert.match(goPokerUtf8CardPrompt, /Go poker UTF-8 card parsing diagnostic/);
assert.match(goPokerUtf8CardPrompt, /DecodeLastRuneInString|\[\]rune|not byte/i);

const goPovRerootPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-pov-reroot-fail.cjs',
  testcase: 'answer-go-pov-reroot-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestFromPov (0.00s)');\nconsole.log('    --- FAIL: TestFromPov/Can_reroot_a_tree_with_a_parent_and_one_sibling (0.00s)');\nconsole.log('        pov_test.go:171: expected: (x (parent sibling)), got: (parent sibling x)');\nconsole.log('    --- FAIL: TestFromPov/Moves_children_of_the_new_root_to_same_level_as_former_parent (0.00s)');\nconsole.log('        pov_test.go:171: expected: (x kid-0 kid-1 parent), got: (parent (x kid-0 kid-1))');\nprocess.exit(1);\n",
});
assert.match(goPovRerootPrompt, /Go POV reroot orientation diagnostic/);
assert.match(goPovRerootPrompt, /new root|former parent|Do not return the old root/i);

const goReactPropagationPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-react-propagation-fail.cjs',
  testcase: 'answer-go-react-propagation-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: TestCompute2Diamond (0.00s)');\nconsole.log('    react_test.go:18: c3.Value() isn\\'t properly computed based on changed input cell value: expected 8, got 0');\nconsole.log('--- FAIL: TestCompute1Chain (0.00s)');\nconsole.log('    react_test.go:18: c.Value() isn\\'t properly computed based on changed input cell value: expected 92345678, got 12345678');\nconsole.log('--- FAIL: TestOnlyCallOnceOnMultipleDepChanges (0.00s)');\nconsole.log('    react_test.go:242: callback function was not called');\nprocess.exit(1);\n",
});
assert.match(goReactPropagationPrompt, /Go react propagation diagnostic/);
assert.match(goReactPropagationPrompt, /ComputeCell.*subscribe|compute cells.*observable|chains\/diamonds/i);

const goIncompleteRewritePrompt = await captureRepairPromptForFailure({
  scriptName: 'go-incomplete-rewrite-fail.cjs',
  testcase: 'answer-go-incomplete-rewrite-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('./react.go:10:9: cannot use &reactor{} (value of type *reactor) as Reactor value in return statement: *reactor does not implement Reactor (missing method CreateCompute1)');\nconsole.error('./react.go:67:4: r.propagateFrom undefined (type *reactor has no field or method propagateFrom)');\nconsole.error('./react.go:76:11: c.getReactor undefined (type *cell has no field or method getReactor)');\nprocess.exit(1);\n",
});
assert.match(goIncompleteRewritePrompt, /Go interface completeness diagnostic/);
assert.match(goIncompleteRewritePrompt, /implement all methods|required interface|helper.*called/i);

const goRobotSimulatorCompletionPrompt = await captureRepairPromptForFailure({
  scriptName: 'go-robot-simulator-completion-fail.cjs',
  testcase: 'answer-go-robot-simulator-completion-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('goroutine 18 [chan receive]:');\nconsole.log('robot_simulator.Room3(...)');\nconsole.log('Room3 blocked waiting on for range action because tests never close the action channel');\nprocess.exit(1);\n",
});
assert.match(goRobotSimulatorCompletionPrompt, /Go robot-simulator finite completion diagnostic/);
assert.match(goRobotSimulatorCompletionPrompt, /do not range over action|completion action|tests do not close/i);

const cppTemplateVisibilityPrompt = await captureRepairPromptForFailure({
  scriptName: 'cpp-template-visibility-fail.cjs',
  testcase: 'answer-cpp-template-visibility-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('/usr/bin/ld: undefined reference to circular_buffer::circular_buffer<int>::write(int)');\nconsole.error('/usr/bin/ld: undefined reference to circular_buffer::circular_buffer<std::string>::read()');\nconsole.error('collect2: error: ld returned 1 exit status');\nprocess.exit(1);\n",
});
assert.match(cppTemplateVisibilityPrompt, /C\+\+ template visibility diagnostic/);
assert.match(cppTemplateVisibilityPrompt, /header|visible at instantiation|template method bodies/i);

const cppMissingIncludePrompt = await captureRepairPromptForFailure({
  scriptName: 'cpp-missing-include-fail.cjs',
  testcase: 'answer-cpp-missing-include-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error(\"binary_search_tree.h:97:14: error: 'vector' in namespace 'std' does not name a template type\");\nconsole.error(\"binary_search_tree.h:5:1: note: 'std::vector' is defined in header '<vector>'; did you forget to '#include <vector>'?\");\nprocess.exit(1);\n",
});
assert.match(cppMissingIncludePrompt, /C\+\+ missing include diagnostic/);
assert.match(cppMissingIncludePrompt, /#include <vector>|<vector>/);
assert.match(cppMissingIncludePrompt, /direct repair instruction|compiler.*suggest/i);

const cppMissingMemberStatePrompt = await captureRepairPromptForFailure({
  scriptName: 'cpp-missing-member-state-fail.cjs',
  testcase: 'answer-cpp-missing-member-state-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error(\"binary_search_tree.h:56:25: error: 'stack_' was not declared in this scope\");\nconsole.error(\"binary_search_tree.h:69:36: error: 'const class binary_search_tree::binary_tree<unsigned int>::iterator' has no member named 'stack_'\");\nprocess.exit(1);\n",
});
assert.match(cppMissingMemberStatePrompt, /C\+\+ missing member state diagnostic/);
assert.match(cppMissingMemberStatePrompt, /stack_|member state|nested class/i);
assert.match(cppMissingMemberStatePrompt, /declare.*member|class.*does not declare/i);

const cppBinaryTreeTraversalPrompt = await captureRepairPromptForFailure({
  scriptName: 'cpp-binary-tree-traversal-fail.cjs',
  testcase: 'answer-cpp-binary-tree-traversal-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('--- FAIL: can_sort_complex_tree');\nconsole.log('binary_search_tree_test.cpp:98: FAILED:');\nconsole.log('REQUIRE( expected == actual )');\nconsole.log('with expansion:');\nconsole.log('{ 1, 2, 3, 5, 6, 7 } == { 1 }');\nprocess.exit(1);\n",
});
assert.match(cppBinaryTreeTraversalPrompt, /C\+\+ binary-search-tree traversal diagnostic/);
assert.match(cppBinaryTreeTraversalPrompt, /in-order|left.*node.*right|entire tree/i);

const rustDependencyPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-dependency-fail.cjs',
  testcase: 'answer-rust-dependency-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0432]: unresolved import `num_bigint`');\nconsole.error('= help: if you wanted to use a crate named `num_bigint`, use `cargo add num_bigint` to add it to your `Cargo.toml`');\nprocess.exit(1);\n",
});
assert.match(rustDependencyPrompt, /Rust dependency diagnostic/);
assert.match(rustDependencyPrompt, /Do not introduce a new external crate|standard library/i);

const rustPreimplementedPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-preimplemented-fail.cjs',
  testcase: 'answer-rust-preimplemented-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('   --> src/pre_implemented.rs:48:5');\nconsole.error('duplicate definitions for `seek_forward`');\nconsole.error('   ::: src/lib.rs:229:5');\nprocess.exit(1);\n",
});
assert.match(rustPreimplementedPrompt, /Rust preimplemented-method diagnostic/);
assert.match(rustPreimplementedPrompt, /Do not duplicate|pre_implemented\.rs/i);

const rustLifetimePrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-lifetime-fail.cjs',
  testcase: 'answer-rust-lifetime-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0311]: the associated type `<Data as IntoIterator>::IntoIter` may not live long enough');\nconsole.error('error[E0373]: closure may outlive the current function, but it borrows `cb1`');\nprocess.exit(1);\n",
});
assert.match(rustLifetimePrompt, /Rust lifetime diagnostic/);
assert.match(rustLifetimePrompt, /not force callbacks or iterators to be static|explicit lifetime bounds|owned values/i);

const reactCallbackLifetimePrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-react-callback-lifetime-fail.cjs',
  testcase: 'answer-rust-react-callback-lifetime-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0373]: closure may outlive the current function, but it borrows `cb1`');\nconsole.error('note: function requires argument type to outlive `\\'static`');\nconsole.error('reactor.add_callback(output, |v| cb1.callback_called(v));');\nprocess.exit(1);\n",
});
assert.match(reactCallbackLifetimePrompt, /React callback lifetime diagnostic/);
assert.match(reactCallbackLifetimePrompt, /must not require F: \\'static|Box<dyn FnMut\(T\) \+ \\'a>|borrow local CallbackRecorder/i);

const rustNoRandPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-no-rand-fail.cjs',
  testcase: 'answer-rust-no-rand-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0432]: unresolved import `rand`');\nconsole.error('use rand::Rng;');\nconsole.error('let mut rng = rand::thread_rng();');\nprocess.exit(1);\n",
});
assert.match(rustNoRandPrompt, /Rust no-rand diagnostic/);
assert.match(rustNoRandPrompt, /AtomicUsize|deterministic base-26|Remove every rand/i);

const xorcismIteratorPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-xorcism-iterator-fail.cjs',
  testcase: 'answer-rust-xorcism-iterator-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0311]: the associated type `<Data as IntoIterator>::IntoIter` may not live long enough');\nconsole.error(\"pub fn munge<Data>(&mut self, data: Data) -> impl Iterator<Item = u8> + '_\");\nprocess.exit(1);\n",
});
assert.match(xorcismIteratorPrompt, /Xorcism iterator diagnostic/);
assert.match(xorcismIteratorPrompt, /owned Vec<u8>|output\.into_iter\(\)|Data::IntoIter/i);

const rustBorrowTraitPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-borrow-trait-fail.cjs',
  testcase: 'answer-rust-borrow-trait-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error[E0599]: no method named `borrow` found for associated type `<Data as IntoIterator>::Item` in the current scope');\nconsole.error('help: trait `Borrow` which provides `borrow` is implemented but not in scope; perhaps you want to import it');\nprocess.exit(1);\n",
});
assert.match(rustBorrowTraitPrompt, /Rust Borrow trait diagnostic/);
assert.match(rustBorrowTraitPrompt, /use std::borrow::Borrow|trait methods only work when the trait is imported/i);

const rustJsonOutputPrompt = await captureRepairPromptForFailure({
  scriptName: 'rust-json-output-fail.cjs',
  testcase: 'answer-rust-json-output-diagnostic',
  scriptBody: "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.error('error: expected item, found `{`');\nconsole.error('{\\\"result\\\":\\\"\\\",\\\"hint\\\":\\\"File content exceeds maximum allowed characters\\\"}');\nprocess.exit(1);\n",
});
assert.match(rustJsonOutputPrompt, /Rust JSON-output diagnostic/);
assert.match(rustJsonOutputPrompt, /not Rust source|Return only the complete Rust source file/i);

const pythonConnectGraphPrompt = await captureRepairPromptForFailure({
  scriptName: "python-connect-graph-fail.cjs",
  testcase: "answer-python-connect-graph-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.log(\"FAIL: test_x_can_win_on_a_1x1_board (connect_test.ConnectTest.test_x_can_win_on_a_1x1_board)\");\nconsole.log(\"AssertionError: None != X\");\nconsole.log(\"FAIL: test_o_wins_crossing_from_top_to_bottom (connect_test.ConnectTest.test_o_wins_crossing_from_top_to_bottom)\");\nconsole.log(\"AssertionError: None != O\");\nconsole.log(\"FAIL: test_an_empty_board_has_no_winner (connect_test.ConnectTest.test_an_empty_board_has_no_winner)\");\nconsole.log(\"AssertionError: None != empty string\");\nprocess.exit(1);\n",
});
assert.match(pythonConnectGraphPrompt, /Python connect graph-search diagnostic/);
assert.match(pythonConnectGraphPrompt, /hex.*neighbors|BFS|DFS|left.*right|top.*bottom/i);

const scaleGeneratorCompletePrompt = await captureRepairPromptForFailure({
  scriptName: "scale-generator-complete-fail.cjs",
  testcase: "answer-scale-generator-complete-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.log(\"FAIL: test_chromatic_scale_with_sharps (scale_generator_test.ScaleGeneratorTest.test_chromatic_scale_with_sharps)\");\nconsole.log(\"AssertionError: None != [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]\");\nconsole.log(\"FAIL: test_locrian_mode (scale_generator_test.ScaleGeneratorTest.test_locrian_mode)\");\nconsole.log(\"AssertionError: None != [G, Ab, Bb, C, Db, Eb, F, G]\");\nprocess.exit(1);\n",
});
assert.match(scaleGeneratorCompletePrompt, /Scale generator diagnostic/);
assert.match(scaleGeneratorCompletePrompt, /original tonic|minor flat keys|M=2|m=1|A=3/i);

const wordyParserPrompt = await captureRepairPromptForFailure({
  scriptName: "wordy-parser-fail.cjs",
  testcase: "answer-wordy-parser-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.log(\"FAIL: test_addition_and_multiplication (wordy_test.WordyTest.test_addition_and_multiplication)\");\nconsole.log(\"AssertionError: None != -8 for What is -3 plus 7 multiplied by -2?\");\nconsole.log(\"FAIL: test_reject_two_operations_in_a_row (wordy_test.WordyTest.test_reject_two_operations_in_a_row)\");\nconsole.log(\"AssertionError: ValueError not raised for What is 1 plus plus 2?\");\nconsole.log(\"FAIL: test_unknown_operation (wordy_test.WordyTest.test_unknown_operation)\");\nconsole.log(\"expected ValueError message unknown operation for What is 52 cubed?\");\nprocess.exit(1);\n",
});
assert.match(wordyParserPrompt, /Wordy parser diagnostic/);
assert.match(wordyParserPrompt, /left-to-right|syntax error|unknown operation|multiplied by|divided by/i);

const wordyEmptyQuestionPrompt = await captureRepairPromptForFailure({
  scriptName: "wordy-empty-question-fail.cjs",
  testcase: "answer-wordy-empty-question-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.log(\"FAIL: test_reject_problem_with_no_operands_or_operators (wordy_test.WordyTest.test_reject_problem_with_no_operands_or_operators)\");\nconsole.log(\"AssertionError: unknown operation != syntax error for What is?\");\nprocess.exit(1);\n",
});
assert.match(wordyEmptyQuestionPrompt, /Wordy empty-question diagnostic/);
assert.match(wordyEmptyQuestionPrompt, /What is\?|empty expression|syntax error/i);
assert.match(wordyEmptyQuestionPrompt, /do not require.*space|no space after is|What is\? exactly/i);

const rustBookStoreStatePrompt = await captureRepairPromptForFailure({
  scriptName: "rust-book-store-state-fail.cjs",
  testcase: "answer-rust-book-store-state-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.log(\"running 18 tests\");\nconsole.log(\"only_a_single_book --- FAILED\");\nconsole.log(\"thread only_a_single_book panicked at src/lib.rs:70:19:\");\nconsole.log(\"index out of bounds: the len is 0 but the index is 0\");\nconsole.error(\"error: test failed, to rerun pass --test book-store\");\nprocess.exit(1);\n",
});
assert.match(rustBookStoreStatePrompt, /Rust book-store recursive-state diagnostic/);
assert.match(rustBookStoreStatePrompt, /owned canonical state|do not mutate.*caller|single book.*800/i);

const rustParallelFrequencyPrompt = await captureRepairPromptForFailure({
  scriptName: "rust-parallel-frequency-moved-mutex-fail.cjs",
  testcase: "answer-rust-parallel-frequency-reduction-diagnostic",
  scriptBody: "const fs = require(\"node:fs\");\nif (fs.readFileSync(\"answer.py\", \"utf8\").includes(\"return 42\")) process.exit(0);\nconsole.error(\"error[E0382]: use of moved value: `result`\");\nconsole.error(\"value moved into closure here, in previous iteration of loop\");\nconsole.error(\"move occurs because `result` has type `std::sync::Mutex<HashMap<char, usize>>`, which does not implement the `Copy` trait\");\nconsole.error(\"error: could not compile `parallel-letter-frequency` (lib) due to 2 previous errors\");\nprocess.exit(1);\n",
});
assert.match(rustParallelFrequencyPrompt, /Rust parallel reduction diagnostic/);
assert.match(rustParallelFrequencyPrompt, /local.*HashMap|worker.*map|merge.*parent|join/i);
assert.match(rustParallelFrequencyPrompt, /do not move.*Mutex|avoid.*shared.*Mutex|thread::scope/i);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'duplicate-log-fail.cjs'), "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('Sim: An undefined command in a script');\nconsole.log('Sim: An undefined command in a script');\nconsole.log('Got 2 messages, want 1.');\nprocess.exit(1);\n");
let duplicateLogRequests = 0;
let duplicateLogRepairPrompt = '';
const duplicateLogDiagnosticRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-duplicate-log-diagnostic',
  language: 'python',
  maxRepairs: 1,
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    duplicateLogRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (duplicateLogRequests === 2) duplicateLogRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: duplicateLogRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
      }),
    };
  },
  testCommand: [process.execPath, 'duplicate-log-fail.cjs'],
});
assert.equal(duplicateLogDiagnosticRun.ok, true);
assert.match(duplicateLogRepairPrompt, /Got 2 messages, want 1/);
assert.match(duplicateLogRepairPrompt, /undefined command/i);
assert.match(duplicateLogRepairPrompt, /once per script|stop processing|do not log per character/i);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'duplicate-no-name-fail.cjs'), "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('=== RUN   TestNoName');\nconsole.log('Sim: a robot without a name');\nconsole.log('Sim: a robot without a name');\nconsole.log('Got 2 messages, want 1.');\nprocess.exit(1);\n");
let duplicateNoNameRequests = 0;
let duplicateNoNameRepairPrompt = '';
const duplicateNoNameDiagnosticRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-duplicate-no-name-diagnostic',
  language: 'python',
  maxRepairs: 1,
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    duplicateNoNameRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (duplicateNoNameRequests === 2) duplicateNoNameRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: duplicateNoNameRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
      }),
    };
  },
  testCommand: [process.execPath, 'duplicate-no-name-fail.cjs'],
});
assert.equal(duplicateNoNameDiagnosticRun.ok, true);
assert.match(duplicateNoNameRepairPrompt, /without a name/i);
assert.match(duplicateNoNameRepairPrompt, /robot producer and in the room validator|Choose one owner/i);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
fs.writeFileSync(path.join(exerciseDir, 'unknown-robot-hang.cjs'), "const fs = require('node:fs');\nif (fs.readFileSync('answer.py', 'utf8').includes('return 42')) process.exit(0);\nconsole.log('=== RUN   TestBadRobot');\nconsole.log('Sim: An action from an unknown robot');\nconsole.log('goroutine 127 [chan receive]:');\nconsole.log('robot.Room3(...)');\nprocess.exit(1);\n");
let unknownRobotRequests = 0;
let unknownRobotRepairPrompt = '';
const unknownRobotDiagnosticRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-unknown-robot-diagnostic',
  language: 'python',
  maxRepairs: 1,
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    unknownRobotRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (unknownRobotRequests === 2) unknownRobotRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: unknownRobotRequests === 1
          ? 'def answer():\n    return 0\n'
          : 'def answer():\n    return 42\n' } }],
        usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 },
      }),
    };
  },
  testCommand: [process.execPath, 'unknown-robot-hang.cjs'],
});
assert.equal(unknownRobotDiagnosticRun.ok, true);
assert.match(unknownRobotRepairPrompt, /TestBadRobot/);
assert.match(unknownRobotRepairPrompt, /unknown robot/i);
assert.match(unknownRobotRepairPrompt, /Unknown robot diagnostic/i);
assert.match(unknownRobotRepairPrompt, /unknown.*complete|complete.*unknown/i);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
let malformedRequests = 0;
const malformedThenValidRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-malformed-retry',
  language: 'python',
  pythonBin: python,
  maxRepairs: 1,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async () => {
    malformedRequests += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(malformedRequests === 1
        ? { model: 'deepseek-v4-pro', choices: [{ message: {} }], usage: { prompt_tokens: 5, completion_tokens: 20, total_tokens: 25 } }
        : { model: 'deepseek-v4-pro', choices: [{ message: { content: 'def answer():\n    return 42\n' } }], usage: { prompt_tokens: 6, completion_tokens: 7, total_tokens: 13 } }),
    };
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(malformedThenValidRun.ok, true);
assert.equal(malformedRequests, 2);
assert.equal(malformedThenValidRun.result.num_malformed_responses, 1);
assert.equal(malformedThenValidRun.result.deepseek_generation.malformedResponses, 1);

fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
const invalidRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer',
  language: 'python',
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'deepseek-v4-pro',
      choices: [{ message: { content: '```python\ndef answer(:\n    return 42\n```\n' } }],
      usage: { total_tokens: 9 },
    }),
  }),
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(invalidRun.ok, false);
assert.equal(invalidRun.result.syntax_errors, 1);
assert.equal(fs.readFileSync(path.join(exerciseDir, 'answer.py'), 'utf8'), 'def answer():\n    return 0\n', 'invalid model output must not mutate target file');

let timeoutSignal = null;
const timedOutRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-timeout',
  language: 'python',
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  timeoutMs: 25,
  fetchImpl: async (_url, init = {}) => {
    timeoutSignal = init.signal ?? null;
    if (!timeoutSignal) throw new Error('timeout signal missing');
    return await new Promise((_resolve, reject) => {
      timeoutSignal.addEventListener('abort', () => reject(new Error('proof fetch aborted')), { once: true });
    });
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(timeoutSignal instanceof AbortSignal, true);
assert.equal(timeoutSignal.aborted, true);
assert.equal(timedOutRun.ok, false);
assert.match(timedOutRun.blockers.join('\n'), /timed out after 25ms/);

const ignoredAbortRace = await Promise.race([
  runDeepSeekAtomicPolyglotCase({
    exerciseDir,
    file: 'answer.py',
    testcase: 'answer-ignored-abort-timeout',
    language: 'python',
    pythonBin: python,
    env: { DEEPSEEK_API_KEY: fakeKey },
    timeoutMs: 25,
    fetchImpl: async () => await new Promise(() => {}),
    testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
  }),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 250)),
]);
assert.notEqual(ignoredAbortRace, 'hung');
assert.equal(ignoredAbortRace.ok, false);
assert.match(ignoredAbortRace.blockers.join('\n'), /timed out after 25ms/);

let bodyTimeoutSignal = null;
const bodyTimeoutRace = await Promise.race([
  runDeepSeekAtomicPolyglotCase({
    exerciseDir,
    file: 'answer.py',
    testcase: 'answer-body-timeout',
    language: 'python',
    pythonBin: python,
    env: { DEEPSEEK_API_KEY: fakeKey },
    timeoutMs: 25,
    fetchImpl: async (_url, init = {}) => {
      bodyTimeoutSignal = init.signal ?? null;
      return {
        ok: true,
        status: 200,
        text: async () => await new Promise(() => {}),
      };
    },
    testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
  }),
  new Promise((resolve) => setTimeout(() => resolve('hung'), 250)),
]);
assert.notEqual(bodyTimeoutRace, 'hung');
assert.equal(bodyTimeoutSignal instanceof AbortSignal, true);
assert.equal(bodyTimeoutSignal.aborted, true);
assert.equal(bodyTimeoutRace.ok, false);
assert.match(bodyTimeoutRace.blockers.join('\n'), /timed out after 25ms/);

let splitTimeoutSignal = null;
fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
const splitTimeoutRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer-split-timeout',
  language: 'python',
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  timeoutMs: 25,
  requestTimeoutMs: 500,
  testTimeoutMs: 500,
  fetchImpl: async (_url, init = {}) => {
    splitTimeoutSignal = init.signal ?? null;
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: 'def answer():\n    return 42\n' } }],
        usage: { total_tokens: 6 },
      }),
    };
  },
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
});
assert.equal(splitTimeoutSignal instanceof AbortSignal, true);
assert.equal(splitTimeoutSignal.aborted, false);
assert.equal(splitTimeoutRun.ok, true);

const outFile = path.join(root, 'atomic-deepseek-result.json');
fs.writeFileSync(path.join(exerciseDir, 'answer.py'), 'def answer():\n    return 0\n');
const persistedRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  testcase: 'answer',
  language: 'python',
  pythonBin: python,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      model: 'deepseek-v4-pro',
      choices: [{ message: { content: 'def answer():\n    return 42\n' } }],
      usage: { total_tokens: 6 },
    }),
  }),
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
  out: outFile,
});
assert.equal(persistedRun.ok, true);
assert.equal(fs.existsSync(outFile), true);
const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
assert.deepEqual(persisted.tests_outcomes, [true]);
assert.equal(JSON.stringify(persisted).includes(fakeKey), false);

const multiDir = path.join(root, 'cpp', 'exercises', 'practice', 'widget');
fs.mkdirSync(path.join(multiDir, '.docs'), { recursive: true });
fs.writeFileSync(path.join(multiDir, '.docs', 'instructions.md'), '# Instructions\n\nReplace both widget files.\n');
fs.writeFileSync(path.join(multiDir, 'widget.h'), '// old header\n');
fs.writeFileSync(path.join(multiDir, 'widget.cpp'), '// old impl\n');
fs.writeFileSync(path.join(multiDir, 'widget_test.cpp'), '// test marker\n');
fs.writeFileSync(path.join(multiDir, 'check-multi.cjs'), "const fs = require('node:fs');\nif (!fs.readFileSync('widget.h', 'utf8').includes('new header')) process.exit(1);\nif (!fs.readFileSync('widget.cpp', 'utf8').includes('new impl')) process.exit(1);\n");
let multiPrompt = '';
const multiRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir: multiDir,
  file: 'widget.cpp',
  files: ['widget.h', 'widget.cpp'],
  testcase: 'cpp/widget',
  language: 'cpp',
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    multiPrompt = body.messages.map((message) => message.content).join('\n');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: '```widget.h\n// new header\n```\n```widget.cpp\n// new impl\n```\n' } }],
        usage: { prompt_tokens: 13, completion_tokens: 14, total_tokens: 27 },
      }),
    };
  },
  testCommand: [process.execPath, 'check-multi.cjs'],
});
assert.equal(multiRun.ok, true);
assert.match(multiPrompt, /Target files:/);
assert.match(multiPrompt, /widget.h/);
assert.match(multiPrompt, /widget.cpp/);
assert.equal(multiRun.result.atomic_adapter.apply.mode, 'multi-file-replace');
assert.deepEqual(multiRun.result.atomic_adapter.files, ['widget.h', 'widget.cpp']);
assert.equal(multiRun.result.atomic_adapter.sourceTestdir, multiDir);
assert.notEqual(multiRun.result.atomic_adapter.workDir, multiDir);
assert.equal(multiRun.result.atomic_adapter.isolatedWorkDir, true);
assert.equal(fs.readFileSync(path.join(multiDir, 'widget.h'), 'utf8'), '// old header\n');
assert.equal(fs.readFileSync(path.join(multiDir, 'widget.cpp'), 'utf8'), '// old impl\n');
assert.equal(JSON.stringify(multiRun.result).includes(fakeKey), false);

fs.writeFileSync(path.join(multiDir, 'widget.h'), '// old header\n');
fs.writeFileSync(path.join(multiDir, 'widget.cpp'), '// old impl\n');
fs.writeFileSync(path.join(multiDir, 'check-multi.cjs'), "const fs = require('node:fs');\nif (!fs.readFileSync('widget.h', 'utf8').includes('new header')) process.exit(1);\nif (!fs.readFileSync('widget.cpp', 'utf8').includes('fixed impl')) process.exit(1);\n");
let multiRepairRequests = 0;
let multiRepairPrompt = '';
const multiRepairRun = await runDeepSeekAtomicPolyglotCase({
  exerciseDir: multiDir,
  file: 'widget.cpp',
  files: ['widget.h', 'widget.cpp'],
  testcase: 'cpp/widget-repair',
  language: 'cpp',
  maxRepairs: 1,
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (_url, init) => {
    multiRepairRequests += 1;
    const body = JSON.parse(init.body);
    const prompt = body.messages.map((message) => message.content).join('\n');
    if (multiRepairRequests === 2) multiRepairPrompt = prompt;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'deepseek-v4-pro',
        choices: [{ message: { content: multiRepairRequests === 1
          ? '```widget.h\n// new header\n```\n```widget.cpp\n// old impl\n```\n'
          : '```widget.h\n// new header\n```\n```widget.cpp\n// fixed impl\n```\n' } }],
        usage: { prompt_tokens: 13, completion_tokens: 14, total_tokens: 27 },
      }),
    };
  },
  testCommand: [process.execPath, 'check-multi.cjs'],
});
assert.equal(multiRepairRun.ok, true);
assert.equal(multiRepairRequests, 2);
assert.match(multiRepairPrompt, /Previous candidate file: widget\.h/);
assert.match(multiRepairPrompt, /```widget\.cpp\n\/\/ old impl/);
assert.equal(multiRepairRun.result.deepseek_generation.repairAttempts, 1);

console.log(JSON.stringify({ ok: true, proof: 'aider-polyglot-deepseek-runner', checked: 65 }, null, 2));
