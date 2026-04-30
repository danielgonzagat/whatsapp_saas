import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverDesignTokens,
  findDiscoveredDesignColorEvidence,
  isDiscoveredDesignColor,
} from '../design-token-discovery';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('design-token-discovery', () => {
  it('allows a fixture token color only because a token fixture declares it', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-design-token-'));
    try {
      const fixtureColor = '#12Ab34';
      writeFixture(
        rootDir,
        'design-tokens/brand.json',
        JSON.stringify({ color: { proofFixture: fixtureColor } }, null, 2),
      );
      writeFixture(
        rootDir,
        'src/app/product-card.tsx',
        'export const productOnlyColor = "#654321";\n',
      );

      const discovery = discoverDesignTokens(rootDir);

      expect(isDiscoveredDesignColor(fixtureColor, discovery)).toBe(true);
      expect(isDiscoveredDesignColor('#654321', discovery)).toBe(false);
      expect(discovery.allowedColors).toEqual(['#12ab34']);
      expect(findDiscoveredDesignColorEvidence('#12ab34', discovery)).toEqual([
        expect.objectContaining({
          normalizedValue: '#12ab34',
          sourcePath: 'design-tokens/brand.json',
          sourceKind: 'token-file',
        }),
      ]);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('discovers colors from CSS variables, Tailwind config, theme files, and primitive styles', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-design-sources-'));
    try {
      writeFixture(
        rootDir,
        'src/styles/globals.css',
        ':root { --surface-proof: #001122; --shadow-proof: 0 0 0 1px rgba(1, 2, 3, 0.4); }\n.card { color: #999999; }\n',
      );
      writeFixture(
        rootDir,
        'tailwind.config.ts',
        'export default { theme: { extend: { colors: { proof: "#334455" } } } };\n',
      );
      writeFixture(
        rootDir,
        'themes/admin-theme.ts',
        'export const theme = { colors: { accent: "hsl(210 50% 40%)" } };\n',
      );
      writeFixture(
        rootDir,
        'components/ui/button.tsx',
        'export const primitiveButtonStyle = { borderColor: "#abcdef" };\n',
      );

      const discovery = discoverDesignTokens(rootDir);

      expect(discovery.allowedColors).toEqual([
        '#001122',
        '#334455',
        '#abcdef',
        'hsl(210 50% 40%)',
        'rgba(1, 2, 3, 0.4)',
      ]);
      expect(discovery.scannedFiles).toEqual([
        'components/ui/button.tsx',
        'src/styles/globals.css',
        'tailwind.config.ts',
        'themes/admin-theme.ts',
      ]);
      expect(isDiscoveredDesignColor('#999999', discovery)).toBe(false);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
