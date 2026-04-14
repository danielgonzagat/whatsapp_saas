#!/usr/bin/env node

import { listFiles, readRepoFile } from './lib/scan-utils.mjs';

const files = listFiles(['backend/src', 'frontend/src', 'worker', 'e2e'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  changedOnly: true,
});

if (files.length === 0) {
  console.log('[check-unsafe-casts] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const guardHints = /(typeof|instanceof|safeParse|parse\(|z\.)/;
const findings = [];

for (const file of files) {
  const lines = readRepoFile(file).split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';
    const nextLine = lines[index + 1] || '';
    const combined = `${line} ${nextLine}`.replace(/\s+/g, ' ');

    if (/as unknown as/.test(combined)) {
      findings.push(`${file}:${index + 1} double cast "as unknown as"`);
      continue;
    }

    if (/unknown\s+as\s+[A-Za-z_$][\w$<>, ]*/.test(combined) && !guardHints.test(combined)) {
      findings.push(`${file}:${index + 1} cast imediato de unknown sem type guard`);
    }
  }
}

if (findings.length > 0) {
  console.error('[check-unsafe-casts] Casts inseguros detectados:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`[check-unsafe-casts] OK — ${files.length} arquivo(s) auditado(s).`);
