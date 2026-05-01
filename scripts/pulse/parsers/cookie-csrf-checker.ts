import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function shouldSkipFile(file: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(file);
}

function nodeContainsText(node: ts.Node, expected: string): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isIdentifier(child) ||
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child)
    ) {
      found = child.text.toLowerCase().includes(expected);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function isCookieWriteCall(node: ts.CallExpression): boolean {
  const argumentMentionsCookie = node.arguments.some((arg) => nodeContainsText(arg, 'cookie'));
  return (
    nodeContainsText(node.expression, 'cookie') ||
    (argumentMentionsCookie &&
      (nodeContainsText(node.expression, 'set') || nodeContainsText(node.expression, 'header')))
  );
}

function firstObjectLiteral(args: ts.NodeArray<ts.Expression>): ts.ObjectLiteralExpression | null {
  for (const arg of args) {
    if (ts.isObjectLiteralExpression(arg)) {
      return arg;
    }
  }
  return null;
}

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function propertyAssignment(
  objectLiteral: ts.ObjectLiteralExpression | null,
  propertyName: string,
): ts.PropertyAssignment | null {
  if (!objectLiteral) {
    return null;
  }
  return (
    objectLiteral.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName,
    ) ?? null
  );
}

function expressionMentionsProcessEnv(expression: ts.Expression): boolean {
  return nodeContainsText(expression, 'process') && nodeContainsText(expression, 'env');
}

function hasTrueProperty(
  objectLiteral: ts.ObjectLiteralExpression | null,
  propertyName: string,
  options: { allowProcessEnv?: boolean } = {},
): boolean {
  const property = propertyAssignment(objectLiteral, propertyName);
  if (!property) {
    return false;
  }
  return (
    property.initializer.kind === ts.SyntaxKind.TrueKeyword ||
    (options.allowProcessEnv === true && expressionMentionsProcessEnv(property.initializer))
  );
}

function hasProperty(
  objectLiteral: ts.ObjectLiteralExpression | null,
  propertyName: string,
): boolean {
  return propertyAssignment(objectLiteral, propertyName) !== null;
}

function lineForNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function detailForNode(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile).split(/\s+/).join(' ').slice(0, 120);
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function cookieBreakType(qualifier: string, propertyName: string): string {
  return eventType('cookie', qualifier, propertyName);
}

function csrfBreakType(qualifier: string): string {
  return eventType('csrf', qualifier);
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function hasCsrfEvidence(sourceFile: ts.SourceFile): boolean {
  return nodeContainsText(sourceFile, 'csrf') || nodeContainsText(sourceFile, 'csurf');
}

/** Check cookie security. */
export function checkCookieSecurity(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Global CSRF check accumulator
  let csrfMentionCount = 0;

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const relFile = path.relative(config.rootDir, file);

    if (hasCsrfEvidence(sourceFile)) {
      csrfMentionCount++;
    }

    const visit = (node: ts.Node): void => {
      if (!ts.isCallExpression(node) || !isCookieWriteCall(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const cookieOptions = firstObjectLiteral(node.arguments);
      const line = lineForNode(sourceFile, node);
      const detail = detailForNode(sourceFile, node);

      if (!hasTrueProperty(cookieOptions, 'httpOnly')) {
        pushBreak(breaks, {
          type: cookieBreakType('not', 'httpOnly'),
          severity: 'high',
          file: relFile,
          line,
          description: 'Cookie set without httpOnly: true — vulnerable to XSS theft',
          detail,
        });
      }

      if (!hasTrueProperty(cookieOptions, 'secure', { allowProcessEnv: true })) {
        pushBreak(breaks, {
          type: cookieBreakType('not', 'secure'),
          severity: 'medium',
          file: relFile,
          line,
          description: 'Cookie set without secure: true — transmitted over HTTP',
          detail,
        });
      }

      if (!hasProperty(cookieOptions, 'sameSite')) {
        pushBreak(breaks, {
          type: cookieBreakType('no', 'sameSite'),
          severity: 'medium',
          file: relFile,
          line,
          description: 'Cookie set without sameSite attribute — vulnerable to CSRF',
          detail,
        });
      }
    };

    visit(sourceFile);
  }

  if (csrfMentionCount === 0) {
    pushBreak(breaks, {
      type: csrfBreakType('unprotected'),
      severity: 'critical',
      file: 'backend/src',
      line: 0,
      description: 'No CSRF protection found anywhere in the backend',
      detail:
        'No references to csrf, csurf, csrfProtection, or _csrf found. Add CSRF middleware if using cookie-based auth.',
    });
  }

  return breaks;
}
