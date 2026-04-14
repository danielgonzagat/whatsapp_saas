#!/usr/bin/env node

import {
  listFiles,
  loadApprovalEntries,
  matchesApproval,
  readRepoFile,
} from './lib/scan-utils.mjs';

const dangerousHtmlApprovals = loadApprovalEntries(
  'ops/dangerously-set-exceptions.json',
  'ops/dangerously-set-exceptions.json',
);

const files = listFiles(['backend/src', 'frontend/src', 'worker'], {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  changedOnly: true,
});

if (files.length === 0) {
  console.log('[check-security] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const findings = [];
const warnings = [];

const directSecretPatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bpk_[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:token|secret|apiKey)\b\s*[:=]\s*['"](?!process\.env|import\.meta\.env)[^'"]{16,}['"]/g,
  /\b(?:token|secret|apiKey)\b\s*[:=]\s*`(?![^`]*\$\{)[^`]{16,}`/g,
];

for (const file of files) {
  const content = readRepoFile(file);

  for (const pattern of directSecretPatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      findings.push(`${file} contem segredo hardcoded (${match.slice(0, 48)})`);
    }
  }

  if (file.endsWith('.tsx') && content.includes('dangerouslySetInnerHTML')) {
    const sanitized = /DOMPurify\.sanitize|sanitize\(/.test(content);
    const approved = matchesApproval(dangerousHtmlApprovals, file, 'dangerouslySetInnerHTML');
    if (!sanitized && !approved) {
      findings.push(`${file} usa dangerouslySetInnerHTML sem sanitizacao aprovada`);
    }
  }

  if (file.endsWith('controller.ts') && /@Body\(\)\s+\w+\s*:\s*(?:any|\{)/.test(content)) {
    warnings.push(`${file} contem @Body() sem DTO validado`);
  }
}

if (findings.length > 0) {
  console.error('[check-security] Violacoes detectadas:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  if (warnings.length > 0) {
    console.error('[check-security] Warnings adicionais:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('[check-security] Warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log(`[check-security] OK — ${files.length} arquivo(s) auditado(s).`);
