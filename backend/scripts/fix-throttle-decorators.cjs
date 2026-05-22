#!/usr/bin/env node
/**
 * Fix-up: removes remaining @Throttle and @SkipThrottle decorators
 * from all controller files. Handles nested braces correctly via
 * iterative bracket-counting removal.
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..');

function findAllControllers(dir, base) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') {continue;}
      results.push(...findAllControllers(fp, base));
    } else if (e.name.endsWith('.controller.ts')) {
      results.push(fp);
    }
  }
  return results;
}

function removeThrottleDecorator(text, startIdx) {
  // startIdx points to '@' of @Throttle
  // Find the matching closing paren
  let parenDepth = 0;
  let i = startIdx;
  // Skip past '@Throttle('
  while (i < text.length && text[i] !== '(') {i++;}
  // Now text[i] is '('. Enter the paren
  let j = i + 1;
  let depth = 1;
  while (j < text.length && depth > 0) {
    if (text[j] === '(') {depth++;}
    else if (text[j] === ')') {depth--;}
    j++;
  }
  const endIdx = j; // position after closing ')'

  // Now remove leading whitespace and trailing whitespace+newline+comment
  let lineStart = startIdx;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {lineStart--;}

  // Remove trailing comment on same line
  let lineEnd = endIdx;
  while (lineEnd < text.length && text[lineEnd] !== '\n') {lineEnd++;}
  if (lineEnd < text.length) {lineEnd++;} // include the newline

  return text.substring(0, lineStart) + text.substring(lineEnd);
}

function removeSkipThrottleDecorator(text, startIdx) {
  let i = startIdx;
  while (i < text.length && text[i] !== '(') {i++;}
  let j = i + 1;
  let depth = 1;
  while (j < text.length && depth > 0) {
    if (text[j] === '(') {depth++;}
    else if (text[j] === ')') {depth--;}
    j++;
  }
  const endIdx = j;

  let lineStart = startIdx;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') {lineStart--;}

  let lineEnd = endIdx;
  while (lineEnd < text.length && text[lineEnd] !== '\n') {lineEnd++;}
  if (lineEnd < text.length) {lineEnd++;}

  return text.substring(0, lineStart) + text.substring(lineEnd);
}

const controllerFiles = findAllControllers(SRC, SRC);
console.log(`Processing ${controllerFiles.length} controller files...\n`);

let totalFixes = 0;

for (const fp of controllerFiles) {
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;
  let fileFixes = 0;

  // 1. Remove @Throttle(...) using bracket counting
  let idx = 0;
  while ((idx = content.indexOf('@Throttle(', idx)) !== -1) {
    content = removeThrottleDecorator(content, idx);
    fileFixes++;
  }

  // 2. Remove @SkipThrottle(...)
  idx = 0;
  while ((idx = content.indexOf('@SkipThrottle(', idx)) !== -1) {
    content = removeSkipThrottleDecorator(content, idx);
    fileFixes++;
  }

  // 3. Remove import from @nestjs/throttler
  const before = content;
  content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"]@nestjs\/throttler['"];?\s*\n/g, '');
  if (content !== before) {fileFixes++;}

  // 4. Remove ThrottlerGuard from @UseGuards
  const before2 = content;
  content = content.replace(/,\s*ThrottlerGuard\b/g, '');
  content = content.replace(/\bThrottlerGuard\s*,\s*/g, '');
  content = content.replace(/\bThrottlerGuard\b(?!\w)/g, (match, offset) => {
    // Check if it's inside @UseGuards(...)
    const lineStart = content.lastIndexOf('\n', offset);
    const line = content.substring(lineStart + 1, content.indexOf('\n', offset));
    if (line.includes('@UseGuards') && line.includes('ThrottlerGuard')) {
      return '';
    }
    return match;
  });
  content = content.replace(/@UseGuards\(([^)]*),\s*\)/g, '@UseGuards($1)');
  content = content.replace(/@UseGuards\(\s*\)\s*\n/g, '');
  if (content !== before2) {fileFixes++;}

  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    totalFixes++;
    const rel = path.relative(SRC, fp);
    console.log(`  ${rel}: ${fileFixes} fixes`);
  }
}

console.log(`\n${totalFixes} files fixed.`);
