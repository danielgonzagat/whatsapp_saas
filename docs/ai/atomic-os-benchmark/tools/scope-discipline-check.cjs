#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

function usage() {
  console.error(
    'Usage: scope-discipline-check.cjs --worktree <abs> (--allow-prefix <path>|--allow-file <path>)+ [--allow-atomic-traces] [--json]',
  );
  process.exit(2);
}

function normalizeRel(value) {
  let out = String(value || '').replaceAll('\\', '/');
  while (out.startsWith('./')) out = out.slice(2);
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function parseArgs(argv) {
  const out = { json: false, allowPrefixes: [], allowFiles: [], allowAtomicTraces: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') out.worktree = argv[++index];
    else if (arg === '--allow-prefix') out.allowPrefixes.push(normalizeRel(argv[++index]));
    else if (arg === '--allow-file') out.allowFiles.push(normalizeRel(argv[++index]));
    else if (arg === '--allow-atomic-traces') out.allowAtomicTraces = true;
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.worktree || !path.isAbsolute(out.worktree)) usage();
  if (out.allowPrefixes.length === 0 && out.allowFiles.length === 0 && !out.allowAtomicTraces) usage();
  return out;
}

function runGit(worktree, args) {
  const result = spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || result.stdout));
  }
  return result.stdout.split(/\r?\n/).map((line) => normalizeRel(line.trim())).filter(Boolean);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function changedFiles(worktree) {
  return unique([
    ...runGit(worktree, ['diff', '--name-only', '--']),
    ...runGit(worktree, ['ls-files', '--others', '--exclude-standard', '--']),
  ]);
}

function isAllowed(fileName, args) {
  if (args.allowFiles.includes(fileName)) return true;
  if (args.allowPrefixes.some((prefix) => fileName === prefix || fileName.startsWith(prefix))) return true;
  if (args.allowAtomicTraces && fileName.startsWith('.atomic/traces/') && fileName.endsWith('.json')) return true;
  return false;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = changedFiles(args.worktree);
  const outOfScopeFiles = files.filter((fileName) => !isAllowed(fileName, args));
  const result = {
    ok: outOfScopeFiles.length === 0,
    changedFileCount: files.length,
    changedFiles: files,
    allowedPrefixes: args.allowPrefixes,
    allowedFiles: args.allowFiles,
    allowAtomicTraces: args.allowAtomicTraces,
    outOfScopeFiles,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('ok=' + result.ok);
    console.log('changed_files=' + result.changedFileCount);
    console.log('out_of_scope=' + outOfScopeFiles.length);
    for (const fileName of outOfScopeFiles) console.log('out_of_scope_file=' + fileName);
  }
  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
