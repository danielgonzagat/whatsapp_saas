#!/usr/bin/env node

import path from 'node:path';
import { listFiles, readRepoFile, repoRoot } from './lib/scan-utils.mjs';

const WORKSPACES = [
  { name: 'frontend', root: 'frontend/src' },
  { name: 'backend', root: 'backend/src' },
  { name: 'worker', root: 'worker' },
];

const files = listFiles(
  WORKSPACES.map((workspace) => workspace.root),
  {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    changedOnly: true,
    includeTests: true,
  },
);

if (files.length === 0) {
  console.log('[check-layer-boundaries] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const violations = [];

for (const file of files) {
  const workspace = resolveWorkspace(file);
  if (!workspace) {
    continue;
  }

  const content = readRepoFile(file);
  const imports = extractImports(content);

  for (const entry of imports) {
    const targetWorkspace = resolveImportWorkspace(file, entry.specifier);
    if (!targetWorkspace || targetWorkspace === workspace.name) {
      continue;
    }

    violations.push(
      `${file}:${entry.line} importa ${entry.specifier} cruzando ${workspace.name} -> ${targetWorkspace}`,
    );
  }
}

if (violations.length > 0) {
  console.error('[check-layer-boundaries] Violacoes de fronteira detectadas:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`[check-layer-boundaries] OK — ${files.length} arquivo(s) auditado(s).`);

function resolveWorkspace(file) {
  return WORKSPACES.find(
    (workspace) => file === workspace.root || file.startsWith(`${workspace.root}/`),
  );
}

function extractImports(source) {
  const matches = [];
  const patterns = [
    /import\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /export\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      const index = match.index ?? 0;
      matches.push({
        specifier,
        line: source.slice(0, index).split('\n').length,
      });
    }
  }

  return matches;
}

function resolveImportWorkspace(fromFile, specifier) {
  const sourceWorkspace = resolveWorkspace(fromFile);
  if (!sourceWorkspace) {
    return null;
  }

  if (specifier.startsWith('.')) {
    const absoluteTarget = path.resolve(repoRoot, path.dirname(fromFile), specifier);
    const normalizedTarget = absoluteTarget.split(path.sep).join('/');
    return (
      WORKSPACES.find((workspace) => normalizedTarget.includes(`/${workspace.root}`))?.name || null
    );
  }

  const normalized = specifier.replace(/\\/g, '/');
  if (/^(frontend|backend|worker)(\/|$)/.test(normalized)) {
    return normalized.split('/')[0];
  }
  if (/^@(frontend|backend|worker)(\/|$)/.test(normalized)) {
    return normalized.slice(1).split('/')[0];
  }

  return null;
}
