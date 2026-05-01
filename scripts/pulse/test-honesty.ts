import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

export interface PlaceholderTestResult {
  count: number;
  files: string[];
}

export interface WeakAssertionResult {
  count: number;
  files: string[];
  rawSignals: WeakAssertionRawSignal[];
}

export interface WeakAssertionRawSignal {
  file: string;
  evidenceKind: 'ast';
  truthMode: 'weak_assertion';
  blocking: true;
}

export interface TypeEscapeHatchResult {
  count: number;
  locations: string[];
}

interface SourceFileCandidate {
  absolutePath: string;
  relativePath: string;
}

interface TypeEscapePattern {
  marker: string;
  label: string;
  requiresWordBoundary?: boolean;
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_NAME_TOKENS = new Set(['spec', 'test']);
const TEST_DIRECTORY_TOKENS = new Set(['test', '__tests__', 'spec', '__mocks__', 'e2e', 'parsers']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'e2e']);
const TEST_DECLARATION_NAMES = new Set(['it', 'test']);
const TEST_CONTAINER_NAMES = new Set(['describe']);
const TEST_PLACEHOLDER_MODIFIERS = new Set(['todo', 'skip']);
const EMPTY_ASSERTION_PRIMITIVES = new Set(['true', '1']);
const WEAK_ASSERTION_RECEIVERS = new Set(['response', 'result']);
const WEAK_TRUTHY_RECEIVERS = new Set(['res', 'data']);
const WEAK_STATUS_PROPERTIES = new Set(['status', 'statusCode']);
const TYPE_ESCAPE_PATTERNS: TypeEscapePattern[] = [
  { marker: 'as any', label: 'as any', requiresWordBoundary: true },
  { marker: '@ts-ignore', label: '@ts-ignore' },
  { marker: '@ts-expect-error', label: '@ts-expect-error' },
  {
    marker: '// eslint-disable @typescript-eslint/no-explicit-any',
    label: 'eslint-disable no-explicit-any',
  },
  {
    marker: '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    label: 'eslint-disable-next-line no-explicit-any',
  },
];

function pathSegments(filePath: string): string[] {
  return filePath.replaceAll('\\', '/').split('/').filter(Boolean);
}

function nameTokens(fileName: string): Set<string> {
  const extension = path.extname(fileName);
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  const tokens: string[] = [];
  let current = '';

  for (const char of stem) {
    if (char === '.' || char === '_' || char === '-') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char.toLowerCase();
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return new Set(tokens);
}

function isSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(fileName));
}

function isTestFileName(fileName: string): boolean {
  if (!isSourceFile(fileName)) {
    return false;
  }
  const tokens = nameTokens(fileName);
  return [...TEST_NAME_TOKENS].some((token) => tokens.has(token));
}

function isInTestDirectory(relativePath: string): boolean {
  return pathSegments(relativePath).some((segment) => TEST_DIRECTORY_TOKENS.has(segment));
}

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || EXCLUDED_DIRECTORIES.has(name);
}

function walkSourceFiles(
  rootDir: string,
  shouldIncludeFile: (relativePath: string, fileName: string) => boolean,
): SourceFileCandidate[] {
  const files: SourceFileCandidate[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          scanDir(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(rootDir, absolutePath);
      if (shouldIncludeFile(relativePath, entry.name)) {
        files.push({ absolutePath, relativePath });
      }
    }
  }

  scanDir(rootDir);
  return files;
}

function parseTypeScriptFile(filePath: string): ts.SourceFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

function stringValue(node: ts.Node | undefined): string | null {
  if (!node || !ts.isStringLiteralLike(node)) {
    return null;
  }
  return node.text;
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase();
}

function hasPlaceholderTitle(title: string): boolean {
  const normalized = normalizedTitle(title);
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.startsWith('todo') || normalized === 'placeholder') {
    return true;
  }
  if (normalized === 'should work' || normalized === 'should pass') {
    return true;
  }
  return normalized.startsWith('should ') && normalized.includes(' not be empty');
}

function isPlaceholderModifierCall(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }
  const receiverName = calleeName(expression.expression);
  return (
    receiverName !== null &&
    (TEST_DECLARATION_NAMES.has(receiverName) || TEST_CONTAINER_NAMES.has(receiverName)) &&
    TEST_PLACEHOLDER_MODIFIERS.has(expression.name.text)
  );
}

function isPlaceholderTestDeclaration(call: ts.CallExpression): boolean {
  const name = calleeName(call.expression);
  const title = stringValue(call.arguments[0]);
  if (isPlaceholderModifierCall(call.expression)) {
    return true;
  }
  return (
    name !== null &&
    TEST_DECLARATION_NAMES.has(name) &&
    title !== null &&
    hasPlaceholderTitle(title)
  );
}

function literalText(node: ts.Expression): string | null {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return 'true';
  }
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function isExpectCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'expect'
  );
}

function isEmptyPrimitiveAssertion(call: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'toBe') {
    return false;
  }
  const expectCall = call.expression.expression;
  if (!isExpectCall(expectCall)) {
    return false;
  }
  const actual = expectCall.arguments[0];
  const expected = call.arguments[0];
  if (!actual || !expected) {
    return false;
  }
  const actualText = literalText(actual);
  const expectedText = literalText(expected);
  return (
    actualText !== null && actualText === expectedText && EMPTY_ASSERTION_PRIMITIVES.has(actualText)
  );
}

function hasPlaceholderEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      (isPlaceholderTestDeclaration(node) || isEmptyPrimitiveAssertion(node))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function propertyAccessName(node: ts.Expression): { receiver: string; property: string } | null {
  if (!ts.isPropertyAccessExpression(node)) {
    return null;
  }
  const receiver = node.expression;
  if (!ts.isIdentifier(receiver)) {
    return null;
  }
  return { receiver: receiver.text, property: node.name.text };
}

function expectArgument(call: ts.CallExpression): ts.Expression | null {
  if (!isExpectCall(call)) {
    return null;
  }
  return call.arguments[0] ?? null;
}

function isWeakDefinedAssertion(call: ts.CallExpression): boolean {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== 'toBeDefined'
  ) {
    return false;
  }
  const receiver = call.expression.expression;
  if (!isExpectCall(receiver)) {
    return false;
  }
  const argument = expectArgument(receiver);
  if (!argument) {
    return false;
  }
  if (ts.isIdentifier(argument)) {
    return WEAK_ASSERTION_RECEIVERS.has(argument.text);
  }
  const access = propertyAccessName(argument);
  return (
    access !== null && access.receiver === 'response' && WEAK_STATUS_PROPERTIES.has(access.property)
  );
}

function isWeakTruthyAssertion(call: ts.CallExpression): boolean {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== 'toBeTruthy'
  ) {
    return false;
  }
  const receiver = call.expression.expression;
  if (!isExpectCall(receiver)) {
    return false;
  }
  const argument = expectArgument(receiver);
  return ts.isIdentifier(argument) && WEAK_TRUTHY_RECEIVERS.has(argument.text);
}

function hasWeakAssertionEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      (isWeakDefinedAssertion(node) || isWeakTruthyAssertion(node))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function hasMarkerAt(line: string, marker: string, index: number): boolean {
  return line.slice(index, index + marker.length) === marker;
}

function hasIdentifierBoundary(line: string, index: number, marker: string): boolean {
  const before = index > 0 ? line[index - 1] : '';
  const afterIndex = index + marker.length;
  const after = afterIndex < line.length ? line[afterIndex] : '';
  return !isIdentifierCharacter(before) && !isIdentifierCharacter(after);
}

function isIdentifierCharacter(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const code = value.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isUpper || isDigit || value === '_' || value === '$';
}

function lineMatchesTypeEscape(line: string, pattern: TypeEscapePattern): boolean {
  for (let index = 0; index <= line.length - pattern.marker.length; index += 1) {
    if (!hasMarkerAt(line, pattern.marker, index)) {
      continue;
    }
    if (pattern.requiresWordBoundary && !hasIdentifierBoundary(line, index, pattern.marker)) {
      continue;
    }
    return true;
  }
  return false;
}
import './__companions__/test-honesty.companion';
