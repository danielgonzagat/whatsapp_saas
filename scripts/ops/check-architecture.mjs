#!/usr/bin/env node

import path from 'node:path';
import { listFiles, readJsonFile, readRepoFile, runNodeScript } from './lib/scan-utils.mjs';

const baseResult = runNodeScript('scripts/ops/check-architecture-guardrails.mjs');
if (baseResult.status !== 0) {
  process.stdout.write(baseResult.stdout || '');
  process.stderr.write(baseResult.stderr || '');
  process.exit(baseResult.status ?? 1);
}

const warnings = [];
const failures = [];

const layoutFiles = listFiles(['frontend/src/app'], {
  extensions: ['.tsx'],
  changedOnly: true,
  predicate: (file) => file.endsWith('/layout.tsx'),
});

const providerLocations = new Map();

for (const file of layoutFiles) {
  const content = readRepoFile(file);
  const providerMatches = content.match(/\b[A-Z][A-Za-z0-9]+Provider\b/g) || [];
  for (const provider of providerMatches) {
    const current = providerLocations.get(provider) || [];
    current.push(file);
    providerLocations.set(provider, current);
  }
}

for (const [provider, locations] of providerLocations.entries()) {
  if (locations.length > 1) {
    warnings.push(`${provider} aparece em multiplos layouts: ${locations.join(', ')}`);
  }
}

const controllerFiles = listFiles(['backend/src'], {
  extensions: ['.ts'],
  changedOnly: true,
  predicate: (file) => file.endsWith('.controller.ts'),
});

for (const file of controllerFiles) {
  const content = readRepoFile(file);
  const hasController = content.includes('@Controller(');
  const isPublicController = content.includes('@Public(');
  const hasGuard = content.includes('@UseGuards(');

  if (hasController && !isPublicController && !hasGuard) {
    failures.push(`${file} nao declara guardas nem marca explicitamente como publico`);
  }
}

const registry = readJsonFile('ops/component-registry.json', { entries: [] });
const knownNames = Array.isArray(registry.entries)
  ? registry.entries.map((entry) => String(entry?.name || '').trim()).filter(Boolean)
  : [];

for (const file of listFiles(['frontend/src/components'], {
  extensions: ['.tsx'],
  changedOnly: true,
})) {
  const componentName = path.basename(file, path.extname(file));
  if (!componentName) {
    continue;
  }

  for (const knownName of knownNames) {
    if (knownName === componentName) {
      continue;
    }
    if (levenshtein(knownName.toLowerCase(), componentName.toLowerCase()) <= 2) {
      warnings.push(`${file} tem nome muito proximo de componente existente (${knownName})`);
      break;
    }
  }
}

if (failures.length > 0) {
  console.error('[check-architecture] Violacoes detectadas:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (warnings.length > 0) {
    console.error('[check-architecture] Warnings adicionais:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('[check-architecture] Warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log('[check-architecture] OK');

function levenshtein(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let i = 0; i <= left.length; i += 1) {
    rows[i][0] = i;
  }
  for (let j = 0; j <= right.length; j += 1) {
    rows[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }

  return rows[left.length][right.length];
}
