/**
 * Targeted replacement: hex literals in React inline style={{ }} props.
 * Only replaces the most common, well-mapped hexes.
 * Run: npx tsx scripts/ops/migrate-style-hex-to-tokens.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'frontend', 'src');

// Mapping: hex key (lowercase without #) → token reference
// Only for hexes with clear, unambiguous semantic meaning
const HEX_TO_TOKEN: Record<string, string> = {
  // Monitor palette
  'e85d30': 'colors.ember.primary',
  '0a0a0c': 'colors.background.void',
  'e0ddd8': 'colors.text.silver',
  '6e6e73': 'colors.text.muted',
  '3a3a3f': 'colors.text.dim',
  '111113': 'colors.background.surface',
  '19191c': 'colors.background.elevated',
  '222226': 'colors.background.border',
  '333338': 'colors.border.glow',

  // semantic
  '10b981': 'colors.semantic.success',
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
  '22c55e': 'colors.checkout.success',
  '8a8a8e': 'colors.text.muted',
  '8a8a91': 'colors.text.muted',

  // plain white/black (used for text on dark bg or bg on light)
  'fff': 'colors.text.silver',
  'ffffff': 'colors.text.silver',

  // colors commonly used with inline style helpers
  '25d366': 'colors.canvas.lime',
  '1a1a1a': 'colors.background.void',
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

const EXCLUDE = [
  'design-tokens',
  'external-brand-tokens',
  'kloel-colors',
  'canvas-formats',
  'canvas-product-templates',
];

let totalChanges = 0;
let filesChanged = 0;

const files = walk(SRC).filter(f => !EXCLUDE.some(e => f.includes(e)));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let fileChanges = 0;
  
  const relative = path.relative(ROOT, file);

  // Pattern: inside style={{ ... }} (or style={...}), find quoted hex values
  // We match style={{ up to }} and replace hex quotes inside
  const styleRegex = /style=\{(?:\{[^}]+\}|[^}])*\}/gs;
  
  content = content.replace(styleRegex, (styleBlock: string) => {
    let block = styleBlock;
    const hexRegex = /(["'])(#[0-9A-Fa-f]{3,8})\1/g;
    
    block = block.replace(hexRegex, (full: string, q: string, hex: string) => {
      const key = hex.slice(1).toLowerCase();
      const tokenRef = HEX_TO_TOKEN[key];
      if (tokenRef) {
        fileChanges++;
        return tokenRef;
      }
      return full;
    });
    
    return block;
  });

  if (fileChanges > 0) {
    // Check if file already imports colors
    const alreadyImports = /import\s+\{[^}]*\bcolors\b[^}]*\}\s+from\s+['"]@\/lib\/design-tokens['"]/.test(content);
    
    if (!alreadyImports) {
      // Add import after last import line or after 'use client' directive
      if (content.includes("'use client'") || content.includes('"use client"')) {
        content = content.replace(/("use client"|'use client');?/, "$&;\nimport { colors } from '@/lib/design-tokens';");
      } else if (content.includes("'use server'") || content.includes('"use server"')) {
        content = content.replace(/("use server"|'use server');?/, "$&;\nimport { colors } from '@/lib/design-tokens';");
      } else {
        // Insert at top after any @/ imports
        const firstImport = content.match(/^import\s+/m);
        if (firstImport && firstImport.index !== undefined) {
          const before = content.slice(0, firstImport.index);
          const after = content.slice(firstImport.index);
          content = before + "import { colors } from '@/lib/design-tokens';\n" + after;
        } else {
          // No imports at all - prepend
          content = "import { colors } from '@/lib/design-tokens';\n" + content;
        }
      }
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ${relative}: ${fileChanges}`);
    totalChanges += fileChanges;
    filesChanged++;
  }
}

console.log(`\nStyle hex replacements: ${totalChanges} across ${filesChanged} files`);
