#!/usr/bin/env node
/**
 * scripts/ops/codemods/hoist-top-level-regex.mjs
 *
 * Phase 2B of the Codacy convergence plan.
 * See /Users/danielpenin/.claude/plans/synthetic-whistling-meteor.md
 *
 * Hoists static RegExp literals out of function bodies into module-level
 * const declarations. Targets Biome lint/performance/useTopLevelRegex.
 *
 * Safety: skip stateful regexes (g/y flags), skip files exceeding
 * MAX_HOISTS_PER_FILE, skip non-literal patterns. Caller runs typecheck
 * + tests + ratchet:check after.
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const skipLogPath = path.join(repoRoot, 'scripts/ops/codemods/.hoist-regex-skipped.json');

const SCAN_GLOBS = [
  'backend/src/**/*.ts',
  'frontend/src/**/*.ts',
  'frontend/src/**/*.tsx',
  'worker/**/*.ts',
];

const EXCLUDE_GLOBS = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/__tests__/**',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  'frontend/test-results/**',
  'backend/test-results/**',
  'worker/test-results/**',
  'worker/dist/**',
];

// 2026-04-15: raised from 10 to 200 for the second convergence pass. The
// Phase 2B cap was calibrated to keep early AST rewrites small while the
// codemod was being validated. With ~6 months of stable runs and typecheck
// + boot smoke gates enforced on every pass, the cap can absorb the full
// skipped tail (largest current file has 67 literals).
const MAX_HOISTS_PER_FILE = 200;

function ensureTsMorphInstalled() {
  const probe = path.join(repoRoot, 'node_modules/ts-morph/package.json');
  if (!existsSync(probe)) {
    console.error('[hoist-regex] ts-morph not installed. Run: npm install --save-dev ts-morph');
    process.exit(2);
  }
}

function patternToConstName(source) {
  const cleaned = source.replace(/[^A-Za-z0-9]/g, '_').slice(0, 24);
  if (!cleaned) return 'PATTERN';
  let result = cleaned
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/^_+|_+$/g, '');
  // JS identifiers cannot start with a digit. Prefix `RX_` if so.
  if (/^[0-9]/.test(result)) {
    result = `RX_${result}`;
  }
  if (!result || result === 'RX_') return 'PATTERN';
  return result;
}

async function main() {
  ensureTsMorphInstalled();
  const { Project, SyntaxKind } = await import('ts-morph');

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });

  for (const glob of SCAN_GLOBS) {
    project.addSourceFilesAtPaths([
      path.join(repoRoot, glob),
      ...EXCLUDE_GLOBS.map((g) => `!${path.join(repoRoot, g)}`),
    ]);
  }

  const totalAdded = project.getSourceFiles().length;
  console.log(`[hoist-regex] Loaded ${totalAdded} source files.`);

  const skipped = [];
  let filesChanged = 0;
  let totalHoisted = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const relPath = path.relative(repoRoot, filePath);

    const regexLiterals = sourceFile
      .getDescendantsOfKind(SyntaxKind.RegularExpressionLiteral)
      .filter((node) => {
        const enclosing =
          node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ||
          node.getFirstAncestorByKind(SyntaxKind.MethodDeclaration) ||
          node.getFirstAncestorByKind(SyntaxKind.FunctionExpression) ||
          node.getFirstAncestorByKind(SyntaxKind.ArrowFunction) ||
          node.getFirstAncestorByKind(SyntaxKind.GetAccessor) ||
          node.getFirstAncestorByKind(SyntaxKind.SetAccessor);
        return Boolean(enclosing);
      });

    if (regexLiterals.length === 0) continue;

    if (regexLiterals.length > MAX_HOISTS_PER_FILE) {
      skipped.push({
        file: relPath,
        count: regexLiterals.length,
        reason: `exceeds MAX_HOISTS_PER_FILE=${MAX_HOISTS_PER_FILE}`,
      });
      continue;
    }

    const byText = new Map();
    for (const lit of regexLiterals) {
      const text = lit.getText();
      const flagPart = text.split('/').pop();
      if (typeof flagPart === 'string' && /[gy]/.test(flagPart)) continue;
      const sourceMatch = text.match(/^\/(.+)\/[a-z]*$/);
      if (!sourceMatch || sourceMatch[1].length < 2) continue;
      if (!byText.has(text)) byText.set(text, { source: sourceMatch[1], nodes: [] });
      byText.get(text).nodes.push(lit);
    }

    if (byText.size === 0) continue;

    const usedNames = new Set();
    const declarations = [];
    for (const [literalText, { source, nodes }] of byText.entries()) {
      const baseName = `${patternToConstName(source)}_RE`;
      let name = baseName;
      let i = 2;
      while (usedNames.has(name)) {
        name = `${baseName}_${i++}`;
      }
      usedNames.add(name);
      declarations.push({ name, literalText });
      for (const node of nodes) {
        node.replaceWithText(name);
      }
    }

    if (declarations.length === 0) continue;

    const importDecls = sourceFile.getImportDeclarations();
    let insertAt;
    if (importDecls.length > 0) {
      insertAt = importDecls[importDecls.length - 1].getEnd() + 1;
    } else {
      insertAt = 0;
    }

    const declText = `\n${declarations
      .map((d) => `const ${d.name} = ${d.literalText};`)
      .join('\n')}\n`;
    sourceFile.insertText(insertAt, declText);

    try {
      sourceFile.saveSync();
      filesChanged += 1;
      totalHoisted += declarations.length;
    } catch (error) {
      skipped.push({
        file: relPath,
        count: declarations.length,
        reason: `save failed: ${error.message}`,
      });
    }
  }

  writeFileSync(skipLogPath, JSON.stringify(skipped, null, 2));

  console.log(
    `[hoist-regex] Done. files_changed=${filesChanged} hoisted=${totalHoisted} skipped=${skipped.length}`,
  );
}

main().catch((err) => {
  console.error('[hoist-regex] FATAL:', err);
  process.exit(1);
});
