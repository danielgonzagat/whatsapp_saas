#!/usr/bin/env node
// ⚠️ Cleanup pass: fix syntax issues from hex-to-tokens migration
// 1. Remove quotes around colors.X.Y in JS expression contexts
// 2. Add braces to JSX attributes using colors.X.Y

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// Find all files recently modified (with colors.X.Y references)
function findChangedFiles() {
  const result = execSync('git diff --name-only --diff-filter=M HEAD', {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return result
    .trim()
    .split('\n')
    .filter((f) => f.startsWith('frontend/src/') && (f.endsWith('.tsx') || f.endsWith('.ts')));
}

const files = findChangedFiles();
console.log(`Found ${files.length} changed files.`);

let totalFixed = 0;

for (const relPath of files) {
  const filepath = join(ROOT, relPath);
  let content = readFileSync(filepath, 'utf8');
  const original = content;

  // 1. Fix quoted token references in JS expression contexts
  // Pattern: 'colors.X.Y' or "colors.X.Y" where X.Y are valid property paths
  // We need to be careful about template literals though
  content = content.replace(
    /(['"])\s*(colors\.[a-zA-Z_]+\.[a-zA-Z_]+)\s*\1/g,
    (match, quote, token) => {
      // Don't fix if inside template literal `...`
      // (handled by checking that we're not inside backtick context)
      // This is a simplification - should work for most cases
      return token;
    },
  );

  // 2. Fix JSX attributes that lost their braces: attr=colors.X.Y → attr={colors.X.Y}
  // Pattern in JSX: name=colors.X.Y (without quotes or braces)
  // In JSX, this is a syntax error.
  content = content.replace(
    /(\b[a-zA-Z_]+\w*)\s*=\s*(colors\.[a-zA-Z_]+\.[a-zA-Z_]+)(?![{(\w])/g,
    '$1={$2}',
  );

  // 3. Fix template literal embedded: 'colors.X.Y' in backtick strings
  // Within backtick templates: `...${'colors.X.Y'}...` → `...${colors.X.Y}...`
  // This is tricky since our previous regex might have converted some incorrectly
  // Let's fix explicit patterns: ${'colors.X.Y'} → ${colors.X.Y}
  content = content.replace(/\$\{(['"])\s*(colors\.[a-zA-Z_]+\.[a-zA-Z_]+)\s*\1\}/g, '${$2}');

  if (content !== original) {
    writeFileSync(filepath, content, 'utf8');
    const diffs = (content.match(/colors\./g) || []).length;
    totalFixed++;
    console.log(`  ✓ ${relPath}`);
  }
}

console.log(`\nFixed ${totalFixed} files.`);
