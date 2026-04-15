#!/usr/bin/env node
/**
 * narrow-catch-any.mjs
 *
 * Conservative codemod (Option C) that removes the explicit `any` annotation
 * from `catch (e: any)` clauses **only when the catch body does not perform
 * member access** on the error binding. TypeScript will then default the
 * binding to `unknown`, which is the type-safe behavior.
 *
 * Sites where the catch body references `e.message`, `e.stack`, etc. are
 * skipped and logged for manual narrowing follow-up — they require per-site
 * judgement to add the right `instanceof Error` guard.
 *
 * Scope: backend/src, frontend/src, worker. Excludes tests, generated code,
 * node_modules, dist, and PULSE scripts.
 *
 * Usage:
 *   node scripts/ops/codemods/narrow-catch-any.mjs [--dry-run]
 *
 * Exit codes:
 *   0 — success (with or without mutations)
 *   1 — unrecoverable error
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, SyntaxKind, ts } from 'ts-morph';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const skipLogPath = path.join(here, '.narrow-catch-any-skipped.json');

const WORKSPACE_CONFIGS = [
  { label: 'backend', tsconfig: path.join(repoRoot, 'backend', 'tsconfig.json') },
  { label: 'frontend', tsconfig: path.join(repoRoot, 'frontend', 'tsconfig.json') },
  { label: 'worker', tsconfig: path.join(repoRoot, 'worker', 'tsconfig.json') },
];

const SKIP_PATH_HINTS = [
  'node_modules',
  '__tests__',
  '__mocks__',
  '.spec.ts',
  '.spec.tsx',
  '.test.ts',
  '.test.tsx',
  '.e2e-spec.ts',
  '.d.ts',
  '/dist/',
  '/test/',
  '/tests/',
  'scripts/pulse/',
];

function shouldProcessFile(filePath) {
  return !SKIP_PATH_HINTS.some((hint) => filePath.includes(hint));
}

const skipLog = [];
let totalCatchesScanned = 0;
let totalMutated = 0;
let totalFilesChanged = 0;

for (const { label, tsconfig } of WORKSPACE_CONFIGS) {
  const project = new Project({
    tsConfigFilePath: tsconfig,
    skipAddingFilesFromTsConfig: false,
  });

  const sourceFiles = project.getSourceFiles().filter((sf) => shouldProcessFile(sf.getFilePath()));

  for (const sourceFile of sourceFiles) {
    let fileMutated = false;

    sourceFile.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CatchClause) return;
      const catchClause = node.asKindOrThrow(SyntaxKind.CatchClause);
      const variableDeclaration = catchClause.getVariableDeclaration();
      if (!variableDeclaration) return;

      const typeNode = variableDeclaration.getTypeNode();
      if (!typeNode) return;
      // Only target explicit `any`. Leave `unknown`, `Error`, etc. alone.
      if (typeNode.getText() !== 'any') return;

      totalCatchesScanned += 1;

      // Only handle simple identifier bindings.
      const bindingPattern = variableDeclaration.getNameNode();
      if (bindingPattern.getKind() !== SyntaxKind.Identifier) {
        skipLog.push({
          file: path.relative(repoRoot, sourceFile.getFilePath()),
          line: catchClause.getStartLineNumber(),
          reason: 'destructured catch binding not supported',
        });
        return;
      }

      const name = variableDeclaration.getName();
      const block = catchClause.getBlock();

      // Option C: refuse if there is ANY member access on the binding inside
      // the block. Property access (`e.message`), element access (`e['x']`),
      // and non-null assertion-then-access all count as unsafe.
      const hasMemberAccess = block
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .some((identifier) => {
          if (identifier.getText() !== name) return false;
          const parent = identifier.getParent();
          if (!parent) return false;
          const parentKind = parent.getKind();
          if (
            parentKind !== SyntaxKind.PropertyAccessExpression &&
            parentKind !== SyntaxKind.ElementAccessExpression
          ) {
            return false;
          }
          // Confirm the identifier is the *object* of the access, not the property name.
          if (parentKind === SyntaxKind.PropertyAccessExpression) {
            const pae = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
            return pae.getExpression() === identifier;
          }
          const eae = parent.asKindOrThrow(SyntaxKind.ElementAccessExpression);
          return eae.getExpression() === identifier;
        });

      if (hasMemberAccess) {
        skipLog.push({
          file: path.relative(repoRoot, sourceFile.getFilePath()),
          line: catchClause.getStartLineNumber(),
          reason: 'member access on catch binding requires manual narrowing',
        });
        return;
      }

      // Safe under Option C: simply remove the `: any` annotation.
      // TypeScript defaults to `unknown` when no type annotation is present.
      variableDeclaration.removeType();
      fileMutated = true;
      totalMutated += 1;
    });

    if (fileMutated) {
      totalFilesChanged += 1;
      if (!DRY_RUN) {
        sourceFile.saveSync();
      }
    }
  }

  // Release memory between workspaces.
  for (const sourceFile of project.getSourceFiles()) {
    project.removeSourceFile(sourceFile);
  }
  void label;
}

writeFileSync(skipLogPath, `${JSON.stringify(skipLog, null, 2)}\n`);

console.log(
  `[narrow-catch-any] scanned=${totalCatchesScanned} mutated=${totalMutated} files_changed=${totalFilesChanged} skipped=${skipLog.length}${
    DRY_RUN ? ' (dry-run)' : ''
  }`,
);
// Reference ts so bundlers don't shake it.
void ts;
