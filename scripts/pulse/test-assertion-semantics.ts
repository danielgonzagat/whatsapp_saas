import ts from 'typescript';

export type TestAssertionKind =
  | 'direct_expect'
  | 'playwright_expect'
  | 'node_assert'
  | 'should_chain'
  | 'snapshot'
  | 'custom_helper'
  | 'db_assertion_helper';

export interface TestAssertionEvidence {
  kind: TestAssertionKind;
  callee: string;
  line: number;
}

export interface TestAssertionSemantics {
  hasAssertions: boolean;
  assertions: TestAssertionEvidence[];
  customAssertionHelpers: string[];
}

interface AssertionContext {
  sourceFile: ts.SourceFile;
  importedExpectNames: Set<string>;
  importedAssertionNames: Set<string>;
  importedNodeAssertNames: Set<string>;
  declaredAssertionHelpers: Set<string>;
}

const DIRECT_EXPECT_NAMES = new Set(['expect']);
const DIRECT_ASSERT_NAMES = new Set(['assert']);
const SHOULD_NAMES = new Set(['should']);
const SNAPSHOT_MATCHERS = new Set([
  'toHaveScreenshot',
  'toMatchImageSnapshot',
  'toMatchInlineSnapshot',
  'toMatchSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
  'toThrowErrorMatchingSnapshot',
]);

const ASSERTION_METHOD_NAMES = new Set([
  'deepEqual',
  'deepStrictEqual',
  'doesNotReject',
  'doesNotThrow',
  'equal',
  'fail',
  'ifError',
  'match',
  'notDeepEqual',
  'notDeepStrictEqual',
  'notEqual',
  'notStrictEqual',
  'ok',
  'rejects',
  'strictEqual',
  'throws',
]);

const EXPECT_MATCHER_PREFIXES = ['toBe', 'toContain', 'toEqual', 'toHave', 'toMatch', 'toThrow'];
const ASSERTION_HELPER_TOKENS = [
  'assert',
  'expect',
  'should',
  'verify',
  'ensure',
  'validate',
  'must',
  'snapshot',
];
const DB_TOKENS = ['database', 'db', 'prisma', 'record', 'row', 'table'];

export function analyzeTestAssertionSemantics(
  sourceText: string,
  fileName = 'inline.test.ts',
): TestAssertionSemantics {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const importedExpectNames = collectImportedExpectNames(sourceFile);
  const importedAssertionNames = collectImportedAssertionNames(sourceFile);
  const importedNodeAssertNames = collectImportedNodeAssertNames(sourceFile);
  const context: AssertionContext = {
    sourceFile,
    importedExpectNames,
    importedAssertionNames,
    importedNodeAssertNames,
    declaredAssertionHelpers: new Set(),
  };

  collectDeclaredAssertionHelpers(sourceFile, context);

  const assertions: TestAssertionEvidence[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const evidence = classifyCallExpression(node, context);
      if (evidence) {
        assertions.push(evidence);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {
    hasAssertions: assertions.length > 0,
    assertions,
    customAssertionHelpers: [
      ...context.declaredAssertionHelpers,
      ...context.importedAssertionNames,
    ].sort(),
  };
}

function collectImportedExpectNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set(DIRECT_EXPECT_NAMES);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = stringLiteralText(statement.moduleSpecifier);
    if (!moduleName || !/(@playwright\/test|vitest|jest|expect)/.test(moduleName)) continue;
    collectImportClauseNames(
      statement.importClause,
      names,
      (importedName) => importedName === 'expect',
    );
  }
  return names;
}

function collectImportedAssertionNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = stringLiteralText(statement.moduleSpecifier);
    if (!moduleName) continue;
    if (/^(node:)?assert(?:\/strict)?$/.test(moduleName)) continue;
    collectImportClauseNames(statement.importClause, names, (importedName, localName) => {
      return (
        isAssertionHelperName(localName) ||
        isAssertionHelperName(importedName) ||
        /(?:^|[/@-])assert(?:$|[/@-])|test-utils|test-helpers|assertion/.test(moduleName)
      );
    });
  }
  return names;
}

function collectImportedNodeAssertNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set(DIRECT_ASSERT_NAMES);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = stringLiteralText(statement.moduleSpecifier);
    if (!moduleName || !/^(node:)?assert(?:\/strict)?$/.test(moduleName)) continue;
    collectImportClauseNames(statement.importClause, names, () => true);
  }
  return names;
}

function collectImportClauseNames(
  importClause: ts.ImportClause,
  target: Set<string>,
  shouldCollect: (importedName: string, localName: string) => boolean,
): void {
  if (importClause.name) {
    const name = importClause.name.text;
    if (shouldCollect('default', name)) target.add(name);
  }
  const bindings = importClause.namedBindings;
  if (!bindings) return;
  if (ts.isNamespaceImport(bindings)) {
    const name = bindings.name.text;
    if (shouldCollect('*', name)) target.add(name);
    return;
  }
  for (const element of bindings.elements) {
    const importedName = element.propertyName?.text ?? element.name.text;
    const localName = element.name.text;
    if (shouldCollect(importedName, localName)) target.add(localName);
  }
}

function collectDeclaredAssertionHelpers(
  sourceFile: ts.SourceFile,
  context: AssertionContext,
): void {
  const visit = (node: ts.Node): void => {
    const name = declarationName(node);
    if (name && (isAssertionHelperName(name) || declarationBodyContainsAssertion(node, context))) {
      context.declaredAssertionHelpers.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function declarationName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}

function declarationBodyContainsAssertion(node: ts.Node, context: AssertionContext): boolean {
  let body: ts.Node | null = null;
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    body = node.body ?? null;
  } else if (ts.isVariableDeclaration(node) && node.initializer) {
    body = node.initializer;
  }
  if (!body) return false;

  let containsAssertion = false;
  const visit = (child: ts.Node): void => {
    if (containsAssertion) return;
    if (ts.isCallExpression(child) && classifyCallExpression(child, context)) {
      containsAssertion = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(body);
  return containsAssertion;
}

function classifyCallExpression(
  node: ts.CallExpression,
  context: AssertionContext,
): TestAssertionEvidence | null {
  const callee = expressionName(node.expression);
  if (!callee) return null;
  const calleeParts = callee.split('.');
  const leafName = calleeParts[calleeParts.length - 1] ?? callee;
  const rootName = calleeParts[0] ?? callee;
  const line = lineOf(context.sourceFile, node);

  if (SNAPSHOT_MATCHERS.has(leafName)) {
    return { kind: 'snapshot', callee, line };
  }
  if (context.importedExpectNames.has(rootName)) {
    return {
      kind: importedFromPlaywright(context.sourceFile, rootName)
        ? 'playwright_expect'
        : 'direct_expect',
      callee,
      line,
    };
  }
  if (context.importedNodeAssertNames.has(rootName)) {
    return { kind: 'node_assert', callee, line };
  }
  if (ASSERTION_METHOD_NAMES.has(leafName) && isAssertionRoot(rootName, context)) {
    return { kind: 'node_assert', callee, line };
  }
  if (SHOULD_NAMES.has(rootName) || callee.includes('.should.')) {
    return { kind: 'should_chain', callee, line };
  }
  if (isExpectMatcherName(leafName) && containsExpectCall(node.expression, context)) {
    return { kind: 'direct_expect', callee, line };
  }
  if (
    context.declaredAssertionHelpers.has(rootName) ||
    context.importedAssertionNames.has(rootName)
  ) {
    return {
      kind: isDatabaseAssertionName(rootName) ? 'db_assertion_helper' : 'custom_helper',
      callee,
      line,
    };
  }
  if (isDatabaseAssertionName(callee) || isAssertionHelperName(rootName)) {
    return {
      kind: isDatabaseAssertionName(callee) ? 'db_assertion_helper' : 'custom_helper',
      callee,
      line,
    };
  }
  return null;
}

function expressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const left = expressionName(expression.expression);
    return left ? `${left}.${expression.name.text}` : expression.name.text;
  }
  if (ts.isCallExpression(expression)) return expressionName(expression.expression);
  return null;
}

function containsExpectCall(expression: ts.Expression, context: AssertionContext): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = expressionName(node.expression);
      const rootName = callee?.split('.')[0] ?? '';
      if (context.importedExpectNames.has(rootName)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function isAssertionRoot(name: string, context: AssertionContext): boolean {
  return (
    DIRECT_ASSERT_NAMES.has(name) ||
    context.importedNodeAssertNames.has(name) ||
    context.declaredAssertionHelpers.has(name)
  );
}

function isAssertionHelperName(name: string): boolean {
  const words = splitIdentifierWords(name);
  return words.some((word) => ASSERTION_HELPER_TOKENS.includes(word));
}

function isDatabaseAssertionName(name: string): boolean {
  const words = splitIdentifierWords(name);
  return (
    words.some((word) => DB_TOKENS.includes(word)) &&
    words.some((word) => ASSERTION_HELPER_TOKENS.includes(word))
  );
}

function splitIdentifierWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function isExpectMatcherName(name: string): boolean {
  return EXPECT_MATCHER_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function stringLiteralText(node: ts.Expression): string | null {
  return ts.isStringLiteral(node) ? node.text : null;
}

function importedFromPlaywright(sourceFile: ts.SourceFile, localExpectName: string): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = stringLiteralText(statement.moduleSpecifier);
    if (moduleName !== '@playwright/test') continue;
    const names = new Set<string>();
    collectImportClauseNames(
      statement.importClause,
      names,
      (importedName, localName) => importedName === 'expect' || localName === localExpectName,
    );
    if (names.has(localExpectName)) return true;
  }
  return false;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
