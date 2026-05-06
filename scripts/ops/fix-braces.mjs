#!/usr/bin/env node
// Fix: remove braces incorrectly added to regular JS assignments
// Only JSX attributes need braces: <Comp attr={colors.X.Y} />
// Regular JS: e.target.style.borderColor = colors.X.Y (NO braces)

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

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

// Patterns where braces are WRONG (regular JS, not JSX)
// These should be `= colors.X.Y` not `={colors.X.Y}`

const files = findChangedFiles();
let totalFixed = 0;

for (const relPath of files) {
  const filepath = join(ROOT, relPath);
  let content = readFileSync(filepath, 'utf8');
  const original = content;

  // Fix 1: const/let X={colors.Y.Z}; → const/let X=colors.Y.Z;
  content = content.replace(/\b(const|let|var)\s+(\w+)=\{colors\./g, '$1 $2 = colors.');

  // Fix 2: .style.X={colors.Y.Z} → .style.X = colors.Y.Z
  content = content.replace(/\.style\.(\w+)=\{colors\./g, '.style.$1 = colors.');

  // Fix 3: as HTML...).style.X={colors.Y.Z} → ).style.X = colors.Y.Z
  // (e.currentTarget as HTMLDivElement).style.borderColor={colors...
  content = content.replace(/\)\s*\.style\.(\w+)=\{colors\./g, ').style.$1 = colors.');

  // Fix 4: Any remaining assignment in non-JSX context
  // (not preceded by a JSX attribute context like < or )
  // Use broader pattern: ={colors. followed by ; or )
  content = content.replace(/=\{(colors\.\w+\.\w+)\}\s*([;,)])/g, (match, tok, end) => {
    // Check if this is in JSX context (line contains < or > around it)
    // Simple heuristic: only fix if following char is ;
    if (end === ';') return `= ${tok}${end}`;
    return match; // might be JSX attribute, keep
  });

  if (content !== original) {
    writeFileSync(filepath, content, 'utf8');
    totalFixed++;
    console.log(`  ✓ ${relPath}`);
  }
}

console.log(`\nFixed ${totalFixed} files.`);
