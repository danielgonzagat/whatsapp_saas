#!/usr/bin/env node

import { listFiles, readRepoFile } from './lib/scan-utils.mjs';

const LARGE_LITERAL_ARRAY_RE = /const\s+\w+\s*=\s*\[([\s\S]{0,4000}?)\];/g;
const UNSAFE_RESPONSE_CHAIN_RE = /\bresponse\.data\.[A-Za-z_$][\w$]*\[\d+\]\.[A-Za-z_$]/g;

const files = listFiles(['frontend/src', 'backend/src', 'worker'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  changedOnly: true,
});

if (files.length === 0) {
  console.log('[check-data-integrity] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const failures = [];
const warnings = [];

for (const file of files) {
  const content = readRepoFile(file);

  if (file.endsWith('.tsx')) {
    for (const match of content.matchAll(LARGE_LITERAL_ARRAY_RE)) {
      const body = match[1] || '';
      const objectCount = (body.match(/\{/g) || []).length;
      if (objectCount > 5) {
        failures.push(`${file} contem array literal grande dentro de componente`);
      }
    }
  }

  for (const match of content.matchAll(UNSAFE_RESPONSE_CHAIN_RE)) {
    warnings.push(`${file} acessa resposta de API sem validacao defensiva (${match[0]})`);
  }
}

if (failures.length > 0) {
  console.error('[check-data-integrity] Violacoes detectadas:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  if (warnings.length > 0) {
    console.error('[check-data-integrity] Warnings adicionais:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('[check-data-integrity] Warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log(`[check-data-integrity] OK — ${files.length} arquivo(s) auditado(s).`);
