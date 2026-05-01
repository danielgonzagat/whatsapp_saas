/**
 * PULSE Parser 59: Performance - Query Profiler (STATIC)
 * Layer 6: Performance Testing
 *
 * STATIC analysis: scans backend service files for Prisma findMany calls whose
 * syntax does not show field projection or bounded result evidence.
 *
 * BREAK TYPES:
 * - Generated from observed predicate names instead of fixed operational labels.
 */

import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { readTextFile } from '../safe-fs';
import { walkFiles } from './utils';

interface QueryProfilerDiagnostic {
  file: string;
  line: number;
  callPreview: string;
  predicate: string;
  description: string;
  remediation: string;
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function isBackendSourceFile(file: string): boolean {
  const normalized = file.replaceAll(path.sep, '/');
  if (!normalized.endsWith('.ts') || normalized.endsWith('.d.ts')) {
    return false;
  }
  if (
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts') ||
    normalized.includes('/dist/')
  ) {
    return false;
  }
  return true;
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectPropertyNames(node: ts.ObjectLiteralExpression): Set<string> {
  const names = new Set<string>();
  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = propertyName(property.name);
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}

function firstObjectArgument(node: ts.CallExpression): ts.ObjectLiteralExpression | null {
  const [firstArg] = node.arguments;
  return firstArg && ts.isObjectLiteralExpression(firstArg) ? firstArg : null;
}

function isFindManyCall(node: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'findMany';
}

function slug(value: string): string {
  let output = '';
  let previousWasSeparator = false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isAlphaNumeric =
      (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (isAlphaNumeric) {
      output += char.toLowerCase();
      previousWasSeparator = false;
      continue;
    }
    if (!previousWasSeparator && output.length > 0) {
      output += '-';
      previousWasSeparator = true;
    }
  }
  return output.endsWith('-') ? output.slice(0, -1) : output;
}

function queryProfilerBreak(input: QueryProfilerDiagnostic): Break {
  return {
    type: `diagnostic:performance-query-profiler:${slug(input.predicate)}`,
    severity: 'medium',
    file: input.file,
    line: input.line,
    description: input.description,
    detail: `${input.callPreview} - ${input.remediation}`,
    source: `syntax-evidence:performance-query-profiler;predicate=${input.predicate}`,
  };
}

function appendBreak(target: Break[], entry: Break): void {
  target[target.length] = entry;
}

function callPreview(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = node.getText(sourceFile);
  return text
    .split('\n')
    .map((part) => part.trim())
    .join(' ')
    .slice(0, 120);
}

function queryDiagnostics(
  sourceFile: ts.SourceFile,
  relFile: string,
  node: ts.CallExpression,
): QueryProfilerDiagnostic[] {
  const options = firstObjectArgument(node);
  const fields = options ? objectPropertyNames(options) : new Set<string>();
  const preview = callPreview(sourceFile, node);
  const line = lineNumber(sourceFile, node);
  const diagnostics: QueryProfilerDiagnostic[] = [];

  if (!fields.has('select') && !fields.has('include')) {
    diagnostics[diagnostics.length] = {
      file: relFile,
      line,
      callPreview: preview,
      predicate: 'field-projection-not-observed',
      description: 'Prisma findMany call has no field projection evidence',
      remediation: 'Add select/include evidence so the query fetches only required fields.',
    };
  }

  if (!fields.has('take')) {
    diagnostics[diagnostics.length] = {
      file: relFile,
      line,
      callPreview: preview,
      predicate: 'result-bound-not-observed',
      description: 'Prisma findMany call has no result bound evidence',
      remediation: 'Add take/skip pagination or another explicit result cap.',
    };
  }

  return diagnostics;
}

function collectDiagnostics(sourceFile: ts.SourceFile, relFile: string): QueryProfilerDiagnostic[] {
  const diagnostics: QueryProfilerDiagnostic[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isFindManyCall(node)) {
      for (const diagnostic of queryDiagnostics(sourceFile, relFile, node)) {
        diagnostics[diagnostics.length] = diagnostic;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return diagnostics;
}

/** Check performance query profiler. */
export function checkPerformanceQueryProfiler(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(isBackendSourceFile);

  for (const file of backendFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const relFile = path.relative(config.rootDir, file);

    for (const diagnostic of collectDiagnostics(sourceFile, relFile)) {
      appendBreak(breaks, queryProfilerBreak(diagnostic));
    }
  }

  return breaks;
}
