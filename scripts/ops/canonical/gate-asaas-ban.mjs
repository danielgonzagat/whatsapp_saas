#!/usr/bin/env node
// Anti-regression gate G5: Ban Asaas re-introduction in any form.
//
// Asaas was superseded by Stripe Connect per ADR 0003 + ADR 0009.
// Any identifier, import, type, or code-level reference to Asaas is banned.
// String literals (i18n messages about the migration) are exempt.
//
// Exit 0 = clean. Exit 1 = violations found.
//
// See: docs/architecture/ANTI_REGRESSION_GATES.md § G5
//      docs/architecture/DEPRECATION_MAP.md (Asaas → ⛔ banned)

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const SCAN_ROOTS = ['backend/src', 'frontend/src', 'frontend-admin/src', 'worker'];
const TS_GLOB = /\.(ts|tsx|mjs|js|jsx)$/;
const SKIP_RE = /(node_modules|dist|\.next|build|__tests__|\.spec\.|\.test\.)/;

// Files known to reference Asaas only in i18n migration-notice text — exempt
const EXEMPT_FILES = new Set([
  'frontend/src/components/kloel/settings/billing-legacy-providers-section.tsx',
]);

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

const ASAAS_RE = /\bAsaas\b/g;
const violations = [];

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file);
    if (EXEMPT_FILES.has(rel)) continue;

    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      ASAAS_RE.lastIndex = 0;
      if (ASAAS_RE.test(lines[i])) {
        // Skip if this looks like a string literal (i18n migration notice)
        const line = lines[i];
        const matchIdx = line.search(/\bAsaas\b/);
        // Check if the match is inside a string (heuristic: count quotes before)
        const before = line.slice(0, matchIdx);
        const singleQuotes = (before.match(/'/g) || []).length;
        const doubleQuotes = (before.match(/"/g) || []).length;
        const backticks = (before.match(/`/g) || []).length;
        const inString = (singleQuotes % 2 === 1) || (doubleQuotes % 2 === 1) || (backticks % 2 === 1);
        if (inString) continue;

        violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
      }
    }
  }
}

if (violations.length === 0) {
  console.log('[G5] Asaas ban gate: CLEAN — zero code-level Asaas references');
  process.exit(0);
}

console.error(`[G5] Asaas ban gate: ${violations.length} violation(s):`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} — Asaas reference detected`);
  console.error(`    → ${v.text}`);
  console.error(`    → Asaas was superseded by Stripe Connect (ADR 0003 + ADR 0009).`);
}
console.error('\nFix: Remove all Asaas code references. Use Stripe Connect for payments.');
console.error('  See: docs/architecture/DEPRECATION_MAP.md — Asaas ⛔ banned');
process.exit(1);
