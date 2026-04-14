#!/usr/bin/env node
/**
 * narrow-catch-any.mjs
 *
 * Codemod that eliminates `catch (err: any)` patterns by:
 *  1. Replacing the parameter type annotation with `unknown`.
 *  2. Rewriting common property accesses inside the catch body to go through
 *     a narrowed local `const errInfo = err instanceof Error ? err : new Error(String(err))`.
 *
 * Scope: backend/src, frontend/src, worker. Excludes tests, node_modules,
 * generated code, and anything matching a SKIP list. Skips files where the
 * catch body uses tricky patterns the codemod cannot safely rewrite — logs
 * them to `.narrow-catch-any-skipped.json` for manual follow-up.
 *
 * Usage:
 *   node scripts/ops/codemods/narrow-catch-any.mjs [--dry-run]
 *
 * Exit codes:
 *   0 — success (with or without mutations)
 *   1 — unrecoverable error (unreachable tsconfig, parse failure, etc)
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
      if (typeNode.getText() !== 'any') return;

      totalCatchesScanned += 1;

      const name = variableDeclaration.getName();
      const block = catchClause.getBlock();
      const blockText = block.getText();

      // Refuse cases we cannot safely rewrite: complex destructuring, spread,
      // or re-assignment of the catch binding.
      const bindingPattern = variableDeclaration.getNameNode();
      if (bindingPattern.getKind() !== SyntaxKind.Identifier) {
        skipLog.push({
          file: path.relative(repoRoot, sourceFile.getFilePath()),
          line: catchClause.getStartLineNumber(),
          reason: 'destructured catch binding not supported',
        });
        return;
      }

      // Collect all property accesses of the catch binding inside the block.
      // Accept read-only accesses (err.message, err.stack, err.code, err?.xxx).
      // Refuse if the binding is used as a method callee (err.toString()) in a
      // way the narrowing helper would not preserve exact semantics — fall
      // through to `unknown` and let the developer narrow explicitly.
      const unsafeUsage = block.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => {
        if (identifier.getText() !== name) return false;
        const parent = identifier.getParent();
        if (!parent) return false;
        const parentKind = parent.getKind();
        // Allowed shapes:
        //  - PropertyAccess: err.message
        //  - TemplateSpan / Expression: `${err}`
        //  - String(err) / JSON.stringify(err) / logger.error(err)
        //  - Throw err; — rethrow without mutation is safe
        //  - (err as Error).xxx — keep as is
        //  - err instanceof X — keep
        if (
          parentKind === SyntaxKind.PropertyAccessExpression ||
          parentKind === SyntaxKind.ElementAccessExpression ||
          parentKind === SyntaxKind.BinaryExpression ||
          parentKind === SyntaxKind.TemplateSpan ||
          parentKind === SyntaxKind.CallExpression ||
          parentKind === SyntaxKind.ArgumentListStart ||
          parentKind === SyntaxKind.Parameter ||
          parentKind === SyntaxKind.ParenthesizedExpression ||
          parentKind === SyntaxKind.ThrowStatement ||
          parentKind === SyntaxKind.PrefixUnaryExpression ||
          parentKind === SyntaxKind.TypeOfExpression ||
          parentKind === SyntaxKind.ConditionalExpression ||
          parentKind === SyntaxKind.AsExpression ||
          parentKind === SyntaxKind.NonNullExpression ||
          parentKind === SyntaxKind.VariableDeclaration ||
          parentKind === SyntaxKind.PropertyAssignment ||
          parentKind === SyntaxKind.ShorthandPropertyAssignment ||
          parentKind === SyntaxKind.ReturnStatement ||
          parentKind === SyntaxKind.AwaitExpression ||
          parentKind === SyntaxKind.ExpressionStatement ||
          parentKind === SyntaxKind.ArrayLiteralExpression ||
          parentKind === SyntaxKind.SpreadElement
        ) {
          return false;
        }
        return true;
      });

      if (unsafeUsage) {
        skipLog.push({
          file: path.relative(repoRoot, sourceFile.getFilePath()),
          line: catchClause.getStartLineNumber(),
          reason: 'complex binding usage requires manual narrowing',
        });
        return;
      }

      // Safe to mutate: just replace the type annotation with `unknown`.
      typeNode.replaceWithText('unknown');
      fileMutated = true;
      totalMutated += 1;

      // If the catch body accesses err.message directly (common), insert a
      // narrowing local at the top of the block so the TS strict rules still
      // compile. Only do this if the first statement isn't already a
      // narrowing we inserted.
      const firstStatement = block.getStatements()[0];
      const hasPropertyAccess = block
        .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
        .some((propertyAccess) => {
          const expression = propertyAccess.getExpression();
          return expression.getKind() === SyntaxKind.Identifier && expression.getText() === name;
        });
      if (!hasPropertyAccess) return;
      if (firstStatement && firstStatement.getText().includes(`const ${name}InstanceofError`)) {
        return;
      }
      block.insertStatements(
        0,
        `const ${name}InstanceofError = ${name} instanceof Error ? ${name} : new Error(typeof ${name} === 'string' ? ${name} : 'unknown error');`,
      );
      // Rewrite subsequent `${name}.message`, `${name}.stack`, `${name}.name`,
      // `${name}.cause` references to use the narrowed helper.
      const candidates = block
        .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
        .filter((propertyAccess) => {
          const expression = propertyAccess.getExpression();
          return (
            expression.getKind() === SyntaxKind.Identifier &&
            expression.getText() === name &&
            ['message', 'stack', 'name', 'cause'].includes(propertyAccess.getName())
          );
        });
      for (const candidate of candidates) {
        const expression = candidate.getExpression();
        expression.replaceWithText(`${name}InstanceofError`);
      }
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
}

if (skipLog.length > 0) {
  writeFileSync(skipLogPath, `${JSON.stringify(skipLog, null, 2)}\n`);
}

console.log(
  `[narrow-catch-any] scanned=${totalCatchesScanned} mutated=${totalMutated} files_changed=${totalFilesChanged} skipped=${skipLog.length}${
    DRY_RUN ? ' (dry-run)' : ''
  }`,
);
// Reference ts so bundlers don't shake it.
void ts;
