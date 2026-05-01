#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { collectChangedFiles, collectNameStatus, repoRoot } from './lib/changed-files.mjs';
import { readJsonFile } from './lib/scan-utils.mjs';

const constitution = readJsonFile('ops/kloel-ai-constitution.json', null);
const failures = [];

if (!constitution?.graphContract || !constitution?.agentWorkContract) {
  fail('ops/kloel-ai-constitution.json ausente ou invalida.');
} else {
  checkGraphContract();
  checkChangedFiles();
  checkForbiddenDeletions();
}

if (failures.length > 0) {
  console.error('[check-ai-constitution] VIOLATION');
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('[check-ai-constitution] OK');

function fail(message) {
  failures.push(message);
}

function readRepo(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function checkGraphContract() {
  const daemonPath = 'scripts/obsidian-mirror-daemon.mjs';
  const lensPath = 'scripts/obsidian-graph-lens.mjs';
  if (!existsSync(path.join(repoRoot, daemonPath))) {
    fail(`${daemonPath} ausente; o espelho visual do workspace nao pode regredir.`);
    return;
  }
  if (!existsSync(path.join(repoRoot, lensPath))) {
    fail(`${lensPath} ausente; a lente nativa do Graph nao pode regredir.`);
    return;
  }

  const daemon = readRepo(daemonPath);
  const lens = readRepo(lensPath);
  const expectedSearch = JSON.stringify(constitution.graphContract.workspaceSearch);

  for (const [label, source] of [
    [daemonPath, daemon],
    [lensPath, lens],
  ]) {
    if (
      !source.includes(`WORKSPACE_GRAPH_SEARCH = ${expectedSearch}`) &&
      !source.includes(`WORKSPACE_GRAPH_SEARCH = '${constitution.graphContract.workspaceSearch}'`)
    ) {
      fail(`${label} deve manter WORKSPACE_GRAPH_SEARCH = ${expectedSearch}.`);
    }
    if (!source.includes('hideUnresolved: true')) {
      fail(`${label} deve manter hideUnresolved: true para bloquear nos nao-resolvidos.`);
    }
    if (!source.includes('showOrphans: true')) {
      fail(
        `${label} deve manter showOrphans: true para arquivos realmente desconectados continuarem visiveis.`,
      );
    }
  }

  if (!daemon.includes('function mirrorVisibleSegment') || !daemon.includes("'_dot_'")) {
    fail('O espelho deve manter mapeamento _dot_ para diretorios fonte iniciados por ponto.');
  }

  const writeGeneratedIndexes =
    /function writeGeneratedIndexes\(manifest\) \{(?<body>[\s\S]*?)\n\}/.exec(daemon)?.groups
      ?.body || '';
  if (!writeGeneratedIndexes.includes('removeGeneratedGraphOverlays();')) {
    fail('writeGeneratedIndexes deve remover overlays gerados.');
  }
  if (!writeGeneratedIndexes.includes('applyGraphDerivedTags(manifest);')) {
    fail('writeGeneratedIndexes deve aplicar tags derivadas no proprio ponto do arquivo.');
  }
  if (!/applyGraphDerivedTags\(manifest\);\s*return;/.test(writeGeneratedIndexes)) {
    fail('writeGeneratedIndexes deve retornar antes de gerar hubs/fatos artificiais.');
  }

  const bridgePath =
    '/Users/danielpenin/Documents/Obsidian Vault/.obsidian/plugins/codex-obsidian-bridge/main.js';
  if (existsSync(bridgePath)) {
    const bridge = readFileSync(bridgePath, 'utf8');
    if (!bridge.includes(`WORKSPACE_GRAPH_SEARCH = ${expectedSearch}`)) {
      fail('codex-obsidian-bridge deve abrir o Graph com a lente _source.');
    }
    if (!bridge.includes('hideUnresolved: true') || !bridge.includes('showOrphans: true')) {
      fail('codex-obsidian-bridge deve preservar hideUnresolved/showOrphans ao abrir o Graph.');
    }
  }

  const mirrorRoot = path.join(
    '/Users/danielpenin/Documents/Obsidian Vault',
    constitution.graphContract.mirrorRoot,
  );
  if (existsSync(mirrorRoot)) {
    const generatedCount = countGeneratedOverlayNotes(
      mirrorRoot,
      new Set(constitution.graphContract.forbiddenGeneratedSourceDirs),
    );
    if (generatedCount > 0) {
      fail(`O vault contem ${generatedCount} notas de overlay gerado dentro de _source.`);
    }
  }
}

function countGeneratedOverlayNotes(root, forbiddenDirs) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (forbiddenDirs.has(entry.name)) {
          count += countMarkdown(full);
          continue;
        }
        walk(full);
      }
    }
  };
  walk(root);
  return count;
}

function countMarkdown(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdown(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      count++;
    }
  }
  return count;
}

function checkChangedFiles() {
  const changed = collectChangedFiles().filter((file) => existsSync(path.join(repoRoot, file)));
  const forbiddenPatterns = [
    { pattern: /\beslint-disable\b/, label: 'eslint-disable' },
    { pattern: /@ts-ignore|@ts-nocheck|@ts-expect-error/, label: 'TypeScript suppression' },
    {
      pattern: /\bbiome-ignore\b|\bnosemgrep\b|\bNOSONAR\b|\bnoqa\b/,
      label: 'static-analysis suppression',
    },
    { pattern: /\bdescribe\.skip\b|\bit\.skip\b|\btest\.skip\b/, label: 'skipped test' },
    {
      pattern: /\[skip ci\]|\[ci skip\]|\[codacy skip\]|\[skip codacy\]/i,
      label: 'CI/Codacy skip tag',
    },
    { pattern: /\bgit\s+restore\b/, label: 'destructive git restore command' },
    { pattern: /\bgit\s+reset\s+--hard\b/, label: 'destructive git reset command' },
    { pattern: /\bgit\s+checkout\s+--\b/, label: 'destructive git checkout command' },
    { pattern: /\bgit\s+clean\s+-[^\s]*f/, label: 'destructive git clean command' },
    { pattern: /\brm\s+-rf\b/, label: 'destructive recursive removal command' },
    { pattern: /\bgit\s+push\b[^\n]*(?:--force|-f)\b/, label: 'force push command' },
    { pattern: /\bgit\s+(?:commit|push)\b[^\n]*--no-verify\b/, label: 'hook bypass command' },
    { pattern: /\b(?:it|test|describe)\.only\b/, label: 'focused test committed' },
    { pattern: /\bas\s+any\b|:\s*any\b/, label: 'unsafe any type relaxation' },
    { pattern: /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/i, label: 'new unresolved debt marker' },
    {
      pattern: /\bmock(?:ed)?\b|\bfake\b|\bstub\b/i,
      label: 'fake/mock implementation marker',
      productionOnly: true,
    },
    {
      pattern: /return\s+\{\s*ok\s*:\s*true\s*\}/,
      label: 'suspicious unconditional success return',
    },
    { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, label: 'empty catch block' },
    {
      pattern: /catch\s*\([^)]*\)\s*\{\s*(?:return|continue|;)\s*;?\s*\}/,
      label: 'swallowed exception',
    },
  ];

  for (const file of changed) {
    if (!isTextFile(file)) continue;
    const content = addedTextForFile(file);
    for (const { pattern, label, productionOnly = false } of forbiddenPatterns) {
      if (productionOnly && isTestFile(file)) continue;
      if (pattern.test(content)) {
        fail(`${file} contem ${label}; a constituicao proibe bypass/supressao.`);
      }
    }
  }
}

function addedTextForFile(file) {
  try {
    const diff = execFileSync('git', ['diff', '--unified=0', '--', file], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const added = diff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n');
    if (added.trim()) return added;
  } catch {
    // Fall back below for untracked files or unusual git states.
  }

  if (isTracked(file)) return '';
  return readRepo(file);
}

function isTracked(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isTextFile(file) {
  if (statSync(path.join(repoRoot, file)).size > 2 * 1024 * 1024) return false;
  return /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|sh|css|scss|html|txt)$/.test(file);
}

function isTestFile(file) {
  return (
    /(?:^|\/)(?:__tests__|test|tests|specs)\//.test(file) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)
  );
}

function checkForbiddenDeletions() {
  const deleted = collectNameStatus()
    .filter((entry) => entry.status.startsWith('D'))
    .flatMap((entry) => entry.paths);

  const dangerousDeleted = deleted.filter(
    (file) =>
      /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file) ||
      file.endsWith('.md') ||
      file.startsWith('scripts/ops/') ||
      file.startsWith('ops/') ||
      file.startsWith('.github/workflows/'),
  );

  for (const file of dangerousDeleted) {
    fail(
      `${file} foi deletado; delecao de teste/governance/docs exige prova humana explicita fora do fluxo automatico.`,
    );
  }
}
