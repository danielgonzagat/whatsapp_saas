'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

function usage() {
  console.error('Usage: atomic-refactor-fastpath.cjs --worktree <abs> [--target <rel>] [--spec <rel>] [--class <ClassName>] [--max-target-lines <n>] [--max-file-lines <n>] [--policy-path <json>] [--json]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    target: null,
    spec: null,
    className: null,
    maxTargetLines: null,
    maxFileLines: null,
    policyPath: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') out.worktree = argv[++index];
    else if (arg === '--target') out.target = argv[++index];
    else if (arg === '--spec') out.spec = argv[++index];
    else if (arg === '--class') out.className = argv[++index];
    else if (arg === '--max-target-lines') out.maxTargetLines = Number(argv[++index]);
    else if (arg === '--max-file-lines') out.maxFileLines = Number(argv[++index]);
    else if (arg === '--policy-path') out.policyPath = argv[++index];
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.worktree || !path.isAbsolute(out.worktree)) usage();
  if (!fs.existsSync(out.worktree)) throw new Error('worktree not found: ' + out.worktree);
  out.target = out.target ? relPath(out.worktree, out.target) : inferTarget(out.worktree);
  out.spec = out.spec ? relPath(out.worktree, out.spec) : inferSpec(out.worktree, out.target);
  out.className = out.className || inferClassName(abs(out.worktree, out.target));
  if (!Number.isFinite(out.maxTargetLines)) out.maxTargetLines = null;
  if (!Number.isFinite(out.maxFileLines)) out.maxFileLines = null;
  return out;
}

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not find atomic-edit repo root from ' + start);
    dir = parent;
  }
}

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) return [];
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

function relPath(worktree, value) {
  const normalized = path.isAbsolute(value) ? path.relative(worktree, value) : value;
  return normalized.split(path.sep).join('/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function abs(worktree, rel) {
  return path.join(worktree, rel);
}

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text) return 0;
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

module.exports = {
  parseArgs, findRepoRoot, runGit, findUp, loadTypeScript,
  relPath, abs, lineCount, readText,
};
