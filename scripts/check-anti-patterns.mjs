#!/usr/bin/env node
/**
 * Anti-pattern guard — blocks commits that introduce known-bad patterns.
 * Run manually or via pre-commit hook.
 *
 * To add new patterns: push to BANNED_PATTERNS array.
 * To bypass intentionally: edit this file and remove the rule.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const BANNED_PATTERNS = [
  {
    id: 'broken-error-narrowing-var',
    desc: 'errorInstanceofError variable pattern — use inline narrowing instead',
    regex: /\b(errorInstanceofError|errInstanceofError|eInstanceofError)\b/,
    suggest: 'Use inline: ${error instanceof Error ? error.message : String(error)}',
  },
  {
    id: 'bang-in-decorator-arg',
    desc: 'definite assignment ! inside @Decorator({ ... }) argument',
    regex: /@\w+\(\s*\{[^}]*\b\w+!\s*:/,
    suggest: 'Decorator args use plain prop: value, not prop!: value',
  },
  {
    id: 'bang-in-object-literal',
    desc: 'definite assignment ! inside object literal value position',
    regex: /\{\s*\w+!\s*:\s*[a-z][\w.]*[,}]/,
    suggest: 'Object literals use prop: value, not prop!: value',
  },
  {
    id: 'expect-true-toBe-true',
    desc: 'fake assertion expect(true).toBe(true)',
    regex: /expect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\s*\)/,
    suggest: 'Replace with a real assertion or delete the test',
  },
  {
    id: 'weak-status-assertion',
    desc: 'test accepting any HTTP status code',
    regex: /expect\(\s*\[\s*[0-9,\s]+\s*\]\s*\)\s*\.\s*toContain/,
    suggest: 'Assert the exact expected status code, not a range',
  },
  {
    id: 'eslint-disable-in-prod',
    desc: 'eslint-disable in non-test production code',
    regex: /\/\/\s*eslint-disable(?!.*(?:\btest\b|\bspec\b|\bfixture\b))/,
    suggest: 'Fix the underlying issue, do not suppress',
  },
  {
    id: 'codacy-suppress',
    desc: 'codacy suppression comment',
    regex: /codacy:(disable|ignore)/,
    suggest: 'Do not suppress Codacy — fix the root cause',
  },
  {
    id: 'bare-as-any',
    desc: 'as any in production TypeScript',
    regex: /\bas\s+any\b/,
    suggest: 'Model the type properly, do not use as any',
    excludePatterns: [/\.spec\.ts/, /\.test\.ts/, /__tests__/, /\.d\.ts/],
  },
  {
    id: 'ts-ignore-no-reason',
    desc: '@ts-ignore without comment explaining why',
    regex: /\/\/\s*@ts-ignore\s*$/,
    suggest: 'Use @ts-expect-error with reason comment, or fix the type',
  },
  {
    id: 'it-skip-no-reason',
    desc: 'it.skip() without second argument explaining why',
    regex: /it\.skip\(\s*['"][^'"]+['"]\s*\)/,
    suggest: 'it.skip("name", "reason why skipped")',
  },
];

function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .trim().split('\n')
      .filter(f => f.match(/\.(ts|tsx|js|jsx)$/) && !f.includes('node_modules'));
  } catch {
    return [];
  }
}

function checkFile(filePath, content) {
  const violations = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of BANNED_PATTERNS) {
      // Skip if file matches an exclude pattern
      if (pattern.excludePatterns) {
        const shouldExclude = pattern.excludePatterns.some(ep => ep.test(filePath));
        if (shouldExclude) continue;
      }

      if (pattern.regex.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          pattern: pattern.id,
          desc: pattern.desc,
          suggest: pattern.suggest,
          code: line.trim().substring(0, 120),
        });
      }
    }
  }

  return violations;
}

// ── Main ────────────────────────────────────────────────────────────
const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  process.exit(0);
}

const allViolations = [];
for (const file of stagedFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  allViolations.push(...checkFile(file, content));
}

if (allViolations.length === 0) {
  process.exit(0);
}

console.error(`\n❌ BANNED PATTERNS DETECTED (${allViolations.length}):\n`);
for (const v of allViolations) {
  console.error(`  ${v.file}:${v.line}  [${v.pattern}]`);
  console.error(`    Code:  ${v.code}`);
  console.error(`    Fix:   ${v.suggest}\n`);
}

console.error('These patterns were previously introduced by naive codemods or agent shortcuts.');
console.error('Remove them before committing. To bypass, edit scripts/check-anti-patterns.mjs.\n');
process.exit(1);
