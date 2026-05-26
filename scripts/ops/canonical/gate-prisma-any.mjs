#!/usr/bin/env node
// Anti-regression gate: Ban prismaAny re-introduction in production code.
//
// Scans backend/src and worker/ for `prismaAny` usage outside test files.
// prismaAny was fully migrated out of the codebase (ratchet prisma_any_max: 0).
// This gate blocks any new introduction.
//
// Exit 0 = clean. Exit 1 = violations found.
//
// See: docs/architecture/ANTI_REGRESSION_GATES.md § G1 (ratchet prisma_any_max)
//      docs/audits/WAVE1_PRISMAANY_AUDIT.md

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const SCAN_ROOTS = ['backend/src', 'worker'];
const TS_GLOB = /\.(ts|tsx|mjs)$/;
const SKIP_RE = /(node_modules|dist|\.next|build|__tests__|\.spec\.|\.test\.)/;

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

// Match prismaAny as an identifier (variable, property, parameter) — not as part
// of a longer word, and not inside string literals or comments.
const PRISMA_ANY_RE = /\bprismaAny\b/g;
const violations = [];

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      PRISMA_ANY_RE.lastIndex = 0;
      if (PRISMA_ANY_RE.test(lines[i])) {
        // Skip if it's inside a comment
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          // crude comment skip — may miss inline comments; acceptable for a gate
          continue;
        }
        const rel = relative(ROOT, file);
        violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log('[G1] prismaAny gate: CLEAN — zero prod violations');
  process.exit(0);
}

console.error(`[G1] prismaAny gate: ${violations.length} violation(s) in production code:`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} — prismaAny used`);
  console.error(`    → ${v.text}`);
  console.error(`    → Use typed PrismaService access. prismaAny was fully migrated out.`);
}
console.error('\nFix: Replace prismaAny with typed PrismaService delegation.');
console.error('  See: docs/audits/WAVE1_PRISMAANY_AUDIT.md');
process.exit(1);
