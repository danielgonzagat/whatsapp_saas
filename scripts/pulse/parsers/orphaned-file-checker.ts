import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { buildParserDiagnosticBreak } from './diagnostic-break';

function shouldSkipFile(filePath: string): boolean {
  const base = path.basename(filePath);
  const normalized = filePath.replaceAll('\\', '/');
  return (
    base === 'index.ts' ||
    base === 'main.ts' ||
    base.endsWith('.module.ts') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.test.ts') ||
    base.endsWith('.d.ts') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.toLowerCase().includes('/migration.') ||
    normalized.toLowerCase().includes('/seed.') ||
    normalized.toLowerCase().includes('fixture')
  );
}

function importsBaseName(content: string, base: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  let found = false;
  const checkSpecifier = (value: string): void => {
    if (value.includes(base)) {
      found = true;
    }
  };
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkSpecifier(node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteral(firstArg)) {
        checkSpecifier(firstArg.text);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** Check orphaned files. */
export function checkOrphanedFiles(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Only check backend services, controllers, and dtos
  const targetFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (shouldSkipFile(f)) {
      return false;
    }
    const base = path.basename(f);
    return (
      base.endsWith('.service.ts') || base.endsWith('.controller.ts') || base.endsWith('.dto.ts')
    );
  });

  if (targetFiles.length === 0) {
    return breaks;
  }

  // Build corpus of all backend .ts files to search for imports
  const allBackendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    return !shouldSkipFile(f);
  });

  // Cache file contents
  const contentCache = new Map<string, string>();
  for (const f of allBackendFiles) {
    try {
      contentCache.set(f, readTextFile(f, 'utf8'));
    } catch {
      // skip unreadable files
    }
  }

  for (const file of targetFiles) {
    const base = path.basename(file, '.ts');
    const relFile = path.relative(config.rootDir, file);

    let isImported = false;

    for (const [otherFile, otherContent] of contentCache) {
      if (otherFile === file) {
        continue;
      }

      if (importsBaseName(otherContent, base, otherFile)) {
        isImported = true;
        break;
      }
    }

    if (!isImported) {
      breaks.push(
        buildParserDiagnosticBreak({
          detector: 'orphaned-file-import-graph',
          source: 'static-import-graph:orphaned-file-checker',
          truthMode: 'confirmed_static',
          severity: 'low',
          file: relFile,
          line: 1,
          summary: 'Backend file has no import references in the current import graph',
          detail: `${relFile} has no import references. It may be dead code or accidentally disconnected from its module. file=${path.basename(file)}`,
          surface: 'backend-import-graph',
        }),
      );
    }
  }

  return breaks;
}
