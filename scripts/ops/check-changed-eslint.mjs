#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  collectChangedFiles,
  relativizeToWorkspace,
  repoRoot,
  resolveDiffRange,
} from './lib/changed-files.mjs';

const LINTABLE_FILE_RE = /\.[cm]?[jt]sx?$/i;

const WORKSPACES = [
  { prefix: 'backend', label: 'backend' },
  { prefix: 'frontend', label: 'frontend' },
  { prefix: 'worker', label: 'worker' },
];

function collectAddedLines(relPath) {
  const diff = execFileSync('git', ['diff', '--unified=0', resolveDiffRange(), '--', relPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const lines = new Set();

  for (const line of diff.split('\n')) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;

    const start = Number(match[1]);
    const length = match[2] === undefined ? 1 : Number(match[2]);

    for (let offset = 0; offset < length; offset += 1) {
      lines.add(start + offset);
    }
  }

  return lines;
}

function runWorkspaceLint(workspace, files) {
  if (files.length === 0) {
    return [];
  }

  console.log(`[guard:eslint] ${workspace.label}: ${files.length} arquivo(s) alterado(s)`);

  const result = spawnSync('npx', ['eslint', '--format', 'json', '--no-warn-ignored', ...files], {
    cwd: path.join(repoRoot, workspace.prefix),
    encoding: 'utf8',
    env: {
      ...process.env,
      KLOEL_STRICT_LINT: 'true',
    },
  });

  const raw = String(result.stdout || '').trim();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  const failures = [];

  for (const report of parsed) {
    const absPath = String(report.filePath || '');
    const relPath = path.relative(repoRoot, absPath);
    const addedLines = collectAddedLines(relPath);

    if (addedLines.size === 0) {
      continue;
    }

    for (const message of report.messages || []) {
      const start = Number(message.line || 0);
      const end = Number(message.endLine || start || 0);
      const touchesAddedLine =
        start > 0 &&
        Array.from({ length: Math.max(1, end - start + 1) }, (_, index) => start + index).some(
          (lineNumber) => addedLines.has(lineNumber),
        );

      if (!touchesAddedLine) {
        continue;
      }

      failures.push({
        file: relPath,
        line: start,
        ruleId: message.ruleId || 'unknown',
        severity: message.severity === 2 ? 'error' : 'warning',
        message: message.message,
      });
    }
  }

  return failures;
}

const changedFiles = collectChangedFiles()
  .filter((file) => LINTABLE_FILE_RE.test(file))
  .filter((file) => /^(backend|frontend|worker)\//.test(file))
  .filter((file) => !/\/dist\/|\/coverage\/|\/node_modules\//.test(file))
  .filter((file) => !/eslint\.config\.mjs$/.test(file));

if (changedFiles.length === 0) {
  console.log('[guard:eslint] Nenhum arquivo TS/JS alterado.');
  process.exit(0);
}

const failures = [];

for (const workspace of WORKSPACES) {
  const files = relativizeToWorkspace(workspace.prefix, changedFiles);
  failures.push(...runWorkspaceLint(workspace, files));
}

if (failures.length > 0) {
  console.error('[guard:eslint] Violacoes novas detectadas nas linhas alteradas:');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} [${failure.ruleId}] ${failure.message}`);
  }
  process.exit(1);
}

console.log('[guard:eslint] OK');
