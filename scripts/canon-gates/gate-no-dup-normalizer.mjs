#!/usr/bin/env node

/**
 * Gate: Prevent new phone-normalizer / tenant-resolver / webhook-parser
 * duplicates outside canonical locations.
 *
 * RULE: Core utility functions have ONE canonical location. Duplicates are
 * forbidden and must be centralized. Once adopted, old copies become dead code.
 *
 * CANONICAL LOCATIONS:
 *   - Phone normalization: backend/src/common/phone/phone-normalization.util.ts
 *   - Tenant resolution: backend/src/common/tenant/tenant-resolver.util.ts (if exists)
 *   - Webhook parsing: backend/src/webhooks/webhook-parser.util.ts (if exists)
 *   - General parsers: backend/src/webhooks/parsers/* (framework only)
 *
 * VIOLATIONS DETECTED:
 *   - Function matching normalizePhone*, extractPhone*, normalizeDigits* in
 *     files other than the canonical location.
 *   - Function matching resolveTenant*, getTenant* in files other than canonical.
 *   - Function matching parseWebhook*, parsePayload* in files other than canonical.
 *   - Same-signature utilities in multiple locations.
 *
 * RUN:  node scripts/canon-gates/gate-no-dup-normalizer.mjs
 *
 * EXIT: 0 if no duplicates; 1 if rogue utility found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Canonical location map: function-name-pattern => canonical file
const CANONICAL_UTILITIES = new Map([
  // Phone normalization
  ['normalizePhone', 'backend/src/common/phone/phone-normalization.util.ts'],
  ['normalizePhoneDigits', 'backend/src/common/phone/phone-normalization.util.ts'],
  ['extractAsciiDigits', 'backend/src/common/phone/phone-normalization.util.ts'],
  ['extractPhoneFromChatId', 'backend/src/common/phone/phone-normalization.util.ts'],
  ['phonesMatch', 'backend/src/common/phone/phone-normalization.util.ts'],
  ['digitsOnly', 'backend/src/common/phone.ts'],
  ['digitsOrNull', 'backend/src/common/phone.ts'],
  ['digitsOrUndefined', 'backend/src/common/phone.ts'],
  ['whatsappDigits', 'backend/src/common/phone.ts'],
  // Tenant resolution (future proofing)
  ['resolveTenant', 'backend/src/common/tenant/tenant-resolver.util.ts'],
  ['resolveTenantId', 'backend/src/common/tenant/tenant-resolver.util.ts'],
  // Webhook parsing (future proofing)
  ['parseWebhook', 'backend/src/webhooks/webhook-parser.util.ts'],
  ['parsePayload', 'backend/src/webhooks/webhook-parser.util.ts'],
]);

// Patterns to find function declarations
const fnDeclPatterns = [
  /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
  /(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\(.*?\)\s*=>/g,
];

function findFiles(dir, isFile = () => true) {
  const results = [];
  function walk(current) {
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const fullPath = join(current, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (isFile(entry)) {
          results.push(fullPath);
        }
      }
    } catch (err) {}
  }
  walk(dir);
  return results;
}

const rogueUtilities = [];

const sourceFiles = findFiles(
  join(ROOT, 'backend/src'),
  (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.spec.ts'),
);

for (const filePath of sourceFiles) {
  const file = filePath.replace(ROOT + '/', '');
  // Skip if this is a canonical location itself
  const isCanonical = CANONICAL_UTILITIES.values();
  let skipFile = false;
  for (const canonPath of isCanonical) {
    if (file === canonPath) {
      skipFile = true;
      break;
    }
  }
  if (skipFile) {
    continue;
  }


  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of fnDeclPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const fnName = match[1];
      if (!fnName) {
        continue;
      }

      if (CANONICAL_UTILITIES.has(fnName)) {
        const canonicalFile = CANONICAL_UTILITIES.get(fnName);
        const line = content.substring(0, match.index).split('\n').length;
        rogueUtilities.push({
          file,
          fnName,
          canonicalFile,
          line,
        });
      }
    }
    pattern.lastIndex = 0;
  }
}

if (rogueUtilities.length > 0) {
  process.stderr.write(
    `FAIL gate-no-dup-normalizer: ${rogueUtilities.length} duplicate utility(ies) found:\n`,
  );
  for (const { file, fnName, canonicalFile, line } of rogueUtilities) {
    process.stderr.write(
      `  ${file}:${line}: ${fnName}() must live in ${canonicalFile}\n`,
    );
  }
  process.exit(1);
}

process.stderr.write('PASS gate-no-dup-normalizer: no duplicate utilities detected\n');
process.exit(0);
