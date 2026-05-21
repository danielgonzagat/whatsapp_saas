#!/usr/bin/env node
// One-shot codemod: migrate local `readNumber` family declarations to imports
// from `backend/src/common/parse.ts`.
//
// Per variant (A-E) defined by A2 audit. Run one variant at a time
// to keep migrations atomic and reversible. tsc validates after batch.
//
// Usage:
//   node tools/canonicalize/migrate-read-number.mjs A
//   node tools/canonicalize/migrate-read-number.mjs all
//   node tools/canonicalize/migrate-read-number.mjs --dry-run A

import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, join } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const CANONICAL = join(ROOT, 'backend/src/common/parse');

const VARIANTS = {
  // A: readNumber(value): number|undefined { return typeof value==='number' && Number.isFinite(value) ? value : undefined; }
  // — request-logger.interceptor.ts. Byte-identical to canonical readNumber.
  A: {
    canonicalName: 'readNumber',
    re: /function readNumber\(value: unknown\): number \| undefined \{\s*return typeof value === 'number' && Number\.isFinite\(value\) \? value : undefined;\s*\}/m,
    files: ['backend/src/common/request-logger.interceptor.ts'],
  },
  // B: readNumber(value): number|undefined with string parse fallback
  // — email-workspace-delivery.ts. Maps to readNumberLoose.
  B: {
    canonicalName: 'readNumberLoose',
    aliasLocalAs: 'readNumber',
    re: /function readNumber\(value: unknown\): number \| undefined \{\s*if \(typeof value === 'number' && Number\.isFinite\(value\)\) return value;\s*if \(typeof value === 'string' && value\.trim\(\)\) \{\s*const parsed = Number\(value\);\s*return Number\.isFinite\(parsed\) \? parsed : undefined;\s*\}\s*return undefined;\s*\}/m,
    files: ['backend/src/kloel/email-workspace-delivery.ts'],
  },
  // C: readNumber(value, fallback): number { Number() coercion }
  // — economic-objective.ts. Maps to readNumberOr.
  C: {
    canonicalName: 'readNumberOr',
    aliasLocalAs: 'readNumber',
    re: /function readNumber\(value: unknown, fallback: number\): number \{\s*const parsed = Number\(value\);\s*return Number\.isFinite\(parsed\) \? parsed : fallback;\s*\}/m,
    files: ['backend/src/kloel/economic-objective.ts'],
  },
};

const arg = process.argv[2] ?? 'help';
const dryRun = process.argv.includes('--dry-run');

if (arg === 'help' || !arg) {
  console.log('Usage: node migrate-read-number.mjs <A|B|C|all> [--dry-run]');
  process.exit(0);
}

const targets = arg === 'all' ? Object.keys(VARIANTS) : [arg];

let totalMigrated = 0;
for (const variantId of targets) {
  const v = VARIANTS[variantId];
  if (!v) {
    console.error(`Unknown variant: ${variantId}`);
    continue;
  }
  console.log(`\n=== variant ${variantId} → ${v.canonicalName} ===`);
  for (const relPath of v.files) {
    const abs = join(ROOT, relPath);
    const src = readFileSync(abs, 'utf8');
    if (!v.re.test(src)) {
      console.log(`  SKIP ${relPath} — body mismatch`);
      continue;
    }
    // Compute relative import path from this file dir to common/parse
    const importPath = relative(dirname(abs), CANONICAL).replace(/\\/g, '/');
    // Strip the local function declaration
    let next = src.replace(v.re, '');
    // Collapse blank-line clusters
    next = next.replace(/\n{3,}/g, '\n\n');
    // Decide import token
    const importToken = v.aliasLocalAs
      ? `${v.canonicalName} as ${v.aliasLocalAs}`
      : v.canonicalName;
    // Insert import near other imports
    const importLine = `import { ${importToken} } from '${importPath.startsWith('.') ? importPath : './' + importPath}';`;
    if (next.includes(importLine)) {
      console.log(`  SKIP ${relPath} — already imports`);
      continue;
    }
    const importMatches = [...next.matchAll(/^import\s.+?from\s+['"`][^'"`]+['"`];\s*$/gm)];
    if (importMatches.length === 0) {
      console.log(`  SKIP ${relPath} — no existing imports to anchor`);
      continue;
    }
    const last = importMatches[importMatches.length - 1];
    const insertAt = last.index + last[0].length;
    next = next.slice(0, insertAt) + '\n' + importLine + next.slice(insertAt);
    if (dryRun) {
      console.log(`  DRY  ${relPath}`);
    } else {
      writeFileSync(abs, next);
      console.log(`  OK   ${relPath}`);
      totalMigrated++;
    }
  }
}

console.log(`\nmigrated: ${totalMigrated}${dryRun ? ' (dry-run)' : ''}`);
