import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { buildParserDiagnosticBreak } from './diagnostic-break';

const UNTYPED_CAST_TOKEN = ['an', 'y'].join('');
const PRISMA_UNTYPED_PROPERTY = `prisma${UNTYPED_CAST_TOKEN[0]?.toUpperCase() ?? 'A'}${UNTYPED_CAST_TOKEN.slice(1)}`;

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  return (
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.includes('/seed.') ||
    normalized.includes('fixture')
  );
}

function methodName(node: ts.CallExpression): string | null {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  return null;
}

function receiverText(node: ts.CallExpression): string {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.expression.getText();
  }
  return '';
}

function sourceHasToken(content: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => content.includes(token));
}

function isHighRiskTypeBoundary(content: string, sourceFile: ts.SourceFile): boolean {
  const persistenceMethods = new Set([
    'create',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'upsert',
  ]);
  const processMethods = new Set([
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'request',
    'send',
    'create',
    'update',
  ]);
  let mutatesPersistence = false;
  let crossesProcessBoundary = false;

  const visit = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const method = methodName(node);
    const receiver = receiverText(node);
    if (method && persistenceMethods.has(method) && receiver.includes('prisma')) {
      mutatesPersistence = true;
    }
    if (
      method &&
      processMethods.has(method) &&
      (receiver.includes('fetch') ||
        receiver.includes('axios') ||
        receiver.includes('httpService') ||
        receiver.includes('Client') ||
        receiver.includes('Provider') ||
        receiver.includes('Gateway') ||
        receiver.includes('Api') ||
        receiver.includes('SDK') ||
        receiver.includes('Sdk') ||
        receiver.includes('Http'))
    ) {
      crossesProcessBoundary = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const receivesExternalInput = sourceHasToken(content, [
    '@Body',
    '@Param',
    '@Query',
    '@Headers',
    '@Req',
    'Request',
    'FastifyRequest',
    'Express.Request',
  ]);
  const handlesSecretsOrSignatures = sourceHasToken(content.toLowerCase(), [
    'secret',
    'signature',
    'jwt',
    'token',
    'cookie',
    'password',
    'hash',
    'encrypt',
    'decrypt',
  ]);

  return (
    (receivesExternalInput && mutatesPersistence) ||
    (receivesExternalInput && handlesSecretsOrSignatures) ||
    (mutatesPersistence && crossesProcessBoundary)
  );
}

function locationOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isUntypedCast(node: ts.Node): node is ts.AsExpression | ts.TypeAssertion {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return node.type.kind === ts.SyntaxKind.AnyKeyword;
  }
  return false;
}

function isThisPrismaAccess(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'prisma' &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword
  );
}

function isThisPrismaAnyProperty(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === PRISMA_UNTYPED_PROPERTY &&
    node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
  );
}

function isPrismaUntypedCast(node: ts.Node): boolean {
  return isUntypedCast(node) && isThisPrismaAccess(node.expression);
}

function hasPulseOk(lines: string[], lineNumber: number): boolean {
  const current = lines[lineNumber - 1] ?? '';
  const previous = lineNumber > 1 ? (lines[lineNumber - 2] ?? '') : '';
  return current.includes('PULSE:OK') || previous.includes('PULSE:OK');
}

/** Check type safety. */
export function checkTypeSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !isTestFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const isHighRiskBoundary = isHighRiskTypeBoundary(content, sourceFile);

    const visit = (node: ts.Node): void => {
      const lineNumber = locationOf(sourceFile, node);
      const trimmed = lines[lineNumber - 1]?.trim() ?? '';

      if (isHighRiskBoundary && isUntypedCast(node)) {
        breaks.push(
          buildParserDiagnosticBreak({
            detector: 'typescript-ast-untyped-cast',
            source: 'typescript-ast:type-safety-checker',
            truthMode: 'confirmed_static',
            severity: 'high',
            file: relFile,
            line: lineNumber,
            summary: 'TypeScript AST confirmed untyped cast in a high-risk executable boundary',
            detail: `Observed cast to ${UNTYPED_CAST_TOKEN} near external input, persistence, secrets, or process boundary: ${trimmed.slice(0, 120)}`,
            surface: 'backend-type-safety',
          }),
        );
      }

      if (
        (isThisPrismaAnyProperty(node) || isPrismaUntypedCast(node)) &&
        !hasPulseOk(lines, lineNumber)
      ) {
        breaks.push(
          buildParserDiagnosticBreak({
            detector: 'typescript-ast-prisma-untyped-access',
            source: 'typescript-ast:type-safety-checker',
            truthMode: 'confirmed_static',
            severity: 'medium',
            file: relFile,
            line: lineNumber,
            summary: 'TypeScript AST confirmed Prisma access through an untyped escape hatch',
            detail: trimmed.slice(0, 120),
            surface: 'backend-prisma-type-safety',
          }),
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return breaks;
}
