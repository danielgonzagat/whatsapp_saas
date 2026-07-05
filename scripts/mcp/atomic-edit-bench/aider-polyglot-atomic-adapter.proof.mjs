#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const adapterPath = path.join(here, 'aider-polyglot-atomic-adapter.mjs');
const adapter = await import(pathToFileURL(adapterPath).href);
const { ADAPTER_ID, applyValidatedFullFile, runAtomicPolyglotCase, runCli } = adapter;

function commandAvailable(command) {
  return childProcess.spawnSync(command, ['--version'], { encoding: 'utf8' }).error?.code !== 'ENOENT';
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertSyntaxRefusal({ file, starter, candidate, language, expectedKind }) {
  fs.writeFileSync(file, starter);
  const refused = applyValidatedFullFile({ file, newText: candidate, language, pythonBin: python });
  assert.equal(refused.ok, false, `${language} invalid syntax must be refused`);
  assert.equal(refused.validation.kind, expectedKind);
  assert.match(refused.blockers.join('\n'), new RegExp(`${language} syntax validation failed`));
  assert.equal(fs.readFileSync(file, 'utf8'), starter, `${language} invalid candidate must not mutate the target file`);
}

const python = process.env.PYTHON_BIN || 'python3';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-polyglot-adapter-proof-'));
let checked = 4;
const exerciseDir = path.join(root, 'python', 'exercises', 'practice', 'answer');
fs.mkdirSync(exerciseDir, { recursive: true });
const answerFile = path.join(exerciseDir, 'answer.py');
const starter = 'def answer():\n    return 0\n';
const valid = 'def answer():\n    return 42\n';
const invalid = 'def answer(:\n    return 42\n';
fs.writeFileSync(answerFile, starter);
fs.writeFileSync(path.join(exerciseDir, 'test_answer.py'), "import unittest\nfrom answer import answer\n\nclass AnswerTest(unittest.TestCase):\n    def test_answer(self):\n        self.assertEqual(answer(), 42)\n\nif __name__ == '__main__':\n    unittest.main()\n");

const refused = applyValidatedFullFile({ file: answerFile, newText: invalid, language: 'python', pythonBin: python });
assert.equal(refused.ok, false);
assert.match(refused.blockers.join('\n'), /python syntax validation failed/);
assert.equal(fs.readFileSync(answerFile, 'utf8'), starter, 'invalid candidate must not mutate the target file');

const jsFile = path.join(root, 'answer.js');
assertSyntaxRefusal({
  file: jsFile,
  starter: 'export function answer() { return 0; }\n',
  candidate: 'const answer = ;\n',
  language: 'javascript',
  expectedKind: 'javascript-node-check',
});
checked += 1;

if (commandAvailable('gofmt')) {
  const goFile = path.join(root, 'answer.go');
  assertSyntaxRefusal({
    file: goFile,
    starter: 'package answer\n\nfunc Answer() int { return 0 }\n',
    candidate: 'package answer\n\nfunc Answer( { return 1 }\n',
    language: 'go',
    expectedKind: 'go-gofmt',
  });
  checked += 1;
}

if (commandAvailable('rustc')) {
  const rustFile = path.join(root, 'lib.rs');
  assertSyntaxRefusal({
    file: rustFile,
    starter: 'pub fn answer() -> i32 { 0 }\n',
    candidate: 'pub fn answer( -> i32 { 1 }\n',
    language: 'rust',
    expectedKind: 'rust-rustc-metadata',
  });
  checked += 1;
}

if (commandAvailable('cargo')) {
  const cargoDir = path.join(root, 'rust-cargo-proof');
  const cargoSrc = path.join(cargoDir, 'src');
  fs.mkdirSync(cargoSrc, { recursive: true });
  fs.writeFileSync(path.join(cargoDir, 'Cargo.toml'), '[package]\nname = "atomic_adapter_proof"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\npath = "src/lib.rs"\n');
  fs.writeFileSync(path.join(cargoSrc, 'helper.rs'), 'pub fn answer() -> i32 { 42 }\n');
  const cargoLib = path.join(cargoSrc, 'lib.rs');
  const cargoStarter = 'pub fn answer() -> i32 { 0 }\n';
  const cargoCandidate = 'mod helper;\n\npub fn answer() -> i32 { helper::answer() }\n';
  fs.writeFileSync(cargoLib, cargoStarter);
  const cargoApplied = applyValidatedFullFile({ file: cargoLib, newText: cargoCandidate, language: 'rust' });
  assert.equal(cargoApplied.ok, true);
  assert.equal(cargoApplied.validation.kind, 'rust-cargo-check');
  assert.equal(fs.readFileSync(cargoLib, 'utf8'), cargoCandidate);
  const cargoRefused = applyValidatedFullFile({ file: cargoLib, newText: 'mod helper;\n\npub fn answer( -> i32 { helper::answer() }\n', language: 'rust' });
  assert.equal(cargoRefused.ok, false);
  assert.equal(cargoRefused.validation.kind, 'rust-cargo-check');
  assert.equal(fs.readFileSync(cargoLib, 'utf8'), cargoCandidate);
  checked += 2;
}

const applied = applyValidatedFullFile({ file: answerFile, newText: valid, language: 'python', pythonBin: python });
assert.equal(applied.ok, true);
assert.equal(applied.adapterId, ADAPTER_ID);
assert.equal(applied.validation.kind, 'python-py_compile');
assert.notEqual(applied.beforeSha256, applied.afterSha256);
assert.equal(fs.readFileSync(answerFile, 'utf8'), valid);

fs.writeFileSync(answerFile, starter);
const run = runAtomicPolyglotCase({
  exerciseDir,
  file: 'answer.py',
  candidateText: valid,
  testcase: 'answer',
  model: 'atomic-fixture',
  testCommand: [python, '-m', 'unittest', 'discover', '-s', '.'],
  language: 'python',
  pythonBin: python,
});
assert.equal(run.ok, true);
assert.deepEqual(run.result.tests_outcomes, [true]);
assert.equal(run.result.edit_format, 'atomic-validated-full-file');
assert.equal(run.result.model, 'atomic-fixture');
assert.equal(run.result.syntax_errors, 0);
assert.equal(run.result.atomic_adapter.adapterId, ADAPTER_ID);
assert.equal(fs.readFileSync(answerFile, 'utf8'), starter);
assert.equal(run.result.atomic_adapter.sourceTestdir, exerciseDir);
assert.notEqual(run.result.atomic_adapter.workDir, exerciseDir);
assert.equal(run.result.atomic_adapter.isolatedWorkDir, true);
assert.equal(run.result.atomic_adapter.candidateSnapshot.kind, 'single-file');
assert.equal(run.result.atomic_adapter.candidateSnapshot.file, 'answer.py');
assert.equal(run.result.atomic_adapter.candidateSnapshot.text, valid);
assert.equal(run.result.atomic_adapter.candidateSnapshot.bytes, Buffer.byteLength(valid, 'utf8'));
assert.match(run.result.atomic_adapter.candidateSnapshot.sha256, /^[a-f0-9]{64}$/);
checked += 2;

if (commandAvailable('bash')) {
  fs.writeFileSync(answerFile, starter);
  const timedOutRun = runAtomicPolyglotCase({
    exerciseDir,
    file: 'answer.py',
    candidateText: valid,
    testcase: 'answer-timeout',
    model: 'atomic-fixture',
    testCommand: ['bash', '-c', `${process.execPath} -e "setInterval(() => {}, 1000)" >/dev/null 2>&1 & echo $! > orphan.pid; wait`],
    timeoutMs: 250,
    language: 'python',
    pythonBin: python,
  });
  assert.equal(timedOutRun.ok, false);
  assert.deepEqual(timedOutRun.result.tests_outcomes, [false]);
  assert.equal(timedOutRun.result.test_timeouts, 1);
  assert.equal(timedOutRun.result.atomic_adapter.test.timedOut, true);
  const orphanPidFile = path.join(timedOutRun.result.atomic_adapter.workDir, 'orphan.pid');
  assert.equal(fs.existsSync(orphanPidFile), true);
  const orphanPid = Number(fs.readFileSync(orphanPidFile, 'utf8').trim());
  const orphanStillAlive = pidAlive(orphanPid);
  if (orphanStillAlive) {
    try { process.kill(orphanPid, 'SIGKILL'); } catch {}
  }
  assert.equal(orphanStillAlive, false, `timed-out test command left orphan process ${orphanPid}`);
  checked += 1;
}

fs.writeFileSync(answerFile, starter);
const candidateFile = path.join(root, 'candidate.py');
const outFile = path.join(root, '.aider.results.json');
fs.writeFileSync(candidateFile, valid);
const cli = runCli([
  '--exercise-dir', exerciseDir,
  '--file', 'answer.py',
  '--candidate-file', candidateFile,
  '--testcase', 'answer',
  '--model', 'atomic-fixture',
  '--test-command-json', JSON.stringify([python, '-m', 'unittest', 'discover', '-s', '.']),
  '--out', outFile,
  '--no-candidate-text',
]);
assert.equal(cli.ok, true);
assert.equal(fs.existsSync(outFile), true);
const persisted = JSON.parse(fs.readFileSync(outFile, 'utf8'));
assert.deepEqual(persisted.tests_outcomes, [true]);
assert.equal(persisted.atomic_adapter.adapterId, ADAPTER_ID);
assert.equal(fs.readFileSync(answerFile, 'utf8'), starter);
assert.equal(persisted.atomic_adapter.sourceTestdir, exerciseDir);
assert.notEqual(persisted.atomic_adapter.workDir, exerciseDir);
assert.equal(persisted.atomic_adapter.candidateSnapshot.text, null);
assert.equal(persisted.atomic_adapter.candidateSnapshot.bytes, Buffer.byteLength(valid, 'utf8'));
assert.match(persisted.atomic_adapter.candidateSnapshot.sha256, /^[a-f0-9]{64}$/);
checked += 1;

const multiDir = path.join(root, 'cpp', 'exercises', 'practice', 'widget');
fs.mkdirSync(multiDir, { recursive: true });
fs.writeFileSync(path.join(multiDir, 'widget.h'), '// old header\n');
fs.writeFileSync(path.join(multiDir, 'widget.cpp'), '// old impl\n');
fs.writeFileSync(path.join(multiDir, 'check-multi.cjs'), "const fs = require('node:fs');\nif (!fs.readFileSync('widget.h', 'utf8').includes('new header')) process.exit(1);\nif (!fs.readFileSync('widget.cpp', 'utf8').includes('new impl')) process.exit(1);\n");
const multiRun = runAtomicPolyglotCase({
  exerciseDir: multiDir,
  files: ['widget.h', 'widget.cpp'],
  candidateFiles: {
    'widget.h': '// new header\n',
    'widget.cpp': '// new impl\n',
  },
  testcase: 'cpp/widget',
  model: 'atomic-fixture',
  testCommand: [process.execPath, 'check-multi.cjs'],
  language: 'cpp',
});
assert.equal(multiRun.ok, true);
assert.deepEqual(multiRun.result.tests_outcomes, [true]);
assert.equal(multiRun.result.atomic_adapter.apply.mode, 'multi-file-replace');
assert.deepEqual(multiRun.result.atomic_adapter.files, ['widget.h', 'widget.cpp']);
assert.equal(multiRun.result.atomic_adapter.sourceTestdir, multiDir);
assert.notEqual(multiRun.result.atomic_adapter.workDir, multiDir);
assert.equal(multiRun.result.atomic_adapter.isolatedWorkDir, true);
assert.equal(multiRun.result.atomic_adapter.candidateSnapshot.kind, 'multi-file');
assert.deepEqual(multiRun.result.atomic_adapter.candidateSnapshot.files.map((item) => item.rel), ['widget.h', 'widget.cpp']);
assert.equal(multiRun.result.atomic_adapter.candidateSnapshot.files[0].text, '// new header\n');
assert.equal(multiRun.result.atomic_adapter.candidateSnapshot.files[1].text, '// new impl\n');
assert.match(multiRun.result.atomic_adapter.candidateSnapshot.files[0].sha256, /^[a-f0-9]{64}$/);
assert.equal(fs.readFileSync(path.join(multiDir, 'widget.h'), 'utf8'), '// old header\n');
assert.equal(fs.readFileSync(path.join(multiDir, 'widget.cpp'), 'utf8'), '// old impl\n');
checked += 1;

console.log(JSON.stringify({ ok: true, proof: 'aider-polyglot-atomic-adapter', checked }, null, 2));
