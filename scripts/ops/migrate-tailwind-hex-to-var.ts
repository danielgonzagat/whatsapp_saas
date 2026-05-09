/**
 * Batch replacement of Tailwind arbitrary hex values with CSS variable references.
 * Run: npx tsx scripts/ops/migrate-tailwind-hex-to-var.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'frontend', 'src');

// ── Mapping: lowercase hex → CSS variable name ──
const MAP: Record<string, string> = {
  '0a0a0c': '--bg-void',
  '111113': '--bg-surface',
  '19191c': '--bg-elevated',
  '222226': '--bg-border',
  '333338': '--border-glow',
  'e0ddd8': '--text-silver',
  '6e6e73': '--text-muted',
  '3a3a3f': '--text-dim',
  'e85d30': '--ember-primary',
  '10b981': '--semantic-success',
  'ef4444': '--semantic-error',
  'f59e0b': '--semantic-warning',
  '3b82f6': '--semantic-info',
  '8b5cf6': '--semantic-purple',
  '1c1c1f': '--canvas-border',
  '161618': '--canvas-surface',
  '151517': '--canvas-surface-alt',
  '0d0d0f': '--canvas-void',
  '2a2a2e': '--canvas-hover',
  'f2784b': '--canvas-accent',
  'ec4899': '--canvas-pink',
  '06b6d4': '--canvas-cyan',
  '2dd4a0': '--canvas-lime',
  'e8e6e1': '--checkout-text-primary',
  '141416': '--checkout-bg',
  'd4af37': '--checkout-accent',
  '1a1a1e': '--checkout-surface',
  '22c55e': '--checkout-success',
  '0f1f0f': '--checkout-success-bg',
  'ff6b6b': '--checkout-danger',
  '2a1a1a': '--checkout-danger-bg',
  '662222': '--checkout-danger-border',
  '8a8a8e': '--checkout-text-muted',
  '1877f2': '--brand-meta',
  '4285f4': '--brand-google',
  '25d366': '--brand-whatsapp',
  'e1306c': '--brand-instagram',
  'fe2c55': '--brand-tiktok',
  '1da1f2': '--brand-twitter',
  '0a66c2': '--brand-linkedin',
  'ff0000': '--brand-youtube',
  'e60023': '--brand-pinterest',
  'ff0050': '--brand-tiktok-alt',
  '833ab4': '--brand-instagram-purple',
  'f77737': '--brand-instagram-orange',
  '25f4ee': '--brand-tiktok-teal',
  '010101': '--brand-tiktok-black',
  '4599ff': '--brand-facebook-light',
  '166fe5': '--brand-facebook-dark',
  'cc0000': '--brand-youtube-dark',
  '0077b5': '--brand-linkedin-dark',
  '004182': '--brand-linkedin-darker',
  '14171a': '--brand-twitter-dark',
  '0d8bd9': '--brand-twitter-blue-dark',
  'bd081c': '--brand-pinterest-dark',
  '128c7e': '--brand-whatsapp-dark',
  'ea4335': '--brand-google-red',
  'fbbc04': '--brand-google-yellow',
  '34a853': '--brand-google-green',
  '34c759': '--brand-apple-green',
  'ff6b6b': '--checkout-danger',
  'e05252': '--semantic-error-soft',
  'f7a8a8': '--semantic-error-text',
  'f2b29d': '--semantic-ember-text',
  '93c5fd': '--semantic-info-text',
  '7fe2bc': '--semantic-success-text',
  'a78bfa': '--semantic-purple-text',
  '34d399': '--semantic-success-light',
  '60a5fa': '--semantic-info-light',
  'fbbf24': '--semantic-warning-light',
  'f472b6': '--semantic-pink-light',
  '818cf8': '--semantic-indigo-light',
  '22d3ee': '--canvas-cyan-light',
  '6d28d9': '--canvas-purple-dark',
  '7c3aed': '--canvas-purple-darker',
  '065f46': '--canvas-success-dark',
  '4c1d95': '--canvas-purple-deep',
  '164e63': '--canvas-cyan-dark',
  '831843': '--canvas-pink-dark',
  '78350f': '--canvas-warning-dark',
  '1e3a5f': '--canvas-info-dark',
  '0891b2': '--canvas-cyan-darker',
  '8b0000': '--canvas-danger-dark',
  'f5f5f7': '--text-light-alt',
  'f0f0f0': '--text-soft-white',
  '1a1a1a': '--text-dark-heading',
  '4b4b50': '--icon-disabled',
};

// Walk all .tsx/.ts files in frontend/src
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

  // Replace Tailwind arbitrary hex values: [#HEX] or [#HEX]/NUM
  // Pattern: [...#hex...] optionally followed by /digits
  content = content.replace(
    /\[(#[0-9A-Fa-f]{3,8})(\/\d+)?\]/g,
    (fullMatch: string, hex: string, opacity: string) => {
      const key = hex.slice(1).toLowerCase();
      const varName = MAP[key];
      if (varName) {
        fileChanges++;
        return `[var(${varName})${opacity || ''}]`;
      }
      return fullMatch;
    },
  );

  if (fileChanges > 0) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`  ${path.relative(ROOT, file)}: ${fileChanges}`);
    totalChanges += fileChanges;
    filesChanged++;
  }
}

console.log(`\nTailwind replacements: ${totalChanges} across ${filesChanged} files`);
