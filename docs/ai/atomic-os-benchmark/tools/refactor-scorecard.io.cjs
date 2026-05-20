'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || result.stdout));
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findUp(start, fileName) {
  let dir = path.resolve(start);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  for (;;) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadTypeScript(worktree) {
  const packageJson =
    findUp(path.join(worktree, 'backend'), 'package.json') ||
    findUp(worktree, 'package.json') ||
    findUp(__dirname, 'package.json');
  if (!packageJson) return null;
  try {
    return createRequire(packageJson)('typescript');
  } catch {
    return null;
  }
}

function uniq(values) {
  return [...new Set(values)];
}

function relPath(worktree, value) {
  const normalized = path.isAbsolute(value) ? path.relative(worktree, value) : value;
  return normalized.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function argsCwd() {
  return process.cwd();
}

function resolveReadablePath(cwd, worktree, value) {
  const candidates = path.isAbsolute(value)
    ? [value]
    : [path.resolve(cwd, value), path.join(worktree, value)];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return found || candidates[0];
}

function deriveScopePrefix(worktree, target) {
  const rel = relPath(worktree, target);
  const ext = path.posix.extname(rel);
  const withoutExt = ext ? rel.slice(0, -ext.length) : rel;
  const dir = path.posix.dirname(withoutExt);
  const base = path.posix.basename(withoutExt);
  const pivot = base.lastIndexOf('.');
  const stem = pivot > 0 ? base.slice(0, pivot) : base;
  return dir === '.' ? stem : dir + '/' + stem;
}

function loadProtectedPathspecs(worktree) {
  const governancePath = path.join(worktree, 'ops', 'protected-governance-files.json');
  if (!fs.existsSync(governancePath)) return ['.'];
  const parsed = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
  const exact = Array.isArray(parsed.protectedExact) ? parsed.protectedExact : [];
  const prefixes = Array.isArray(parsed.protectedPrefixes) ? parsed.protectedPrefixes : [];
  const pathspecs = uniq([...exact, ...prefixes])
    .map((value) => relPath(worktree, value))
    .filter(Boolean);
  return pathspecs.length > 0 ? pathspecs : ['.'];
}

function lineCount(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(dir, name));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function readJsonFile(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

function worktreeRel(worktree, absPath) {
  return path.relative(worktree, absPath).split(path.sep).join('/');
}

function traceInventory(worktree) {
  const traceFiles = listJsonFiles(path.join(worktree, '.atomic', 'traces')).map((absPath) => ({
    path: worktreeRel(worktree, absPath),
    data: readJsonFile(absPath),
  }));
  const tracePathSet = new Set(traceFiles.map((trace) => trace.path));
  const macroManifests = [];
  const coveredTracePaths = new Set();
  const consolidatedProductBatchUnits = new Set();
  for (const absPath of listJsonFiles(path.join(worktree, '.atomic', 'macro-traces'))) {
    const parsed = readJsonFile(absPath);
    if (!parsed || parsed.manifestKind !== 'macro_trace_consolidation') continue;
    const childTraces = Array.isArray(parsed.childTraces) ? parsed.childTraces : [];
    for (const child of childTraces) {
      if (child && typeof child.tracePath === 'string') coveredTracePaths.add(relPath(worktree, child.tracePath));
      if (child && typeof child.file === 'string') consolidatedProductBatchUnits.add(relPath(worktree, child.file));
    }
    for (const unit of Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits : []) {
      if (typeof unit === 'string') consolidatedProductBatchUnits.add(relPath(worktree, unit));
    }
    macroManifests.push({
      path: worktreeRel(worktree, absPath),
      childTraceCount: childTraces.length,
      productBatchUnitCount: Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits.length : 0,
      productBatchUnits: Array.isArray(parsed.productBatchUnits) ? parsed.productBatchUnits.map((unit) => relPath(worktree, unit)).sort() : [],
      decisionAuthority: parsed.decisionAuthority || null,
    });
  }
  const macroCoveredTraceCount = [...coveredTracePaths].filter((tracePath) => tracePathSet.has(tracePath)).length;
  const rawTraceCount = traceFiles.length;
  return {
    rawTraceCount,
    traceFiles: traceFiles.map((trace) => trace.path).sort(),
    macroManifests,
    macroCoveredTraceCount,
    uncoveredTraceCount: Math.max(0, rawTraceCount - macroCoveredTraceCount),
    macroCoveragePass: rawTraceCount === 0 || (macroManifests.length > 0 && macroCoveredTraceCount === rawTraceCount),
    consolidatedProductBatchUnits: [...consolidatedProductBatchUnits].sort(),
  };
}

function changedFiles(worktree) {
  const tracked = runGit(worktree, ['diff', '--name-only', '--']);
  const untracked = runGit(worktree, ['ls-files', '--others', '--exclude-standard', '--']);
  return uniq([...tracked, ...untracked]).sort();
}

function trackedNumstat(worktree, files) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const result = spawnSync('git', ['-C', worktree, 'diff', '--numstat', '--', ...files], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, fileName] = line.split(/\t/);
      return {
        file: fileName,
        added: Number(added) || 0,
        deleted: Number(deleted) || 0,
      };
    });
}

function sourceChangedFiles(worktree, scopePrefix) {
  return changedFiles(worktree)
    .filter((fileName) => fileName.startsWith(scopePrefix) && fileName.endsWith('.ts'))
    .sort();
}


module.exports = {
  runGit,
  findUp,
  loadTypeScript,
  uniq,
  relPath,
  argsCwd,
  resolveReadablePath,
  deriveScopePrefix,
  loadProtectedPathspecs,
  lineCount,
  listJsonFiles,
  readJsonFile,
  worktreeRel,
  traceInventory,
  changedFiles,
  trackedNumstat,
  sourceChangedFiles,

};
