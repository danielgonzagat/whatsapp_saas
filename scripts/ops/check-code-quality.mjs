#!/usr/bin/env node

import { listFiles, readRepoFile } from './lib/scan-utils.mjs';

const EFFECT_RE = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[[\s\S]*?\]\s*\)/g;
const DEBT_COMMENT_RE = /\b(?:TODO|FIXME|HACK|XXX)\b(?![^\n]*(?:#\d+|KLOEL-\d+|https?:\/\/))/g;
const TRACKING_MAGIC_NUMBER_RE = /\btrack(?:Ai)?Usage\([^,\n]+,\s*\d+\s*\)/g;

const files = listFiles(['backend/src', 'frontend/src', 'worker'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  changedOnly: true,
});

if (files.length === 0) {
  console.log('[check-code-quality] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const findings = [];

for (const file of files) {
  const content = readRepoFile(file);

  for (const match of content.matchAll(DEBT_COMMENT_RE)) {
    findings.push(`${file} contem comentario de divida sem issue rastreavel`);
  }

  for (const match of content.matchAll(TRACKING_MAGIC_NUMBER_RE)) {
    findings.push(`${file} usa valor magico em tracking (${match[0]})`);
  }

  if (!file.endsWith('.tsx')) {
    continue;
  }

  for (const match of content.matchAll(EFFECT_RE)) {
    const block = match[1] || '';
    const hasCleanup = /return\s+\(\)\s*=>/.test(block);

    if (block.includes('setTimeout(') && !hasCleanup && !block.includes('clearTimeout(')) {
      findings.push(`${file} usa setTimeout em useEffect sem cleanup`);
    }
    if (block.includes('setInterval(') && !hasCleanup && !block.includes('clearInterval(')) {
      findings.push(`${file} usa setInterval em useEffect sem cleanup`);
    }
    if (
      block.includes('addEventListener(') &&
      !hasCleanup &&
      !block.includes('removeEventListener(')
    ) {
      findings.push(`${file} usa addEventListener em useEffect sem cleanup`);
    }
    if (block.includes('subscribe(') && !hasCleanup && !block.includes('unsubscribe(')) {
      findings.push(`${file} usa subscribe em useEffect sem cleanup`);
    }
  }
}

if (findings.length > 0) {
  console.error('[check-code-quality] Violacoes detectadas:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`[check-code-quality] OK — ${files.length} arquivo(s) auditado(s).`);
