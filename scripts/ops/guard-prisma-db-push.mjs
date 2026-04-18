#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const blocklistPatterns = [
  /\.github\/workflows\/.*\.ya?ml$/,
  /package\.json$/,
  /Dockerfile$/,
  /docker-compose.*\.ya?ml$/,
  /scripts\/.*\.(sh|bash)$/,
  /\.husky\/.+$/,
];

const ignoredPatterns = [
  /^docs\//,
  /^README/,
  /^node_modules\//,
  /^frontend\/\.next\//,
  /^backend\/dist\//,
  /^worker\/dist\//,
];

const offenders = [];

function hasForbiddenWorkflowUsage(content) {
  const lines = content.split(/\r?\n/);
  let runBlockIndent = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (runBlockIndent !== null) {
      if (line.trim() === '') {
        continue;
      }
      if (indent <= runBlockIndent) {
        runBlockIndent = null;
      } else if (/prisma\s+db\s+push/i.test(line)) {
        return true;
      }
    }

    if (/^\s*run:\s*.*prisma\s+db\s+push/i.test(line)) {
      return true;
    }

    if (/^\s*run:\s*[>|]\s*$/.test(line)) {
      runBlockIndent = indent;
    }
  }

  return false;
}

function hasForbiddenUsage(relPath, content) {
  if (relPath.endsWith('package.json')) {
    return /"[^"]+"\s*:\s*"[^"]*prisma\s+db\s+push/i.test(content);
  }

  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: relPath is derived from the repo tree (fs.readdirSync under rootDir); no user/network input. Regex has no nested quantifiers.
  if (/\.github\/workflows\/.*\.ya?ml$/.test(relPath)) {
    return hasForbiddenWorkflowUsage(content);
  }

  return content
    .split(/\r?\n/)
    .some((line) => !/^\s*#/.test(line) && /\bprisma\s+db\s+push\b/i.test(line));
}

function visit(currentDir) {
  // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
  // Safe: currentDir is seeded from rootDir (path.resolve of this script's own dirname) and only recursed into real directory entries; no user input.
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');

    if (ignoredPatterns.some((pattern) => pattern.test(relPath))) {
      continue;
    }

    if (entry.isDirectory()) {
      visit(absPath);
      continue;
    }

    if (!blocklistPatterns.some((pattern) => pattern.test(relPath))) {
      continue;
    }

    // nosemgrep: javascript.lang.security.audit.path-traversal.non-literal-fs-filename.non-literal-fs-filename
    // Safe: absPath is path.join(currentDir, entry.name) where currentDir derives from rootDir and entry.name comes from fs.readdirSync; no user input.
    const content = fs.readFileSync(absPath, 'utf8');

    if (hasForbiddenUsage(relPath, content)) {
      offenders.push(relPath);
    }
  }
}

visit(rootDir);

if (offenders.length > 0) {
  console.error('Blocked: prisma db push is forbidden in automation and production paths.');
  for (const file of offenders) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log('No forbidden prisma db push usage found in automation or production paths.');
