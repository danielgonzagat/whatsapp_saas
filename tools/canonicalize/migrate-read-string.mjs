#!/usr/bin/env node
// One-shot codemod: migrate `readString` family declarations to imports
// from `backend/src/common/parse.ts`.
//
// Per variant (S1-S5) defined by A1 audit. Run one variant at a time
// to keep migrations atomic and reversible. tsc validates after batch.
//
// Usage:
//   node tools/canonicalize/migrate-read-string.mjs S1
//   node tools/canonicalize/migrate-read-string.mjs all
//   node tools/canonicalize/migrate-read-string.mjs --dry-run S1

import { readFileSync, writeFileSync } from 'node:fs';
import { relative, dirname, join } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const CANONICAL = join(ROOT, 'backend/src/common/parse');

const VARIANTS = {
  // S1: readString(value): string|undefined { return typeof value==='string' && value.trim() ? value : undefined; }
  // — exact body of 4 files, byte-identical. Migrate to readString.
  S1: {
    canonicalName: 'readString',
    re: /function readString\(value: unknown\): string \| undefined \{\s*return typeof value === 'string' && value\.trim\(\) \? value : undefined;\s*\}/m,
    files: [
      'backend/src/common/request-logger.interceptor.ts',
      'backend/src/common/idempotency.interceptor.ts',
      'backend/src/flows/flows.gateway.ts',
      'backend/src/whatsapp/providers/provider-registry-session.ts',
    ],
  },
  // S2: email-workspace-delivery — returns trimmed + undefined
  S2: {
    canonicalName: 'readTrimmedString',
    re: /function readString\(value: unknown\): string \| undefined \{\s*return typeof value === 'string' && value\.trim\(\) \? value\.trim\(\) : undefined;\s*\}/m,
    files: ['backend/src/kloel/email-workspace-delivery.ts'],
    aliasLocalAs: 'readString',
  },
  // S4: correction.observer — readStringForce
  S4: {
    canonicalName: 'readStringForce',
    re: /function readString\(value: unknown\): string \{\s*return typeof value === 'string' \? value\.trim\(\) : '';\s*\}/m,
    files: ['backend/src/kloel/owner-criterion/observers/correction.observer.ts'],
    aliasLocalAs: 'readString',
  },
  // S3: account-agent.parsers — exported readString returning string | null (no trim)
  S3: {
    canonicalName: 'readStringOrNull',
    re: /function readString\(value: unknown\): string \| null \{\s*return typeof value === 'string' && value\.trim\(\) \? value : null;\s*\}/m,
    files: ['backend/src/whatsapp/account-agent.parsers.ts'],
    aliasLocalAs: 'readString',
  },
  // S5a: readStringOr — trimmed, fallback param
  S5a: {
    canonicalName: 'readStringOr',
    re: /function readString\(value: unknown, fallback = ''\): string \{\s*return typeof value === 'string' && value\.trim\(\) \? value\.trim\(\) : fallback;\s*\}/m,
    files: [
      'backend/src/kloel/unified-agent-actions-workspace.service.ts',
      'backend/src/kloel/unified-agent-actions-sales.service.ts',
    ],
    aliasLocalAs: 'readString',
  },
  // S5b: readStringOrUntrimmed — no trim, fallback param
  S5b: {
    canonicalName: 'readStringOrUntrimmed',
    re: /function readString\(value: unknown, fallback = ''\): string \{\s*return typeof value === 'string' \? value : fallback;\s*\}/m,
    files: ['backend/src/kloel/unified-agent-actions-crm-predecided.helpers.ts'],
    aliasLocalAs: 'readString',
  },
};

const arg = process.argv[2] ?? 'help';
const dryRun = process.argv.includes('--dry-run');

if (arg === 'help' || !arg) {
  console.log('Usage: node migrate-read-string.mjs <S1|S2|S3|S4|S5a|S5b|all> [--dry-run]');
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
