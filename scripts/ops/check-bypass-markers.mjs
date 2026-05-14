#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pulseCommentTokenPattern = /\bPULSE_[A-Z][A-Z0-9_]*\b/g;
const commentPattern = /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const evidenceExtensions = new Set([...sourceExtensions, '.json']);
const skippedPathPrefixes = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '.turbo/',
  'coverage/',
  'artifacts/',
];

function listFiles() {
  const stdout = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !skippedPathPrefixes.some((prefix) => line.startsWith(prefix)));
}

function shouldScan(file) {
  return sourceExtensions.has(path.extname(file).toLowerCase());
}

function canProvideEvidence(file) {
  return evidenceExtensions.has(path.extname(file).toLowerCase());
}

function readSafely(absolute) {
  try {
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) {
      return null;
    }
    return readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function removeComments(text) {
  return text.replace(commentPattern, '');
}

function collectEvidenceTokens(files) {
  const tokens = new Set();
  for (const file of files) {
    if (path.basename(file).startsWith('PULSE_')) {
      tokens.add(path.basename(file).replace(/\.[^.]+$/, ''));
    }
    if (!canProvideEvidence(file)) {
      continue;
    }
    const text = readSafely(path.join(repoRoot, file));
    if (text === null) {
      continue;
    }
    const searchable = shouldScan(file) ? removeComments(text) : text;
    for (const match of searchable.matchAll(pulseCommentTokenPattern)) {
      tokens.add(match[0]);
    }
  }
  return tokens;
}

function findCommentMarkers(file, text, evidenceTokens) {
  const findings = [];
  for (const commentMatch of text.matchAll(commentPattern)) {
    const comment = commentMatch[0];
    const commentOffset = commentMatch.index ?? 0;
    for (const tokenMatch of comment.matchAll(pulseCommentTokenPattern)) {
      const token = tokenMatch[0];
      if (!evidenceTokens.has(token)) {
        findings.push({
          file,
          line: lineNumberForOffset(text, commentOffset + (tokenMatch.index ?? 0)),
          token,
        });
      }
    }
  }
  return findings;
}

function main() {
  const findings = [];
  let scanned = 0;
  const files = listFiles();
  const evidenceTokens = collectEvidenceTokens(files);

  for (const file of files) {
    if (!shouldScan(file)) {
      continue;
    }
    const text = readSafely(path.join(repoRoot, file));
    if (text === null) {
      continue;
    }
    scanned += 1;
    findings.push(...findCommentMarkers(file, text, evidenceTokens));
  }

  if (findings.length > 0) {
    console.error('[check-bypass-markers] Comment tokens without production evidence found:');
    for (const finding of findings) {
      console.error(`  - ${finding.file}:${finding.line} ${finding.token}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-bypass-markers] OK — ${scanned} file(s) scanned, all comment tokens have production evidence.`,
  );
}

main();
