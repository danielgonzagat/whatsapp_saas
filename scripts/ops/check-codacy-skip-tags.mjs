#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BANNED_TAGS = ['[codacy skip]', '[skip codacy]', '[ci skip]', '[skip ci]'];

function fail(message) {
  console.error(`[check-codacy-skip-tags] ${message}`);
  process.exit(1);
}

function normalizeCommitRecords(raw) {
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', body = ''] = record.split('\x1f');
      return { sha: sha.trim(), body: body.trim() };
    })
    .filter((record) => record.sha);
}

function findForbiddenTags(text) {
  const lowerText = text.toLowerCase();
  return BANNED_TAGS.filter((tag) => lowerText.includes(tag));
}

function assertNoForbiddenTags(text, label) {
  const found = findForbiddenTags(text);
  if (found.length === 0) return;

  fail(
    `${label} contem skip tags proibidas para Codacy/CI: ${found.join(', ')}. ` +
      'Nao use skip tags; os checks devem sempre executar.',
  );
}

function git(command) {
  return execSync(command, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveDefaultRevset() {
  const candidates = ['@{upstream}..HEAD', 'origin/main..HEAD', 'HEAD~1..HEAD'];
  for (const revset of candidates) {
    try {
      git(`git rev-list --max-count=1 ${revset}`);
      return revset;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function checkRange(revset) {
  let output = '';

  try {
    output = git(`git log --format=%H%x1f%B%x1e ${revset}`);
  } catch {
    console.log(`[check-codacy-skip-tags] Nenhum commit para validar em ${revset}.`);
    return;
  }

  const records = normalizeCommitRecords(output);
  if (records.length === 0) {
    console.log(`[check-codacy-skip-tags] Nenhum commit para validar em ${revset}.`);
    return;
  }

  const violations = records
    .map((record) => ({ ...record, tags: findForbiddenTags(record.body) }))
    .filter((record) => record.tags.length > 0);

  if (violations.length === 0) {
    console.log(
      `[check-codacy-skip-tags] OK — ${records.length} commit(s) validados em ${revset}.`,
    );
    return;
  }

  console.error('[check-codacy-skip-tags] Foram encontrados commits com skip tags proibidas:');
  for (const violation of violations) {
    console.error(`- ${violation.sha}: ${violation.tags.join(', ')}`);
  }
  fail('Remova as skip tags dos commits antes de prosseguir.');
}

const args = process.argv.slice(2);

if (args[0] === '--edit' && typeof args[1] === 'string') {
  const message = readFileSync(args[1], 'utf8');
  assertNoForbiddenTags(message, 'Mensagem de commit');
  console.log('[check-codacy-skip-tags] OK — mensagem de commit validada.');
  process.exit(0);
}

if (args[0] === '--revset' && typeof args[1] === 'string') {
  checkRange(args[1]);
  process.exit(0);
}

const defaultRevset = resolveDefaultRevset();
if (!defaultRevset) {
  console.log('[check-codacy-skip-tags] Nenhum revset elegivel encontrado; nada para validar.');
  process.exit(0);
}

checkRange(defaultRevset);
