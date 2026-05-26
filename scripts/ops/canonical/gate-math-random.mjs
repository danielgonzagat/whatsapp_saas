#!/usr/bin/env node
// Anti-regression gate G13: Ban Math.random() outside test/seed files.
//
// Scans backend/src, frontend/src, frontend-admin/src, worker/ for
// Math.random() calls in production source files (excluding *.spec.ts,
// *.test.ts, *.seed.ts, and __tests__/ directories).
//
// Exit 0 = clean. Exit 1 = violations found.
//
// See: docs/architecture/ANTI_REGRESSION_GATES.md § G13
//      docs/audits/WAVE2_MATH_RANDOM_AUDIT.md

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const SCAN_ROOTS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker'];
const TS_GLOB = /\.(ts|tsx|mjs|js|jsx)$/;
const SKIP_RE = /(node_modules|dist|\.next|build|__tests__|\.spec\.|\.test\.|\.seed\.)/;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_RE.test(entry)) yield* walk(full);
    } else if (TS_GLOB.test(entry) && !SKIP_RE.test(full)) {
      yield full;
    }
  }
}

const MATH_RANDOM_RE = /Math\.random\b/g;

/** Quick check: is `pos` inside a non-code context (comment/string/JSX/JSDoc)? */
function isInNonCode(line, pos) {
  const trimmed = line.trimStart();
  // JSDoc continuation: "   * Math.random..."
  if (trimmed.startsWith('*') && (trimmed.length === 1 || trimmed[1] === ' ' || trimmed[1] === '@')) {
    return true;
  }
  // JSX text: inside angle brackets like <code>Math.random</code>
  let ltIdx = -1;
  for (let j = pos; j >= 0; j--) { if (line[j] === '<' && /[A-Za-z]/.test(line[j + 1] || '')) { ltIdx = j; break; } }
  if (ltIdx >= 0) {
    for (let j = pos; j < line.length; j++) { if (line[j] === '>') return true; }
  }
  // Single-quoted / double-quoted string literal
  const before = line.slice(0, pos);
  const sq = (before.match(/(?:^|[^\\])'/g) || []).length;
  const dq = (before.match(/(?:^|[^\\])"/g) || []).length;
  if (sq % 2 === 1 || dq % 2 === 1) return true;
  // Template literal: only text portions are non-code; ${...} is code
  // Count unescaped backticks before pos
  let btCount = 0;
  for (let j = 0; j < pos; j++) {
    if (line[j] === '`' && (j === 0 || line[j - 1] !== '\\')) btCount++;
  }
  if (btCount % 2 === 1) {
    // Inside a template literal. Check if pos is inside a ${...} interpolation.
    let depth = 0;
    let inInterp = false;
    for (let j = 0; j < pos; j++) {
      if (line[j] === '\\') { j++; continue; } // skip escaped chars
      if (line[j] === '$' && line[j + 1] === '{') { depth++; j++; inInterp = true; continue; }
      if (line[j] === '}' && depth > 0) { depth--; if (depth === 0) inInterp = false; continue; }
    }
    if (!inInterp && depth === 0) return true; // in string text, not code
  }
  // Single-line comment
  const slc = line.indexOf('//');
  if (slc >= 0 && pos > slc) return true;
  // Block comment
  const bcStart = line.indexOf('/*');
  const bcEnd = line.indexOf('*/', bcStart + 2);
  if (bcStart >= 0 && pos > bcStart && (bcEnd < 0 || pos < bcEnd)) return true;
  return false;
}

const violations = [];

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      MATH_RANDOM_RE.lastIndex = 0;
      let match;
      while ((match = MATH_RANDOM_RE.exec(lines[i])) !== null) {
        if (!isInNonCode(lines[i], match.index)) {
          const rel = relative(ROOT, file);
          violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
          break; // one violation per line is enough
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log('[G13] Math.random gate: CLEAN — zero prod violations');
  process.exit(0);
}

console.error(`[G13] Math.random gate: ${violations.length} violation(s) in production code:`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} — Math.random() used`);
  console.error(`    → ${v.text}`);
  console.error(`    → Use randomIdSegment() from common/random-id.ts (crypto.randomBytes-backed).`);
}
console.error('\nFix: Replace Math.random() with crypto.randomBytes-backed helpers.');
console.error('  See: docs/audits/WAVE2_MATH_RANDOM_AUDIT.md');
process.exit(1);

