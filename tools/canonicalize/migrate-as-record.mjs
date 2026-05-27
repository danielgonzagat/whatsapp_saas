#!/usr/bin/env node
// One-shot codemod: replace local 5-line `asRecord` declarations with
// import from canonical `backend/src/common/types`.
//
// Targets ONLY the canonical body shape:
//   function asRecord(value: unknown): Record<string, unknown> | null {
//     return value && typeof value === 'object' && !Array.isArray(value)
//       ? (value as Record<string, unknown>)
//       : null;
//   }
//
// Leaves alone:
//   - session-store.search.ts (returns {} instead of null)
//   - webhooks.service.ts (allows arrays, uses UnknownRecord import)
//   - webhooks/payment-webhook-types.ts (already exported)
//   - whatsapp/account-agent.parsers.ts (different code style)

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative, dirname, join } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const CANONICAL = join(ROOT, 'backend/src/common/types.ts');

// the 5 files with identical body
const TARGETS = [
  'backend/src/payments/ledger/connect-ledger-reconciliation.service.ts',
  'backend/src/payments/connect/connect-payout-approval.helpers.ts',
  'backend/src/payments/connect/connect-reversal.service.ts',
  'backend/src/kloel/email-workspace-delivery.ts',
];

// `webhooks.service.ts` declares it locally as `UnknownRecord | null`
// but with a DIFFERENT body (no Array.isArray guard). Leave it.

const BODY_RE = /(?:\/\*\*[\s\S]*?\*\/\s*)?function asRecord\(value: unknown\): Record<string, unknown> \| null \{\s*return value && typeof value === 'object' && !Array\.isArray\(value\)\s*\?\s*\(value as Record<string, unknown>\)\s*:\s*null;\s*\}/m;

let migrated = 0;
let skipped = 0;

for (const relPath of TARGETS) {
  const abs = join(ROOT, relPath);
  const src = readFileSync(abs, 'utf8');
  if (!BODY_RE.test(src)) {
    console.log(`SKIP ${relPath} — body mismatch`);
    skipped++;
    continue;
  }
  const importPath = relative(dirname(abs), join(ROOT, 'backend/src/common/types'))
    .replace(/\\/g, '/');
  // remove the function declaration
  let next = src.replace(BODY_RE, '');
  // collapse blank lines that might result
  next = next.replace(/\n{3,}/g, '\n\n');
  // ensure import exists; insert near other imports
  const hasImport = new RegExp(
    `from\\s+['"\`]${importPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}['"\`]`,
  ).test(next);
  const hasUnknownRecord = /UnknownRecord/.test(next);
  if (!hasImport) {
    // figure out the last import line
    const importMatches = [...next.matchAll(/^import\s.+?from\s+['"`][^'"`]+['"`];\s*$/gm)];
    if (importMatches.length === 0) {
      console.log(`SKIP ${relPath} — no existing imports to anchor`);
      skipped++;
      continue;
    }
    const last = importMatches[importMatches.length - 1];
    const insertAt = last.index + last[0].length;
    const importToken = hasUnknownRecord ? 'asRecord' : 'asRecord, UnknownRecord';
    const importLine = `\nimport { ${importToken} } from '${importPath}';`;
    next = next.slice(0, insertAt) + importLine + next.slice(insertAt);
  }
  writeFileSync(abs, next);
  migrated++;
  console.log(`OK   ${relPath}`);
}

console.log(`\nmigrated: ${migrated}`);
console.log(`skipped:  ${skipped}`);
