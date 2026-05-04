import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function shouldSkipFile(file: string): boolean {
  const normalized = file.replaceAll(path.sep, path.posix.sep).toLowerCase();
  return (
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts') ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/__mocks__/') ||
    normalized.includes('/seed.') ||
    normalized.includes('/migration.') ||
    normalized.includes('fixture')
  );
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function sensitiveLogBreakType(): Break['type'] {
  return eventType('sensitive', 'data', 'in', 'log');
}

function internalErrorBreakType(): Break['type'] {
  return eventType('internal', 'error', 'exposed');
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function severityFromExposure(exposure: {
  crossesRuntimeBoundary: boolean;
  includesCredentialMaterial: boolean;
}): Break['severity'] {
  if (exposure.crossesRuntimeBoundary && exposure.includesCredentialMaterial) {
    return 'critical';
  }
  if (exposure.crossesRuntimeBoundary) {
    return 'high';
  }
  return 'medium';
}

function splitNameTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const previous = i > 0 ? value[i - 1] : '';
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9');
    if (!isAlphaNumeric) {
      if (current) {
        tokens.push(current.toLowerCase());
        current = '';
      }
      continue;
    }
    const startsCamelToken =
      current.length > 0 && char >= 'A' && char <= 'Z' && previous >= 'a' && previous <= 'z';
    if (startsCamelToken) {
      tokens.push(current.toLowerCase());
      current = char;
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current.toLowerCase());
  }
  return tokens;
}

function tokenNamesSecretMaterial(token: string): boolean {
  switch (token) {
    case 'password':
    case 'passwd':
    case 'pwd':
    case 'secret':
    case 'cvv':
    case 'cvc':
    case 'authorization':
      return true;
    default:
      return false;
  }
}

function tokensNameCredentialMaterial(tokens: string[]): boolean {
  if (tokens.some(tokenNamesSecretMaterial)) {
    return true;
  }
  const tokenSet = new Set(tokens);
  if (tokenSet.has('token')) {
    return true;
  }
  if (tokenSet.has('key') && (tokenSet.has('api') || tokenSet.has('private'))) {
    return true;
  }
  return tokenSet.has('credit') && tokenSet.has('card');
}

function nodeName(node: ts.Node): string | null {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function nodeMentionsCredentialMaterial(node: ts.Node): boolean {
  if (ts.isStringLiteralLike(node)) {
    return false;
  }
  const text = nodeName(node);
  if (text && tokensNameCredentialMaterial(splitNameTokens(text))) {
    return true;
  }
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found || ts.isStringLiteralLike(child)) {
      return;
    }
    const childText = nodeName(child);
    if (childText && tokensNameCredentialMaterial(splitNameTokens(childText))) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function isLoggerExpression(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }
  const receiver = expression.expression;
  if (ts.isIdentifier(receiver) && receiver.text === 'console') {
    return true;
  }
  return ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'logger';
}

function isSensitiveLogCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    isLoggerExpression(node.expression) &&
    node.arguments.some(nodeMentionsCredentialMaterial)
  );
}

function isHttpExceptionConstructor(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === 'HttpException';
}

function isRawErrorInternal(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }
  const property = expression.name.text;
  if (property !== 'message' && property !== 'stack') {
    return false;
  }
  const receiver = expression.expression;
  if (!ts.isIdentifier(receiver)) {
    return false;
  }
  const receiverTokens = splitNameTokens(receiver.text);
  return receiverTokens.includes('error') || receiverTokens.includes('err');
}

function isHttpExceptionLeak(node: ts.Node): node is ts.NewExpression {
  return (
    ts.isNewExpression(node) &&
    isHttpExceptionConstructor(node.expression) &&
    node.arguments !== undefined &&
    node.arguments.length > 0 &&
    isRawErrorInternal(node.arguments[0])
  );
}

function lineForNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function detailForNode(sourceFile: ts.SourceFile, node: ts.Node): string {
  return node.getText(sourceFile).split(/\s+/).join(' ').slice(0, 120);
}

/** Check sensitive data. */
export function checkSensitiveData(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const relFile = path.relative(config.rootDir, file);

    const visit = (node: ts.Node): void => {
      if (isSensitiveLogCall(node)) {
        pushBreak(breaks, {
          type: sensitiveLogBreakType(),
          severity: severityFromExposure({
            crossesRuntimeBoundary: true,
            includesCredentialMaterial: true,
          }),
          file: relFile,
          line: lineForNode(sourceFile, node),
          description: 'Log call includes credential-shaped runtime data',
          detail: detailForNode(sourceFile, node),
        });
      }

      if (isHttpExceptionLeak(node)) {
        pushBreak(breaks, {
          type: internalErrorBreakType(),
          severity: severityFromExposure({
            crossesRuntimeBoundary: true,
            includesCredentialMaterial: false,
          }),
          file: relFile,
          line: lineForNode(sourceFile, node),
          description: 'HttpException exposes raw error internals to clients',
          detail: detailForNode(sourceFile, node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return breaks;
}
