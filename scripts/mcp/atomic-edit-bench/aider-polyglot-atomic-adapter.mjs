#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADAPTER_ID = 'atomic-aider-polyglot-adapter-v1';
export const ATOMIC_EDIT_FORMAT = 'atomic-validated-full-file';

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256File(file) {
  return sha256Text(fs.readFileSync(file, 'utf8'));
}

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeRel(value) {
  return String(value).split(path.sep).join('/');
}

function tail(value, limit = 4000) {
  const text = String(value ?? '');
  return text.length <= limit ? text : text.slice(text.length - limit);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--exercise-dir') {
      options.exerciseDir = argv[++index];
    } else if (arg === '--file') {
      options.file = argv[++index];
    } else if (arg === '--candidate-file') {
      options.candidateFile = argv[++index];
    } else if (arg === '--testcase') {
      options.testcase = argv[++index];
    } else if (arg === '--model') {
      options.model = argv[++index];
    } else if (arg === '--language') {
      options.language = argv[++index];
    } else if (arg === '--python-bin') {
      options.pythonBin = argv[++index];
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[++index]);
    } else if (arg === '--test-command-json') {
      options.testCommand = JSON.parse(argv[++index]);
    } else if (arg === '--out') {
      options.out = argv[++index];
    } else if (arg === '--no-candidate-text') {
      options.recordCandidateText = false;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function requireArrayCommand(command) {
  if (!Array.isArray(command) || command.length === 0 || typeof command[0] !== 'string' || command[0].trim() === '') {
    throw new Error('testCommand must be a non-empty JSON array of command arguments');
  }
  for (const part of command) {
    if (typeof part !== 'string') throw new Error('testCommand entries must be strings');
  }
  return command;
}

function resolveContained(root, relativeOrAbsolute) {
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, relativeOrAbsolute);
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    throw new Error(`path escapes exercise dir: ${relativeOrAbsolute}`);
  }
  return target;
}

function languageFromFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.py') return 'python';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  return 'text';
}

function runTempSyntaxValidation({ file, newText, language, kind, commandForTemp }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-polyglot-compile-'));
  const tempFile = path.join(tempDir, path.basename(file) || 'candidate');
  fs.writeFileSync(tempFile, newText, 'utf8');
  const command = commandForTemp(tempFile, tempDir);
  const checked = childProcess.spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (checked.error?.code === 'ENOENT') {
    return { ok: true, kind: `${kind}-skipped-missing-tool`, language, command, skipped: true };
  }
  if (checked.status !== 0) {
    return {
      ok: false,
      kind,
      language,
      command,
      status: checked.status,
      stderr: tail(checked.stderr),
      stdout: tail(checked.stdout),
      error: checked.error ? String(checked.error) : null,
    };
  }
  return { ok: true, kind, language, command, status: 0 };
}

function findAncestorContaining(startFile, marker) {
  let dir = path.dirname(path.resolve(startFile));
  while (true) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function validateRustCandidate({ file, newText }) {
  const cargoRoot = findAncestorContaining(file, 'Cargo.toml');
  if (!cargoRoot) {
    return runTempSyntaxValidation({
      file,
      newText,
      language: 'rust',
      kind: 'rust-rustc-metadata',
      commandForTemp: (tempFile, tempDir) => ['rustc', '--crate-type', 'lib', '--emit', 'metadata', tempFile, '-o', path.join(tempDir, 'candidate.rmeta')],
    });
  }

  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-polyglot-cargo-'));
  const tempRoot = path.join(tempParent, path.basename(cargoRoot));
  try {
    fs.cpSync(cargoRoot, tempRoot, {
      recursive: true,
      filter: (source) => {
        const base = path.basename(source);
        return base !== 'target' && base !== '.git';
      },
    });
    const relativeFile = path.relative(cargoRoot, path.resolve(file));
    fs.writeFileSync(path.join(tempRoot, relativeFile), newText, 'utf8');
    const command = ['cargo', 'check', '--quiet'];
    const checked = childProcess.spawnSync(command[0], command.slice(1), { cwd: tempRoot, encoding: 'utf8' });
    if (checked.error?.code === 'ENOENT') {
      return { ok: true, kind: 'rust-cargo-check-skipped-missing-tool', language: 'rust', command, skipped: true };
    }
    if (checked.status !== 0) {
      return {
        ok: false,
        kind: 'rust-cargo-check',
        language: 'rust',
        command,
        cwd: tempRoot,
        status: checked.status,
        stderr: tail(checked.stderr),
        stdout: tail(checked.stdout),
        error: checked.error ? String(checked.error) : null,
      };
    }
    return { ok: true, kind: 'rust-cargo-check', language: 'rust', command, status: 0 };
  } finally {
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
}

function validateCandidateSyntax({ file, newText, language = 'auto', pythonBin = process.env.PYTHON_BIN || 'python3' }) {
  const resolvedLanguage = language === 'auto' ? languageFromFile(file) : language;
  if (resolvedLanguage === 'python') {
    return runTempSyntaxValidation({
      file,
      newText,
      language: resolvedLanguage,
      kind: 'python-py_compile',
      commandForTemp: (tempFile) => [pythonBin, '-m', 'py_compile', tempFile],
    });
  }
  if (resolvedLanguage === 'javascript') {
    return runTempSyntaxValidation({
      file,
      newText,
      language: resolvedLanguage,
      kind: 'javascript-node-check',
      commandForTemp: (tempFile) => [process.execPath, '--check', tempFile],
    });
  }
  if (resolvedLanguage === 'go') {
    return runTempSyntaxValidation({
      file,
      newText,
      language: resolvedLanguage,
      kind: 'go-gofmt',
      commandForTemp: (tempFile) => ['gofmt', tempFile],
    });
  }
  if (resolvedLanguage === 'rust') {
    return validateRustCandidate({ file, newText });
  }
  return { ok: true, kind: 'none', language: resolvedLanguage, command: null };
}

export function applyValidatedFullFile({ file, newText, expectedSha256, language = 'auto', pythonBin } = {}) {
  if (!file || typeof file !== 'string') throw new Error('file is required');
  if (typeof newText !== 'string') throw new Error('newText must be a string');
  const target = path.resolve(file);
  const beforeText = fs.readFileSync(target, 'utf8');
  const beforeSha256 = sha256Text(beforeText);
  if (expectedSha256 && expectedSha256 !== beforeSha256) {
    return { ok: false, adapterId: ADAPTER_ID, file: target, beforeSha256, blockers: ['expectedSha256 mismatch'] };
  }

  const validation = validateCandidateSyntax({ file: target, newText, language, pythonBin });
  if (!validation.ok) {
    return {
      ok: false,
      adapterId: ADAPTER_ID,
      file: target,
      beforeSha256,
      afterSha256: beforeSha256,
      validation,
      blockers: [`${validation.language} syntax validation failed`],
    };
  }

  const tempFile = path.join(path.dirname(target), `.${path.basename(target)}.atomic-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, newText, 'utf8');
  fs.renameSync(tempFile, target);
  const afterSha256 = sha256File(target);
  return {
    ok: true,
    adapterId: ADAPTER_ID,
    file: target,
    mode: 'full-file-replace',
    atomicWrite: 'rename-same-directory',
    beforeSha256,
    afterSha256,
    bytesWritten: Buffer.byteLength(newText),
    validation,
    blockers: [],
  };
}

export function applyValidatedFullFiles({ exerciseDir, files, candidateFiles, language = 'auto', pythonBin } = {}) {
  const root = path.resolve(exerciseDir || '.');
  if (!Array.isArray(files) || files.length === 0) throw new Error('files must be a non-empty array');
  if (!candidateFiles || typeof candidateFiles !== 'object') throw new Error('candidateFiles must be an object keyed by relative file path');
  const items = files.map((rel) => {
    const key = normalizeRel(rel);
    const text = candidateFiles[key];
    if (typeof text !== 'string') return { rel: key, missing: true };
    const target = resolveContained(root, key);
    const beforeText = fs.readFileSync(target, 'utf8');
    const beforeSha256 = sha256Text(beforeText);
    const validation = validateCandidateSyntax({ file: target, newText: text, language, pythonBin });
    return { rel: key, target, text, beforeSha256, validation, missing: false };
  });
  const missing = items.filter((item) => item.missing).map((item) => item.rel);
  if (missing.length > 0) {
    return { ok: false, adapterId: ADAPTER_ID, mode: 'multi-file-replace', files: items, blockers: [`missing candidate files: ${missing.join(', ')}`] };
  }
  const failed = items.find((item) => !item.validation.ok);
  if (failed) {
    return {
      ok: false,
      adapterId: ADAPTER_ID,
      mode: 'multi-file-replace',
      files: items.map((item) => ({ rel: item.rel, file: item.target, beforeSha256: item.beforeSha256, validation: item.validation })),
      blockers: [`${failed.validation.language} syntax validation failed in ${failed.rel}`],
    };
  }

  const tempFiles = [];
  try {
    for (const item of items) {
      const tempFile = path.join(path.dirname(item.target), `.${path.basename(item.target)}.atomic-${process.pid}-${Date.now()}-${tempFiles.length}.tmp`);
      fs.writeFileSync(tempFile, item.text, 'utf8');
      tempFiles.push({ tempFile, target: item.target });
    }
    for (const item of tempFiles) fs.renameSync(item.tempFile, item.target);
  } finally {
    for (const item of tempFiles) {
      if (fs.existsSync(item.tempFile)) fs.rmSync(item.tempFile, { force: true });
    }
  }

  return {
    ok: true,
    adapterId: ADAPTER_ID,
    mode: 'multi-file-replace',
    atomicWrite: 'rename-same-directory-per-file',
    files: items.map((item) => ({
      rel: item.rel,
      file: item.target,
      beforeSha256: item.beforeSha256,
      afterSha256: sha256File(item.target),
      bytesWritten: Buffer.byteLength(item.text),
      validation: item.validation,
    })),
    blockers: [],
  };
}

function runTestCommand(testCommand, exerciseDir, timeoutMs, env = process.env) {
  const command = requireArrayCommand(testCommand);
  const started = Date.now();
  const timeoutNumber = Number(timeoutMs);
  const effectiveTimeoutMs = Number.isFinite(timeoutNumber) && timeoutNumber > 0 ? timeoutNumber : 120000;
  const supervisorSource = String.raw`
const childProcess = require('node:child_process');
const command = JSON.parse(process.argv[1]);
const cwd = process.argv[2];
const timeoutMs = Number(process.argv[3]);
const outputLimit = 262144;
let child = null;
let stdout = '';
let stderr = '';
let settled = false;
let timedOut = false;
let timeoutTimer = null;
let hardKillTimer = null;
function appendTail(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length > outputLimit ? next.slice(-outputLimit) : next;
}
function killTree(signal) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {}
}
function scheduleHardKill() {
  if (hardKillTimer) return;
  hardKillTimer = setTimeout(() => killTree('SIGKILL'), 1000);
}
function finish(payload) {
  if (settled) return;
  settled = true;
  if (timeoutTimer) clearTimeout(timeoutTimer);
  if (hardKillTimer) clearTimeout(hardKillTimer);
  process.stdout.write(JSON.stringify({ ...payload, timedOut, stdout, stderr }));
}
function finishAfterTimeout(payload) {
  scheduleHardKill();
  setTimeout(() => finish(payload), 1150);
}
process.on('SIGTERM', () => {
  timedOut = true;
  killTree('SIGTERM');
  scheduleHardKill();
  setTimeout(() => process.exit(143), 1250);
});
try {
  child = childProcess.spawn(command[0], command.slice(1), {
    cwd,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  finish({ status: null, signal: null, error: String(error?.message || error) });
}
if (child) {
  timeoutTimer = setTimeout(() => {
    timedOut = true;
    killTree('SIGTERM');
    scheduleHardKill();
  }, timeoutMs);
  child.stdout.on('data', (chunk) => { stdout = appendTail(stdout, chunk); });
  child.stderr.on('data', (chunk) => { stderr = appendTail(stderr, chunk); });
  child.on('error', (error) => {
    const payload = { status: null, signal: null, error: String(error?.message || error) };
    if (timedOut) finishAfterTimeout(payload);
    else finish(payload);
  });
  child.on('close', (status, signal) => {
    const payload = { status, signal, error: null };
    if (timedOut) finishAfterTimeout(payload);
    else finish(payload);
  });
}
`;
  const supervisor = childProcess.spawnSync(process.execPath, ['-e', supervisorSource, JSON.stringify(command), exerciseDir, String(effectiveTimeoutMs)], {
    cwd: exerciseDir,
    encoding: 'utf8',
    env,
    timeout: effectiveTimeoutMs + 10000,
    maxBuffer: 1024 * 1024,
  });
  const supervisorTimedOut = supervisor.error?.code === 'ETIMEDOUT';
  let result = null;
  try {
    result = supervisor.stdout ? JSON.parse(supervisor.stdout) : null;
  } catch {}
  if (!result) {
    return {
      command,
      status: supervisor.status,
      signal: supervisor.signal,
      timedOut: supervisorTimedOut,
      durationSeconds: Number(((Date.now() - started) / 1000).toFixed(3)),
      stdout: '',
      stderr: tail(supervisor.stderr),
      error: supervisor.error ? String(supervisor.error.message || supervisor.error) : 'test command supervisor did not return JSON',
    };
  }
  return {
    command,
    status: result.status,
    signal: result.signal,
    timedOut: Boolean(result.timedOut) || supervisorTimedOut,
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(3)),
    stdout: tail(result.stdout),
    stderr: tail(result.stderr),
    error: result.error ?? (supervisor.error ? String(supervisor.error.message || supervisor.error) : null),
  };
}

function isPythonTarget(file, language = 'auto') {
  if (language === 'python') return true;
  return language === 'auto' && path.extname(file).toLowerCase() === '.py';
}

function removePythonBytecodeCaches(root) {
  const removed = [];
  const stack = [path.resolve(root)];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === '__pycache__') {
        fs.rmSync(absolute, { recursive: true, force: true });
        removed.push(path.relative(root, absolute));
      } else {
        stack.push(absolute);
      }
    }
  }
  return { removed };
}

function createIsolatedExerciseDir(sourceExerciseDir) {
  const source = path.resolve(sourceExerciseDir || '.');
  const workParent = fs.mkdtempSync(path.join(os.tmpdir(), `atomic-polyglot-case-${process.pid}-`));
  const workDir = path.join(workParent, path.basename(source));
  fs.cpSync(source, workDir, { recursive: true });
  return { sourceExerciseDir: source, workParent, workDir };
}

function buildCandidateSnapshot({ relFiles, multiFile, candidateText, candidateFiles, includeText = true }) {
  if (multiFile) {
    return {
      kind: 'multi-file',
      files: relFiles.map((rel) => {
        const text = typeof candidateFiles?.[rel] === 'string' ? candidateFiles[rel] : null;
        return {
          rel,
          present: typeof text === 'string',
          sha256: typeof text === 'string' ? sha256Text(text) : null,
          bytes: typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0,
          text: includeText && typeof text === 'string' ? text : null,
        };
      }),
    };
  }
  return {
    kind: 'single-file',
    file: relFiles[0],
    sha256: typeof candidateText === 'string' ? sha256Text(candidateText) : null,
    bytes: typeof candidateText === 'string' ? Buffer.byteLength(candidateText, 'utf8') : 0,
    text: includeText && typeof candidateText === 'string' ? candidateText : null,
  };
}

export function runAtomicPolyglotCase(options = {}) {
  const isolated = createIsolatedExerciseDir(options.exerciseDir || '.');
  const sourceExerciseDir = isolated.sourceExerciseDir;
  const exerciseDir = isolated.workDir;
  const testcase = stringOrNull(options.testcase) ?? path.basename(sourceExerciseDir);
  const model = stringOrNull(options.model) ?? 'atomic-adapter';
  const started = Date.now();
  const relFiles = Array.isArray(options.files) && options.files.length > 0
    ? options.files.map(normalizeRel)
    : [normalizeRel(options.file || '')];
  const multiFile = Boolean(options.candidateFiles && typeof options.candidateFiles === 'object');
  const primaryFile = resolveContained(exerciseDir, options.file || relFiles[0]);
  const candidateText = multiFile
    ? null
    : (typeof options.candidateText === 'string' ? options.candidateText : fs.readFileSync(options.candidateFile, 'utf8'));
  const candidateSnapshot = buildCandidateSnapshot({
    relFiles,
    multiFile,
    candidateText,
    candidateFiles: options.candidateFiles,
    includeText: options.recordCandidateText !== false,
  });
  const applied = multiFile
    ? applyValidatedFullFiles({
      exerciseDir,
      files: relFiles,
      candidateFiles: options.candidateFiles,
      language: options.language ?? 'auto',
      pythonBin: options.pythonBin,
    })
    : applyValidatedFullFile({
      file: primaryFile,
      newText: candidateText,
      expectedSha256: options.expectedSha256,
      language: options.language ?? 'auto',
      pythonBin: options.pythonBin,
    });

  let testRun = null;
  let pythonBytecodeCache = null;
  if (applied.ok) {
    let testEnv = process.env;
    if (relFiles.some((file) => isPythonTarget(file, options.language ?? 'auto'))) {
      const pycachePrefix = path.join(os.tmpdir(), `atomic-polyglot-pycache-${process.pid}-${Date.now()}`);
      pythonBytecodeCache = { ...removePythonBytecodeCaches(exerciseDir), pycachePrefix };
      testEnv = {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONPYCACHEPREFIX: pycachePrefix,
      };
    }
    testRun = runTestCommand(options.testCommand, exerciseDir, options.timeoutMs, testEnv);
  }
  const passed = Boolean(applied.ok && testRun && testRun.status === 0 && !testRun.timedOut);
  const duration = Number(((Date.now() - started) / 1000).toFixed(3));

  const result = {
    testdir: sourceExerciseDir,
    testcase,
    model,
    edit_format: ATOMIC_EDIT_FORMAT,
    tests_outcomes: [passed],
    cost: 0,
    duration,
    test_timeouts: testRun?.timedOut ? 1 : 0,
    commit_hash: null,
    num_error_outputs: applied.ok && !passed ? 1 : 0,
    num_user_asks: 0,
    num_exhausted_context_windows: 0,
    num_malformed_responses: 0,
    syntax_errors: applied.ok ? 0 : 1,
    indentation_errors: 0,
    lazy_comments: 0,
    reasoning_effort: null,
    prompt_tokens: null,
    completion_tokens: null,
    thinking_tokens: null,
    chat_hashes: [],
    atomic_adapter: {
      adapterId: ADAPTER_ID,
      file: path.relative(exerciseDir, primaryFile),
      files: relFiles,
      multiFile,
      sourceTestdir: sourceExerciseDir,
      workDir: exerciseDir,
      workParent: isolated.workParent,
      isolatedWorkDir: true,
      candidateSnapshot,
      apply: applied,
      pythonBytecodeCache,
      test: testRun,
    },
  };

  let workDirRetained = Boolean(options.keepWorkDir) || !passed;
  let workDirCleanup = { ok: true, skipped: workDirRetained };
  if (!workDirRetained) {
    try {
      fs.rmSync(isolated.workParent, { recursive: true, force: true });
    } catch (error) {
      workDirRetained = true;
      workDirCleanup = { ok: false, error: error?.message ?? String(error) };
    }
  }
  result.atomic_adapter.workDirRetained = workDirRetained;
  result.atomic_adapter.workDirCleanup = workDirCleanup;

  return { ok: passed, adapterId: ADAPTER_ID, result, blockers: applied.ok ? [] : applied.blockers };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.exerciseDir) throw new Error('--exercise-dir is required');
  if (!options.file) throw new Error('--file is required');
  if (!options.candidateFile) throw new Error('--candidate-file is required');
  if (!options.testCommand) throw new Error('--test-command-json is required');
  const run = runAtomicPolyglotCase(options);
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(run.result, null, 2) + '\n');
  }
  return run;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const run = runCli(process.argv.slice(2));
  console.log(JSON.stringify(run.result, null, 2));
  process.exit(run.ok ? 0 : 1);
}
