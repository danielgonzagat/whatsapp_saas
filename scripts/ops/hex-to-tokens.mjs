#!/usr/bin/env node
// ⚠️ ONE-TIME: hex code → design tokens migration
// Run from repo root: node scripts/ops/hex-to-tokens.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ════════════════════════════════════════════════
// TOKEN MAPPING
// ════════════════════════════════════════════════
const JS_MAP = {
  '#E85D30': 'colors.ember.primary',
  '#0A0A0C': 'colors.background.void',
  '#111113': 'colors.background.surface',
  '#222226': 'colors.border.space',
  '#E0DDD8': 'colors.text.silver',
  '#6E6E73': 'colors.text.muted',
  '#3A3A3F': 'colors.text.dim',
  '#19191C': 'colors.background.elevated',
  '#333338': 'colors.border.default',
  '#262626': 'colors.background.card',
  '#141414': 'colors.background.input',
  '#1A1A1A': 'colors.background.hover',
  '#212121': 'colors.background.active',
  '#F5F5F5': 'colors.background.light',
};

// CSS variable equivalents for tailwind arbitrary values
const CSS_MAP = {
  '#E85D30': 'var(--kloel-brand-primary)',
  '#0A0A0C': 'var(--kloel-bg-base)',
  '#111113': 'var(--kloel-bg-surface1)',
  '#222226': 'var(--kloel-border-default)',
  '#E0DDD8': 'var(--kloel-text-primary)',
  '#6E6E73': 'var(--kloel-text-secondary)',
  '#3A3A3F': 'var(--kloel-text-muted)',
  '#19191C': 'var(--kloel-bg-elevated)',
  '#333338': 'var(--kloel-border-strong)',
  '#262626': 'var(--kloel-bg-card)',
  '#141414': 'var(--kloel-bg-input)',
  '#1A1A1A': 'var(--kloel-bg-hover)',
  '#212121': 'var(--kloel-bg-active)',
  '#F5F5F5': 'var(--kloel-bg-light)',
};

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

function collectFiles(dir, exts = ['.tsx', '.ts'], exclude = []) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (exclude.some((e) => full.includes(e))) continue;
      if (entry.isDirectory()) {
        results.push(...collectFiles(full, exts, exclude));
      } else if (exts.some((e) => full.endsWith(e))) {
        results.push(full);
      }
    }
  } catch (_) {
    /* skip missing dirs */
  }
  return results;
}

function needsHexFix(content) {
  return Object.keys(JS_MAP).some((hex) => content.includes(hex));
}

function addColorsImport(content) {
  if (content.includes("from '@/lib/design-tokens'")) return content;
  if (content.includes('from "@/lib/design-tokens"')) return content;
  if (content.includes("from '~/lib/design-tokens'")) return content;

  // Insert after last import line
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) {
      lastImportIdx = i;
    }
    // Stop looking once we leave import territory
    if (
      !lines[i].startsWith('import ') &&
      !lines[i].startsWith('//') &&
      !lines[i].startsWith('/*') &&
      lines[i].trim() !== '' &&
      lastImportIdx > -1
    ) {
      // Mark insertion point after empty line or at last import
      break;
    }
  }

  if (lastImportIdx === -1) {
    // No imports found, insert at top
    lines.unshift("import { colors } from '@/lib/design-tokens';");
  } else {
    // Check if we have an empty line after last import
    while (lastImportIdx + 1 < lines.length && lines[lastImportIdx + 1].trim() === '') {
      lastImportIdx++;
    }
    lines.splice(lastImportIdx + 1, 0, "import { colors } from '@/lib/design-tokens';");
  }
  return lines.join('\n');
}

function replaceInTailwindClass(match, prefix, hex) {
  // match is like 'bg-[#E85D30]' or 'text-[#E0DDD8]' or 'border-[#222226]'
  const rep = CSS_MAP[hex];
  if (rep) {
    // Special: 'border-[#E85D30]/50' patterns with opacity
    // We'll handle the full match including potential tailwind opacity
  }
  return rep ? `${prefix}-[${rep}]` : match;
}

function replaceHexInTailwind(content) {
  // Match tailwind arbitrary color utilities: utility-[#[0-9A-Fa-f]{6,8}]
  // Patterns: bg-[#HEX], text-[#HEX], border-[#HEX], ring-[#HEX], outline-[#HEX], placeholder-[#HEX]
  // Also with tailwind opacity: bg-[#HEX]/50

  const tailwindHexRe =
    /(bg|text|border|ring|outline|placeholder|shadow|from|to|via|fill|stroke|caret|accent|divide|decoration)\s*-\s*\[\s*(#[0-9A-Fa-f]{6,8})(\s*\/\s*\d+)?\s*\]/g;

  return content.replace(tailwindHexRe, (match, prefix, hex, opacity) => {
    const key = hex.toUpperCase();
    if (CSS_MAP[key]) {
      const varRef = CSS_MAP[key];
      return opacity
        ? `${prefix}-[${varRef}]/${opacity.replace(/[\/\s]/g, '')}` // var can't have opacity in tailwind, keep raw approach
        : `${prefix}-[${varRef}]`;
    }
    return match; // not mapped
  });
}

function replaceHexInStrings(content) {
  // Replace hex codes that appear in JS string literals: '#HEX' or "#HEX"
  // We must be careful not to replace inside import paths, URLs, or regex

  let result = content;

  for (const [hex, token] of Object.entries(JS_MAP)) {
    const hexLower = hex.toLowerCase();
    // Only replace quote-delimited hex strings to avoid matching inside CSS vars or other hexes
    const re1 = new RegExp(`(['"])\\s*(${hex}|${hexLower})\\s*\\1`, 'g');
    result = result.replace(re1, (match, quote) => {
      return `${quote}${token}${quote}`;
    });
  }
  return result;
}

function replaceHexInStyleObj(content) {
  // Replace hex codes inside style={{ }} objects or style: objects
  // Pattern: style: '#HEX' or color: '#HEX', background: '#HEX', etc.

  let result = content;
  const hexMap = Object.entries(JS_MAP);

  for (const [hex, token] of hexMap) {
    const hexLower = hex.toLowerCase();

    // Replace standalone hex in JSX/JS value context (not inside className strings)
    // This catches: color: '#HEX', background: '#HEX', '#HEX' as default values, etc.
    // We already handled className strings above, so we can be aggressive here

    // Pattern: : '#HEX' (with optional spaces)
    const re1 = new RegExp(`(:\\s*)(['"])\\s*(${hex}|${hexLower})\\s*\\2`, 'g');
    result = result.replace(re1, `$1${token}`);

    // Pattern: , '#HEX' (with optional spaces)
    const re2 = new RegExp(`(,\\s*)(['"])\\s*(${hex}|${hexLower})\\s*\\2`, 'g');
    result = result.replace(re2, `$1${token}`);

    // Pattern: = '#HEX' (default param)
    const re3 = new RegExp(`(=\\s*)(['"])\\s*(${hex}|${hexLower})\\s*\\2`, 'g');
    result = result.replace(re3, `$1${token}`);

    // Pattern: ?? '#HEX'
    const re4 = new RegExp(`(\\?\\?\\s*)(['"])\\s*(${hex}|${hexLower})\\s*\\2`, 'g');
    result = result.replace(re4, `$1${token}`);

    // Pattern: || '#HEX'
    const re5 = new RegExp(`(\\|\\|\\s*)(['"])\\s*(${hex}|${hexLower})\\s*\\2`, 'g');
    result = result.replace(re5, `$1${token}`);
  }
  return result;
}

function processFile(filepath) {
  try {
    let content = readFileSync(filepath, 'utf8');
    const original = content;

    if (!needsHexFix(content)) return { file: filepath, changed: false };

    // Step 1: Replace tailwind className hex values with CSS vars
    content = replaceHexInTailwind(content);

    // Step 2: Replace hex in style objects and JS values with colors.X.Y
    content = replaceHexInStyleObj(content);

    // Step 3: Replace remaining quote-delimited hex strings
    content = replaceHexInStrings(content);

    // Step 4: Add colors import if needed
    if (content !== original && content.includes('colors.')) {
      content = addColorsImport(content);
    }

    if (content !== original) {
      writeFileSync(filepath, content, 'utf8');
      const originalHexCount = (original.match(/#[0-9A-Fa-f]{6}/g) || []).length;
      const newHexCount = (content.match(/#[0-9A-Fa-f]{6}/g) || []).length;
      const replaced = originalHexCount - newHexCount;
      return {
        file: filepath,
        changed: true,
        hexBefore: originalHexCount,
        hexAfter: newHexCount,
        replaced,
      };
    }
    return { file: filepath, changed: false };
  } catch (err) {
    return { file: filepath, error: err.message };
  }
}

// ════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════

const TARGET_DIRS = [
  'frontend/src/app/(dashboard)',
  'frontend/src/components/kloel/products',
  'frontend/src/components/kloel/crm',
  'frontend/src/app/(checkout)',
  // Bonus high-impact dirs for the 25+ target
  'frontend/src/components/kloel/vendas',
  'frontend/src/components/kloel/settings',
  'frontend/src/components/kloel/auth',
  'frontend/src/components/kloel/inbox',
  'frontend/src/components/kloel/landing',
  'frontend/src/components/kloel/produtos',
  'frontend/src/components/plans',
  'frontend/src/components/products',
  'frontend/src/components/flow/nodes',
  'frontend/src/components/canvas',
  'frontend/src/app/(main)',
  'frontend/src/app/(public)',
  'frontend/src/components/kloel/anuncios',
  'frontend/src/components/kloel/conta',
  'frontend/src/components/kloel/parcerias',
  'frontend/src/components/kloel/sites',
];

const EXCLUDE = [
  'node_modules',
  '.snap',
  '.test.',
  '__tests__',
  'design-tokens',
  'kloel-design-tokens',
  'checkout-theme-tokens',
];

let files = [];
for (const dir of TARGET_DIRS) {
  const full = join(ROOT, dir);
  files.push(...collectFiles(full, ['.tsx', '.ts'], EXCLUDE));
}

// Add top-level frontend files with known usage
const extraFiles = [
  'frontend/src/app/not-found.tsx',
  'frontend/src/app/global-error.tsx',
  'frontend/src/app/layout.tsx',
  'frontend/src/app/loading.tsx',
  'frontend/src/components/kloel/StatusDot.tsx',
  'frontend/src/components/kloel/Stepper.tsx',
  'frontend/src/components/kloel/Toast.tsx',
  'frontend/src/components/kloel/Pagination.tsx',
  'frontend/src/components/kloel/ToolCard.tsx',
  'frontend/src/components/kloel/Card.tsx',
  'frontend/src/components/kloel/Metric.tsx',
  'frontend/src/components/kloel/Val.tsx',
  'frontend/src/components/kloel/ErrorBoundary.tsx',
  'frontend/src/components/kloel/carteira.tsx',
  'frontend/src/components/kloel/WhatsAppConsole.tsx',
  'frontend/src/components/kloel/AssistantResponseChrome.tsx',
  'frontend/src/components/kloel/MessageActionBar.tsx',
  'frontend/src/components/kloel/header-minimal.tsx',
  'frontend/src/components/kloel/test-kloel-modal.tsx',
  'frontend/src/components/kloel/trial-paywall-modal.tsx',
  'frontend/src/components/kloel/onboarding-modal.tsx',
  'frontend/src/hooks/useCheckoutEditor.ts',
  'frontend/src/lib/canvas-formats.ts',
  'frontend/src/lib/canvas-product-templates.ts',
  'frontend/src/lib/fabric/SnapManager.ts',
  'frontend/src/lib/fabric/ShapeManager.ts',
];

for (const f of extraFiles) {
  const full = join(ROOT, f);
  try {
    statSync(full);
    files.push(full);
  } catch (_) {}
}

// Deduplicate
files = [...new Set(files)];

console.log(`Scanning ${files.length} files...`);

let changed = 0;
let totalReplaced = 0;
const results = [];

for (const filePath of files) {
  const r = processFile(filePath);
  results.push(r);
  if (r.changed) {
    changed++;
    totalReplaced += r.replaced || 0;
    console.log(`  ✓ ${r.file.replace(ROOT + '/', '')} (${r.replaced} hex → token)`);
  }
}

console.log(`\nDone. ${changed} files changed, ~${totalReplaced} hex codes replaced.`);

// Print summary for files NOT changed but had hex codes
const skipped = results.filter((r) => !r.changed && !r.error);
if (skipped.length > 0) {
  console.log(`\nSkipped (no changes needed or errors):`);
  for (const s of skipped) {
    console.log(`  - ${s.file.replace(ROOT + '/', '')}${s.error ? ` (ERROR: ${s.error})` : ''}`);
  }
}
