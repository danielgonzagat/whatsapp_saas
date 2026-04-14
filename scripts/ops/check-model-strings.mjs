#!/usr/bin/env node

import { listFiles, readJsonFile, readRepoFile } from './lib/scan-utils.mjs';

const MODEL_LITERAL_RE = /['"`]((?:gpt|claude|dall-e|o1|o3)[A-Za-z0-9._-]+)['"`]/g;

const registry = readJsonFile('ops/model-string-registry.json', null);

if (!registry || !Array.isArray(registry.allowedFiles)) {
  console.error(
    '[check-model-strings] ops/model-string-registry.json precisa conter allowedFiles.',
  );
  process.exit(1);
}

const allowedFiles = new Set(registry.allowedFiles.map(String));
const files = listFiles(['backend/src'], {
  extensions: ['.ts'],
  includeTests: true,
  changedOnly: true,
});

const findings = [];

for (const file of files) {
  if (allowedFiles.has(file)) {
    continue;
  }

  const content = readRepoFile(file);
  for (const match of content.matchAll(MODEL_LITERAL_RE)) {
    findings.push(`${file} usa model string inline (${match[1]})`);
  }
}

if (findings.length > 0) {
  console.error('[check-model-strings] Model strings fora do registro canonico:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('[check-model-strings] OK');
