/**
 * Batch replacement of hex literals in inline styles and JS contexts with token references.
 * Run: npx tsx scripts/ops/migrate-js-hex-to-tokens.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'frontend', 'src');

// ── Mapping: lowercase hex → token reference ──
const MAP: Record<string, string> = {
  // KLOEL Monitor brand
  '0a0a0c': 'colors.background.void',
  '111113': 'colors.background.surface',
  '19191c': 'colors.background.elevated',
  '222226': 'colors.background.border',
  '333338': 'colors.border.glow',
  'e0ddd8': 'colors.text.silver',
  '6e6e73': 'colors.text.muted',
  '3a3a3f': 'colors.text.dim',
  'e85d30': 'colors.ember.primary',
  // semantic
  '10b981': 'colors.semantic.success',
  '22c55e': 'colors.checkout.success',
  'ef4444': 'colors.semantic.error',
  'f59e0b': 'colors.semantic.warning',
  '3b82f6': 'colors.semantic.info',
  '8b5cf6': 'colors.semantic.purple',
  // canvas
  '1c1c1f': 'colors.canvas.border',
  '161618': 'colors.canvas.surface',
  '151517': 'colors.canvas.surfaceAlt',
  '0d0d0f': 'colors.canvas.void',
  '2a2a2e': 'colors.canvas.hover',
  'f2784b': 'colors.canvas.accent',
  'ec4899': 'colors.canvas.pink',
  '06b6d4': 'colors.canvas.cyan',
  '2dd4a0': 'colors.canvas.lime',
  // checkout
  'e8e6e1': 'colors.checkout.textPrimary',
  '141416': 'colors.checkout.bg',
  'd4af37': 'colors.checkout.accent',
  '1a1a1e': 'colors.checkout.surface',
  // semantic text
  'e05252': 'colors.semantic.errorSoft',
  'f7a8a8': 'colors.semantic.errorText',
  '7fe2bc': 'colors.semantic.successText',
  '93c5fd': 'colors.semantic.infoText',
  'a78bfa': 'colors.semantic.purpleText',
  // plain white/black
  'ffffff': 'colors.text.silver',
  'fff': 'colors.text.silver',
  // legacy aliases -> map to closest equivalent
  '8a8a8e': 'colors.text.muted',
  '8a8a91': 'colors.text.muted',
  '1a1a1a': 'colors.background.void',
  'f5f5f7': 'colors.text.silver',
  '4b4b50': 'colors.text.dim',
  'e2e8f0': 'colors.background.surface',
  '94a3b8': 'colors.text.muted',
  'd1d5db': 'colors.background.surface',
  '6b7280': 'colors.text.muted',
  '9ca3af': 'colors.text.muted',
  'f0f0f0': 'colors.text.silver',
  '888': 'colors.text.muted',
  '000000': 'colors.background.void',
  '000': 'colors.background.void',
  'f5f5f5': 'colors.background.void',
  'f6f6f6': 'colors.background.void',
  '666': 'colors.text.muted',
  '999': 'colors.text.muted',
  'd14e25': 'colors.ember.primary',
  'e5e7eb': 'colors.background.surface',
  'f0f0f0': 'colors.text.silver',
  '18181b': 'colors.background.surface',
  '121212': 'colors.background.void',
  '111111': 'colors.background.surface',
};

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('__tests__')) {
      files.push(...walk(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

let totalChanges = 0;
let filesChanged = 0;

const files = walk(SRC).filter(f =>
  !f.includes('design-tokens') &&
  !f.includes('external-brand-tokens') &&
  !f.includes('kloel-colors')
);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let fileChanges = 0;

  // Replace hex strings in style objects, variable assignments, etc.
  // Pattern: '#HEX' or '#HEX' inside style objects, fill="", stroke="", etc.
  content = content.replace(
    /('|")(#[0-9A-Fa-f]{3,8})('|")/g,
    (fullMatch: string, open: string, hex: string, close: string) => {
      // Skip if already inside var(...)
      const idx = fullMatch.length;
      const key = hex.slice(1).toLowerCase();
      const tokenRef = MAP[key];
      if (tokenRef && open === close) {
        fileChanges++;
        return tokenRef;
      }
      return fullMatch;
    },
  );

  if (fileChanges > 0) {
    // Check if file already imports colors
    const alreadyImports = /import\s+\{[^}]*\bcolors\b[^}]*\}\s+from\s+['"]@\/lib\/design-tokens['"]/.test(content);
    
    // Only add import if we made changes that reference colors
    const usesColors = /colors\./.test(content);
    
    if (usesColors && !alreadyImports) {
      // Find last import line
      const importMatch = content.match(/^(import\s+.+;\s*)$/gm);
      if (importMatch && importMatch.length > 0) {
        const lastImport = importMatch[importMatch.length - 1];
        content = content.replace(
          lastImport,
          lastImport + '\n' + "import { colors } from '@/lib/design-tokens';",
        );
      } else if (content.startsWith("'use client'")) {
        content = content.replace(
          "'use client';\n",
          "'use client';\n\nimport { colors } from '@/lib/design-tokens';\n",
        );
      } else if (content.startsWith("'use server'")) {
        content = content.replace(
          "'use server';\n",
          "'use server';\n\nimport { colors } from '@/lib/design-tokens';\n",
        );
      }
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ${path.relative(ROOT, file)}: ${fileChanges}`);
    totalChanges += fileChanges;
    filesChanged++;
  }
}

console.log(`\nJS hex replacements: ${totalChanges} across ${filesChanged} files`);
