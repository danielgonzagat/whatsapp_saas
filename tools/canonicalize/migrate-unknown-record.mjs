#!/usr/bin/env node
// One-shot codemod: replace local `type UnknownRecord = Record<string, unknown>;`
// declarations with re-export from canonical `backend/src/common/types`.
//
// Detects the exact line shape and computes the right relative path from
// the consumer file to backend/src/common/types.ts.
//
// Safe per-file: each replacement is a single-line swap. tsc validates
// after the batch.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative, dirname, join, basename } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const CANONICAL = join(ROOT, 'backend/src/common/types.ts');

const LINE_RE = /^export type UnknownRecord = Record<string, unknown>;$/m;
const FALLBACK_RE = /^type UnknownRecord = Record<string, unknown>;$/m;

const grepOut = execSync(
  "grep -rln 'type UnknownRecord = Record<string, unknown>;' --include='*.ts' backend/src",
  { cwd: ROOT, encoding: 'utf8' },
).trim();
const files = grepOut.split('\n').filter(Boolean);
console.log(`found ${files.length} files`);

let migratedExport = 0;
let migratedLocal = 0;
let skipped = 0;

for (const relPath of files) {
  const abs = join(ROOT, relPath);
  if (abs === CANONICAL) {
    skipped++;
    continue; // never migrate the canonical home
  }
  const src = readFileSync(abs, 'utf8');
  // Compute import path: ../../common/types from this file's dir
  const consumerDir = dirname(abs);
  const importPath = relative(consumerDir, join(ROOT, 'backend/src/common/types'))
    .replace(/\\/g, '/');
  // Skip if no LINE_RE or FALLBACK_RE match
  if (LINE_RE.test(src)) {
    const replacement =
      `import type { UnknownRecord } from '${importPath}';\nexport type { UnknownRecord };`;
    const next = src.replace(LINE_RE, replacement);
    writeFileSync(abs, next);
    migratedExport++;
  } else if (FALLBACK_RE.test(src)) {
    const replacement = `import type { UnknownRecord } from '${importPath}';`;
    const next = src.replace(FALLBACK_RE, replacement);
    writeFileSync(abs, next);
    migratedLocal++;
  } else {
    skipped++;
  }
}

console.log(`exported (re-export pattern): ${migratedExport}`);
console.log(`local (import-only): ${migratedLocal}`);
console.log(`skipped (no exact match): ${skipped}`);
