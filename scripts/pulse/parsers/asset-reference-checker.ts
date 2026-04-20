import { safeJoin, safeResolve } from '../safe-path';
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|node_modules|\.next[/\\]/i.test(filePath);
}

// Matches src="/images/...", src="/icons/...", src="/assets/..."
const STATIC_SRC_RE = /\bsrc\s*=\s*['"`](\/(?:images|icons|assets)\/[^'"`\s]+)['"`]/g;

// Also catch next/image or img with template literal paths that are static
const STATIC_SRC_CURLY_RE = /\bsrc=\{['"`](\/(?:images|icons|assets)\/[^'"`\s]+)['"`]\}/g;

/** Check asset references. */
export function checkAssetReferences(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const publicDir = safeJoin(config.frontendDir, 'public');

  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter(
    (f) => !shouldSkipFile(f),
  );

  // ---- Track which files we checked for font loading ----
  let checkedFontLoading = false;
  const layoutFiles = frontendFiles.filter(
    (f) => path.basename(f) === 'layout.tsx' || path.basename(f) === 'layout.ts',
  );

  // Check font loading: Sora and JetBrains Mono should be loaded via next/font
  if (!checkedFontLoading && layoutFiles.length > 0) {
    checkedFontLoading = true;

    // Look for any layout that imports from next/font
    const anyLayoutHasNextFont = layoutFiles.some((lf) => {
      try {
        const content = fs.readFileSync(lf, 'utf8');
        return /from\s+['"`]next\/font/.test(content);
      } catch {
        return false;
      }
    });

    if (!anyLayoutHasNextFont) {
      // Check if fonts are at least loaded via CSS import or <link>
      const rootLayout =
        layoutFiles.find((f) => f.includes(safeJoin('app', 'layout'))) || layoutFiles[0];

      let rootContent = '';
      try {
        rootContent = fs.readFileSync(rootLayout, 'utf8');
      } catch {
        // ignore
      }

      const hasGoogleFontLink = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(rootContent);
      const hasFontCssImport = /import.*\.css['"`]/.test(rootContent);

      if (!hasGoogleFontLink && !hasFontCssImport) {
        breaks.push({
          type: 'FONT_NOT_LOADED',
          severity: 'medium',
          file: path.relative(config.rootDir, rootLayout),
          line: 1,
          description:
            "Fonts 'Sora' and 'JetBrains Mono' are not loaded via next/font in any layout.tsx",
          detail:
            'Import fonts using next/font/google in the root layout.tsx to ensure proper font loading and performance.',
        });
      }
    }
  }

  // ---- Check static asset references ----
  const missingAssets = new Map<string, { file: string; line: number }>();

  for (const file of frontendFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Quick pre-check: skip files without static asset references
    if (
      !/src\s*=\s*['"`]\/(?:images|icons|assets)\//.test(content) &&
      !/src=\{['"`]\/(?:images|icons|assets)\//.test(content)
    ) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check string attribute: src="/images/..."
      STATIC_SRC_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STATIC_SRC_RE.exec(line)) !== null) {
        const assetPath = m[1]; // e.g. /images/logo.png
        const key = assetPath;

        if (!missingAssets.has(key)) {
          const fullPath = safeJoin(publicDir, assetPath);
          if (!fs.existsSync(fullPath)) {
            missingAssets.set(key, { file: relFile, line: i + 1 });
            breaks.push({
              type: 'MISSING_ASSET',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: `Static asset '${assetPath}' referenced but not found in public/`,
              detail: `Expected file at: ${fullPath}. Add the asset or update the reference.`,
            });
          }
        }
      }

      // Check JSX curly: src={"..."}
      STATIC_SRC_CURLY_RE.lastIndex = 0;
      while ((m = STATIC_SRC_CURLY_RE.exec(line)) !== null) {
        const assetPath = m[1];
        const key = assetPath;

        if (!missingAssets.has(key)) {
          const fullPath = safeJoin(publicDir, assetPath);
          if (!fs.existsSync(fullPath)) {
            missingAssets.set(key, { file: relFile, line: i + 1 });
            breaks.push({
              type: 'MISSING_ASSET',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: `Static asset '${assetPath}' referenced but not found in public/`,
              detail: `Expected file at: ${fullPath}. Add the asset or update the reference.`,
            });
          }
        }
      }
    }
  }

  return breaks;
}
