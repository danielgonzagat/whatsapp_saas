#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function usage() {
  console.error('Usage: typecheck-impact-audit.cjs --worktree <abs> (--allow-prefix <path>|--allow-file <path>)+ [--json] -- <command> [args...]');
  process.exit(2);
}

function normalizeRel(value) {
  let out = String(value || '').replaceAll('\\', '/');
  while (out.startsWith('./')) out = out.slice(2);
  while (out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function parseArgs(argv) {
  const out = { allowPrefixes: [], allowFiles: [], json: false, command: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      out.command = argv.slice(index + 1);
      break;
    }
    if (arg === '--worktree') out.worktree = argv[++index];
    else if (arg === '--allow-prefix') out.allowPrefixes.push(normalizeRel(argv[++index]));
    else if (arg === '--allow-file') out.allowFiles.push(normalizeRel(argv[++index]));
    else if (arg === '--json') out.json = true;
    else usage();
  }
  if (!out.worktree || !path.isAbsolute(out.worktree)) usage();
  if (!fs.existsSync(out.worktree)) throw new Error('worktree not found: ' + out.worktree);
  if (out.allowPrefixes.length === 0 && out.allowFiles.length === 0) usage();
  if (out.command.length === 0) usage();
  out.allowPrefixes = out.allowPrefixes.map((value) => relPath(out.worktree, value));
  out.allowFiles = out.allowFiles.map((value) => relPath(out.worktree, value));
  return out;
}

function relPath(worktree, value) {
  const normalized = path.isAbsolute(value) ? path.relative(worktree, value) : value;
  return normalizeRel(normalized);
}

function packageRoots(worktree) {
  const roots = [''];
  for (const entry of fs.readdirSync(worktree, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = entry.name;
    if (rel.startsWith('.')) continue;
    if (fs.existsSync(path.join(worktree, rel, 'package.json'))) roots.push(rel);
  }
  return roots;
}

function normalizeDiagnosticFile(worktree, rawFile) {
  const withoutScheme = String(rawFile || '').startsWith('file://') ? String(rawFile).slice(7) : String(rawFile || '');
  const clean = normalizeRel(withoutScheme);
  if (path.isAbsolute(clean)) return relPath(worktree, clean);
  const direct = path.join(worktree, clean);
  if (fs.existsSync(direct)) return clean;
  for (const root of packageRoots(worktree)) {
    if (!root) continue;
    const candidate = normalizeRel(path.posix.join(root, clean));
    if (fs.existsSync(path.join(worktree, candidate))) return candidate;
  }
  return clean;
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function parseTypeScriptDiagnostics(worktree, text) {
  const diagnostics = [];
  const clean = stripAnsi(text);
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.*)$/gm;
  for (const match of clean.matchAll(pattern)) {
    diagnostics.push({
      rawFile: normalizeRel(match[1]),
      file: normalizeDiagnosticFile(worktree, match[1]),
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5].trim(),
    });
  }
  return diagnostics;
}

function isAllowedDiagnostic(fileName, args) {
  if (args.allowFiles.includes(fileName)) return true;
  return args.allowPrefixes.some((prefix) => fileName === prefix || fileName.startsWith(prefix));
}

function trim(text) {
  const value = stripAnsi(text).trim();
  const configuredLimit = Number(process.env.TYPECHECK_IMPACT_OUTPUT_LIMIT || '');
  if (!Number.isFinite(configuredLimit) || configuredLimit <= Number.EPSILON) return value;
  if (value.length <= configuredLimit) return value;
  const half = Math.floor(configuredLimit / 'ab'.length);
  return value.slice(0, half) + '\n...<trimmed>...\n' + value.slice(-half);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...commandArgs] = args.command;
  const startedAt = Date.now();
  const spawnOptions = {
    cwd: args.worktree,
    encoding: 'utf8',
  };
  const configuredMaxBuffer = Number(process.env.TYPECHECK_IMPACT_MAX_BUFFER || '');
  if (Number.isFinite(configuredMaxBuffer) && configuredMaxBuffer > Number.EPSILON) {
    spawnOptions.maxBuffer = configuredMaxBuffer;
  }
  const result = spawnSync(command, commandArgs, spawnOptions);
  const status = typeof result.status === 'number' ? result.status : 124;
  const output = [result.stdout || '', result.stderr || ''].join('\n');
  const diagnostics = parseTypeScriptDiagnostics(args.worktree, output);
  const inScopeDiagnostics = diagnostics.filter((diagnostic) => isAllowedDiagnostic(diagnostic.file, args));
  const outOfScopeDiagnostics = diagnostics.filter((diagnostic) => !isAllowedDiagnostic(diagnostic.file, args));
  const unknownFailure = status !== 0 && diagnostics.length === 0;
  const ok = status === 0 || (inScopeDiagnostics.length === 0 && !unknownFailure);
  const payload = {
    ok,
    command: args.command,
    commandStatus: status,
    signal: result.signal || null,
    durationMs: Date.now() - startedAt,
    allowedPrefixes: args.allowPrefixes,
    allowedFiles: args.allowFiles,
    diagnosticCount: diagnostics.length,
    inScopeDiagnosticCount: inScopeDiagnostics.length,
    outOfScopeDiagnosticCount: outOfScopeDiagnostics.length,
    inScopeDiagnostics,
    outOfScopeDiagnostics,
    unknownFailure,
    stdout: trim(result.stdout),
    stderr: trim(result.stderr),
  };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log('ok=' + payload.ok);
    console.log('command_status=' + payload.commandStatus);
    console.log('in_scope_diagnostics=' + payload.inScopeDiagnosticCount);
    for (const diagnostic of inScopeDiagnostics) {
      console.log('in_scope=' + diagnostic.file + ':' + diagnostic.line + ':' + diagnostic.column + ' ' + diagnostic.code);
    }
  }
  process.exit(ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
