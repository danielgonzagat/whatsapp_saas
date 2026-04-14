#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const ALLOWLIST_PATH = path.join(here, 'architecture-allowlist.json');

const MAX_NEW_FILE_LINES = 400;
const MAX_TOUCHED_FILE_LINES = 600;
const SOURCE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/;
const IGNORED_SEGMENTS = new Set(['node_modules', 'dist', '.next', 'out', 'build', 'coverage']);
const ADDED_LINE_RULES = [
  {
    rule: 'no_new_any',
    label: 'new explicit any',
    pattern: /\bany\b/,
    skip(line) {
      return /^\s*(?:\/\/|\/\*|\*|\*\/)/.test(line);
    },
  },
  {
    rule: 'no_new_ts_ignore',
    label: 'new @ts-ignore',
    pattern: /@ts-ignore\b/,
  },
  {
    rule: 'no_new_eslint_disable',
    label: 'new eslint-disable',
    pattern: /eslint-disable\b/,
  },
];

function fail(message) {
  console.error(`[architecture] ${message}`);
  process.exit(1);
}

function runGit(args, allowFailure = false) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return '';
    const stderr = error?.stderr?.toString?.() || error?.message || String(error);
    fail(`git ${args.join(' ')} failed:\n${stderr}`);
  }
}

function isRelevantPath(relPath) {
  if (!SOURCE_FILE_RE.test(relPath)) return false;
  const parts = relPath.split('/');
  return !parts.some((part) => IGNORED_SEGMENTS.has(part));
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) {
    fail(`Allowlist missing: ${ALLOWLIST_PATH}`);
  }

  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  if (!Array.isArray(raw.entries)) {
    fail('architecture-allowlist.json must contain an entries array.');
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const entry of raw.entries) {
    if (!entry?.path || !entry?.rule || !entry?.owner || !entry?.reason || !entry?.expiresAt) {
      fail('Each allowlist entry must contain path, rule, owner, reason, and expiresAt.');
    }
    if (String(entry.expiresAt) < today) {
      fail(`Expired allowlist entry: ${entry.path} (${entry.rule}) expired on ${entry.expiresAt}`);
    }
  }

  return raw.entries;
}

function resolveCiBaseRef() {
  const explicitBase = process.env.ARCHITECTURE_DIFF_BASE;
  if (explicitBase) {
    return explicitBase;
  }

  const baseBranch = process.env.GITHUB_BASE_REF;
  if (baseBranch) {
    const remoteRef = `origin/${baseBranch}`;
    runGit(['rev-parse', '--verify', remoteRef]);
    return runGit(['merge-base', 'HEAD', remoteRef]);
  }

  const previousCommit = runGit(['rev-parse', '--verify', 'HEAD~1'], true);
  return previousCommit || 'HEAD';
}

function getChangedFiles() {
  const files = new Map();

  if (process.env.GITHUB_ACTIONS === 'true') {
    const base = resolveCiBaseRef();
    const output = runGit(['diff', '--name-status', '--diff-filter=AM', `${base}...HEAD`], true);
    for (const line of output.split('\n').filter(Boolean)) {
      const [status, relPath] = line.split('\t');
      if (relPath && isRelevantPath(relPath)) {
        files.set(relPath, status);
      }
    }
    return { files, diffBase: base, ciMode: true };
  }

  const tracked = runGit(['diff', '--cached', '--name-status', '--diff-filter=AM'], true);
  for (const line of tracked.split('\n').filter(Boolean)) {
    const [status, relPath] = line.split('\t');
    if (relPath && isRelevantPath(relPath)) {
      files.set(relPath, status);
    }
  }

  return { files, diffBase: 'HEAD', ciMode: false };
}

function readFileLines(relPath) {
  const absPath = path.join(repoRoot, relPath);
  if (!existsSync(absPath)) return [];
  return readFileSync(absPath, 'utf8').split('\n');
}

function getAddedLines(relPath, status, diffBase, ciMode) {
  const diffArgs = ciMode
    ? ['diff', '--unified=0', `${diffBase}...HEAD`, '--', relPath]
    : ['diff', '--cached', '--unified=0', '--', relPath];
  const output = runGit(diffArgs, true);
  const added = [];
  let nextLineNumber = null;

  for (const line of output.split('\n')) {
    if (line.startsWith('@@')) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      nextLineNumber = match ? Number(match[1]) : null;
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      if (nextLineNumber !== null) {
        added.push({ line: nextLineNumber, content: line.slice(1) });
        nextLineNumber += 1;
      }
      continue;
    }

    if (line.startsWith('-')) {
      continue;
    }

    if (nextLineNumber !== null) {
      nextLineNumber += 1;
    }
  }

  return added;
}

function isAllowlisted(entries, finding) {
  return entries.some((entry) => {
    if (entry.path !== finding.path || entry.rule !== finding.rule) {
      return false;
    }
    if (finding.rule === 'max_touched_file_lines' || finding.rule === 'max_new_file_lines') {
      return Number(entry.maxLines || 0) >= Number(finding.actual || 0);
    }
    if (entry.lineContains) {
      return String(finding.content || '').includes(String(entry.lineContains));
    }
    return true;
  });
}

function main() {
  const allowlist = loadAllowlist();
  const { files, diffBase, ciMode } = getChangedFiles();
  const findings = [];

  for (const [relPath, status] of files.entries()) {
    const lines = readFileLines(relPath);
    const lineCount = lines.length;
    const maxRule = status === 'A' ? 'max_new_file_lines' : 'max_touched_file_lines';
    const maxAllowed = status === 'A' ? MAX_NEW_FILE_LINES : MAX_TOUCHED_FILE_LINES;

    if (lineCount > maxAllowed) {
      const finding = {
        rule: maxRule,
        path: relPath,
        actual: lineCount,
        maxAllowed,
      };
      if (!isAllowlisted(allowlist, finding)) {
        findings.push(finding);
      }
    }

    const addedLines = getAddedLines(relPath, status, diffBase, ciMode);
    for (const added of addedLines) {
      for (const rule of ADDED_LINE_RULES) {
        if (rule.skip?.(added.content)) continue;
        if (!rule.pattern.test(added.content)) continue;

        const finding = {
          rule: rule.rule,
          label: rule.label,
          path: relPath,
          line: added.line,
          content: added.content.trim(),
        };
        if (!isAllowlisted(allowlist, finding)) {
          findings.push(finding);
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error('[architecture] Guardrail violations found:');
    for (const finding of findings) {
      if (finding.rule === 'max_new_file_lines' || finding.rule === 'max_touched_file_lines') {
        console.error(
          `  - ${finding.path}: ${finding.actual} lines exceeds ${finding.maxAllowed} for ${finding.rule}`,
        );
      } else {
        console.error(
          `  - ${finding.path}:${finding.line} -> ${finding.label} (${finding.content})`,
        );
      }
    }
    console.error('');
    console.error(
      '[architecture] Either reduce the debt in this diff or add a temporary entry to scripts/ops/architecture-allowlist.json with owner, reason, and expiresAt.',
    );
    process.exit(1);
  }

  console.log(
    `[architecture] OK — checked ${files.size} changed source files (${ciMode ? 'ci' : 'local'} diff mode).`,
  );
}

main();
