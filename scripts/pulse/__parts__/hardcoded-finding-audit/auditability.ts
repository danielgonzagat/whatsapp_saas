import * as ts from 'typescript';
import type { HardcodedFindingAuditSource } from './types';
import { hasExportedExecutableDeclaration } from './export-checks';
import { hasStructuralParserSignal } from './export-checks';

export function isAuditableSource(input: HardcodedFindingAuditSource): boolean {
  if (!input.filePath.split(/[\\/]/).includes('pulse')) {
    return false;
  }

  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.source,
    ts.ScriptTarget.Latest,
    true,
  );
  return hasExportedExecutableDeclaration(sourceFile) || hasStructuralParserSignal(sourceFile);
}
