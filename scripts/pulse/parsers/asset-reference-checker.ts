import * as path from 'path';
import ts from 'typescript';
import { safeJoin } from '../safe-path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readDir, readTextFile } from '../safe-fs';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|node_modules|\.next[/\\]/i.test(filePath);
}

interface StaticSourceReference {
  value: string;
  line: number;
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function fontBreakType(): Break['type'] {
  return eventType('font', 'not', 'loaded');
}

function assetBreakType(): Break['type'] {
  return eventType('missing', 'asset');
}

function discoverPublicEntries(publicDir: string): Set<string> {
  const entries = new Set<string>();
  if (!pathExists(publicDir)) {
    return entries;
  }
  try {
    for (const entry of readDir(publicDir, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isFile()) {
        entries.add(entry.name);
      }
    }
  } catch {
    return entries;
  }
  return entries;
}

function literalSourceValue(initializer: ts.JsxAttribute['initializer']): string | null {
  if (!initializer) {
    return null;
  }
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return null;
  }
  if (
    ts.isStringLiteral(initializer.expression) ||
    ts.isNoSubstitutionTemplateLiteral(initializer.expression)
  ) {
    return initializer.expression.text;
  }
  return null;
}

function collectStaticSourceReferences(file: string, content: string): StaticSourceReference[] {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const references: StaticSourceReference[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'src') {
      const value = literalSourceValue(node.initializer);
      if (value) {
        references.push({
          value,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

function stripRequestSuffix(value: string): string {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const indexes = [queryIndex, hashIndex].filter((index) => index >= 0);
  const endIndex = indexes.length > 0 ? Math.min(...indexes) : value.length;
  return value.slice(0, endIndex);
}

function publicEntryName(sourcePath: string): string | null {
  if (!sourcePath.startsWith('/') || sourcePath.startsWith('//')) {
    return null;
  }
  const trimmed = stripRequestSuffix(sourcePath).slice(1);
  if (!trimmed) {
    return null;
  }
  const separatorIndex = trimmed.indexOf('/');
  return separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
}

function hasFileLikeName(sourcePath: string): boolean {
  const cleanPath = stripRequestSuffix(sourcePath);
  const name = path.posix.basename(cleanPath);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < name.length - 1;
}

function isPublicAssetReference(sourcePath: string, publicEntries: Set<string>): boolean {
  const entryName = publicEntryName(sourcePath);
  if (!entryName) {
    return false;
  }
  return publicEntries.has(entryName) || hasFileLikeName(sourcePath);
}

/** Check asset references. */
export function checkAssetReferences(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const publicDir = safeJoin(config.frontendDir, 'public');
  const publicEntries = discoverPublicEntries(publicDir);

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
        const content = readTextFile(lf, 'utf8');
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
        rootContent = readTextFile(rootLayout, 'utf8');
      } catch {
        // ignore
      }

      const hasGoogleFontLink = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(rootContent);
      const hasFontCssImport = /import.*\.css['"`]/.test(rootContent);

      if (!hasGoogleFontLink && !hasFontCssImport) {
        pushBreak(breaks, {
          type: fontBreakType(),
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
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const references = collectStaticSourceReferences(file, content).filter((reference) =>
      isPublicAssetReference(reference.value, publicEntries),
    );

    for (const reference of references) {
      const assetPath = stripRequestSuffix(reference.value);
      if (missingAssets.has(assetPath)) {
        continue;
      }

      const fullPath = safeJoin(publicDir, assetPath);
      if (!pathExists(fullPath)) {
        missingAssets.set(assetPath, { file: relFile, line: reference.line });
        pushBreak(breaks, {
          type: assetBreakType(),
          severity: 'medium',
          file: relFile,
          line: reference.line,
          description: `Static asset '${assetPath}' referenced but not found in public/`,
          detail: `Expected file at: ${fullPath}. Add the asset or update the reference.`,
        });
      }
    }
  }

  return breaks;
}
