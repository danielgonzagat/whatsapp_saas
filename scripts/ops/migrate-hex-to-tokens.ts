/**
 * Batch replacement of quoted hex literals with token references.
 * Run: npx tsx scripts/ops/migrate-hex-to-tokens.ts
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'frontend', 'src');

const MAP: Array<[RegExp, string]> = [
  // brand / monitor
  [/'#E85D30'/g, 'colors.ember.primary'],
  [/'#0A0A0C'/g, 'colors.background.void'],
  [/'#E0DDD8'/g, 'colors.text.silver'],
  [/'#6E6E73'/g, 'colors.text.muted'],
  [/'#3A3A3F'/g, 'colors.text.dim'],
  [/'#111113'/g, 'colors.background.surface'],
  [/'#19191C'/g, 'colors.background.elevated'],
  [/'#222226'/g, 'colors.background.border'],
  [/'#333338'/g, 'colors.border.glow'],
  // semantic
  [/'#10B981'/g, 'colors.semantic.success'],
  [/'#EF4444'/g, 'colors.semantic.error'],
  [/'#F59E0B'/g, 'colors.semantic.warning'],
  [/'#3B82F6'/g, 'colors.semantic.info'],
  [/'#8B5CF6'/g, 'colors.semantic.purple'],
  // canvas
  [/'#1C1C1F'/g, 'colors.canvas.border'],
  [/'#161618'/g, 'colors.canvas.surface'],
  [/'#151517'/g, 'colors.canvas.surfaceAlt'],
  [/'#0D0D0F'/g, 'colors.canvas.void'],
  [/'#2A2A2E'/g, 'colors.canvas.hover'],
  [/'#F2784B'/g, 'colors.canvas.accent'],
  [/'#EC4899'/g, 'colors.canvas.pink'],
  [/'#06B6D4'/g, 'colors.canvas.cyan'],
  [/'#2DD4A0'/g, 'colors.canvas.lime'],
  // checkout
  [/'#E8E6E1'/g, 'colors.checkout.textPrimary'],
  [/'#141416'/g, 'colors.checkout.bg'],
  [/'#D4AF37'/g, 'colors.checkout.accent'],
  [/'#1A1A1E'/g, 'colors.checkout.surface'],
  [/'#22c55e'/g, 'colors.checkout.success'],
  [/'#22C55E'/g, 'colors.checkout.success'],
  [/'#8A8A8E'/g, 'colors.text.muted'],
  [/'#8A8A91'/g, 'colors.text.muted'],
  [/'#FF6B6B'/g, 'colors.checkout.danger'],
  [/'#ff6b6b'/g, 'colors.checkout.danger'],
  [/'#0F1F0F'/g, 'colors.checkout.successBg'],
  [/'#2A1A1A'/g, 'colors.checkout.dangerBg'],
  [/'#662222'/g, 'colors.checkout.dangerBorder'],
  // text variants
  [/'#FFFFFF'/g, 'colors.text.silver'],
  [/'#ffffff'/g, 'colors.text.silver'],
  [/'#fff'/g, 'colors.text.silver'],
  [/'#FFF'/g, 'colors.text.silver'],
  [/'#4B4B50'/g, 'colors.text.dim'],
  [/'#8A8A91'/g, 'colors.text.muted'],
  [/'#F5F5F7'/g, 'colors.text.silver'],
  [/'#f0f0f0'/g, 'colors.text.silver'],
  // plain black/white
  [/'#1A1A1A'/g, 'colors.background.void'],
  [/'#1a1a1a'/g, 'colors.background.void'],
  [/'#000000'/g, 'colors.background.void'],
  [/'#000'/g, 'colors.background.void'],
  // misc
  [/'#25D366'/g, 'colors.canvas.lime'],
  [/'#D14E25'/g, 'colors.ember.primary'],
  [/'#4ADE80'/g, 'colors.semantic.successText'],
  [/'#E5E7EB'/g, 'colors.background.surface'],
  [/'#D1D5DB'/g, 'colors.background.surface'],
  [/'#9CA3AF'/g, 'colors.text.muted'],
  [/'#6b7280'/g, 'colors.text.muted'],
  [/'#94a3b8'/g, 'colors.text.muted'],
  [/'#e2e8f0'/g, 'colors.background.surface'],
  [/'#f5f5f5'/g, 'colors.background.void'],
  [/'#f6f6f6'/g, 'colors.background.void'],
  [/'#666'/g, 'colors.text.muted'],
  [/'#999'/g, 'colors.text.muted'],
  [/'#888'/g, 'colors.text.muted'],
  [/'#e0e0e0'/g, 'colors.text.silver'],
  // tags / capabilities
  [/'#4E7AE0'/g, 'colors.semantic.info'],
  [/'#C9A84C'/g, 'colors.semantic.warning'],
  [/'#7B5EA7'/g, 'colors.semantic.purple'],
  // external brands → use semantic equivalents for now
  [/'#1877F2'/g, 'colors.semantic.info'],
  [/'#4285F4'/g, 'colors.semantic.info'],
  [/'#FF0050'/g, 'colors.semantic.error'],
  [/'#ff0050'/g, 'colors.semantic.error'],
  [/'#FE2C55'/g, 'colors.semantic.error'],
  [/'#E1306C'/g, 'colors.canvas.pink'],
  [/'#833AB4'/g, 'colors.semantic.purple'],
  [/'#F77737'/g, 'colors.ember.primary'],
  [/'#1DA1F2'/g, 'colors.semantic.info'],
  [/'#0A66C2'/g, 'colors.semantic.info'],
  [/'#0077B5'/g, 'colors.semantic.info'],
  [/'#004182'/g, 'colors.semantic.info'],
  [/'#4599FF'/g, 'colors.semantic.info'],
  [/'#166FE5'/g, 'colors.semantic.info'],
  [/'#14171A'/g, 'colors.background.void'],
  [/'#0D8BD9'/g, 'colors.semantic.info'],
  [/'#FF0000'/g, 'colors.semantic.error'],
  [/'#ff0000'/g, 'colors.semantic.error'],
  [/'#CC0000'/g, 'colors.semantic.error'],
  [/'#E60023'/g, 'colors.semantic.error'],
  [/'#BD081C'/g, 'colors.semantic.error'],
  [/'#25F4EE'/g, 'colors.canvas.cyan'],
  [/'#010101'/g, 'colors.background.void'],
  [/'#128C7E'/g, 'colors.semantic.success'],
  [/'#EA4335'/g, 'colors.semantic.error'],
  [/'#FBBC04'/g, 'colors.semantic.warning'],
  [/'#34A853'/g, 'colors.semantic.success'],
  [/'#34C759'/g, 'colors.semantic.success'],
  [/'#E05252'/g, 'colors.semantic.errorSoft'],
  [/'#F7A8A8'/g, 'colors.semantic.errorText'],
  [/'#F2B29D'/g, 'colors.text.silver'],
  [/'#93C5FD'/g, 'colors.semantic.infoText'],
  [/'#7FE2BC'/g, 'colors.semantic.successText'],
  [/'#A78BFA'/g, 'colors.semantic.purpleText'],
  [/'#34D399'/g, 'colors.semantic.successText'],
  [/'#60A5FA'/g, 'colors.semantic.infoText'],
  [/'#FBBF24'/g, 'colors.semantic.warning'],
  [/'#F472B6'/g, 'colors.canvas.pink'],
  [/'#818CF8'/g, 'colors.semantic.infoText'],
  [/'#22D3EE'/g, 'colors.canvas.cyan'],
  [/'#6D28D9'/g, 'colors.semantic.purple'],
  [/'#7C3AED'/g, 'colors.semantic.purple'],
  [/'#065F46'/g, 'colors.checkout.successBg'],
  [/'#4C1D95'/g, 'colors.semantic.purple'],
  [/'#164E63'/g, 'colors.checkout.dangerBg'],
  [/'#831843'/g, 'colors.canvas.pink'],
  [/'#78350F'/g, 'colors.semantic.warning'],
  [/'#1E3A5F'/g, 'colors.semantic.info'],
  [/'#0891B2'/g, 'colors.canvas.cyan'],
  [/'#8B0000'/g, 'colors.semantic.error'],
  [/'#64748b'/g, 'colors.text.muted'],
  [/'#334155'/g, 'colors.text.muted'],
  [/'#fef9e7'/g, 'colors.background.surface'],
  [/'#FEDA75'/g, 'colors.semantic.warning'],
  [/'#FBBC04'/g, 'colors.semantic.warning'],
  [/'#FAFAFA'/g, 'colors.background.void'],
  [/'#FA7E1E'/g, 'colors.ember.primary'],
  [/'#F6F7F9'/g, 'colors.background.void'],
  [/'#D62976'/g, 'colors.canvas.pink'],
  [/'#d1d5db'/g, 'colors.background.surface'],
  [/'#ADA5A5'/g, 'colors.text.muted'],
  [/'#962FBF'/g, 'colors.semantic.purple'],
  [/'#8E8E93'/g, 'colors.text.muted'],
  [/'#7F66FF'/g, 'colors.semantic.purple'],
  [/'#4F5BD5'/g, 'colors.semantic.info'],
  [/'#4CAF50'/g, 'colors.semantic.success'],
  [/'#441111'/g, 'colors.checkout.dangerBg'],
  [/'#3A3A3E'/g, 'colors.text.dim'],
  [/'#1A2E1A'/g, 'colors.checkout.successBg'],
  [/'#18181B'/g, 'colors.background.surface'],
  [/'#121212'/g, 'colors.background.void'],
  [/'#111111'/g, 'colors.background.surface'],
  [/'#111'/g, 'colors.background.surface'],
  [/'#00B2FF'/g, 'colors.semantic.info'],
  [/'#00A884'/g, 'colors.semantic.success'],
  [/'#006AFF'/g, 'colors.semantic.info'],
  [/'#777'/g, 'colors.text.muted'],
  [/'#555'/g, 'colors.text.muted'],
  [/'#444'/g, 'colors.text.dim'],
  [/'#aaa'/g, 'colors.text.muted'],
];

const EXCLUDE = [
  'design-tokens',
  'external-brand-tokens',
  'kloel-colors',
  'canvas-formats',
  'canvas-product-templates',
  '__tests__',
  '.test.',
  '.spec.',
];

function walk(dir) {
  const files = [];
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

const files = walk(SRC).filter(f => !EXCLUDE.some(e => f.includes(e)));

let totalChanges = 0;
let filesChanged = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let fileChanges = 0;

  for (const [regex, replacement] of MAP) {
    const newContent = content.replace(regex, replacement);
    const count = (content.length - newContent.length) / (replacement.length + 1); // rough
    if (newContent !== content) {
      content = newContent;
      fileChanges++;
    }
  }

  if (fileChanges > 0 && content.includes('colors.')) {
    // Add import if missing
    const hasImport = content.includes("import { colors } from '@/lib/design-tokens'");
    if (!hasImport) {
      if (content.includes("'use client'")) {
        content = content.replace(/'use client';/, "'use client';\nimport { colors } from '@/lib/design-tokens';");
      } else if (content.includes('"use client"')) {
        content = content.replace(/"use client";/, '"use client";\nimport { colors } from \'@/lib/design-tokens\';');
      } else if (content.includes("'use server'")) {
        content = content.replace(/'use server';/, "'use server';\nimport { colors } from '@/lib/design-tokens';");
      } else {
        const firstImportIdx = content.search(/^import /m);
        if (firstImportIdx >= 0) {
          content = content.slice(0, firstImportIdx) + "import { colors } from '@/lib/design-tokens';\n" + content.slice(firstImportIdx);
        }
      }
    }

    fs.writeFileSync(file, content, 'utf8');
    totalChanges += fileChanges;
    filesChanged++;
    console.log(`  ${path.relative(ROOT, file)}`);
  }
}

console.log(`\nJS hex replacements: ${totalChanges} changes across ${filesChanged} files`);
