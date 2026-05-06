import * as ts from 'typescript';

export function locationOf(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { line: number; column: number } {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

export function symbolName(name: ts.Node | undefined): string {
  if (!name) {
    return 'anonymous';
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isBindingName(name)) {
    return name.getText();
  }
  return name.getText();
}

export function declarationName(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return symbolName(current.name);
    }
    if (ts.isPropertyAssignment(current)) {
      return symbolName(current.name);
    }
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) {
      return symbolName(current.name);
    }
    if (ts.isMethodDeclaration(current)) {
      return symbolName(current.name);
    }
    current = current.parent;
  }
  return 'anonymous';
}

export function stringLiteralValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

export function collectStringLiteralValues(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node): void => {
    const value = stringLiteralValue(child);
    if (value !== null) {
      values.push(value);
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return values;
}

export function collectionValues(node: ts.Node): string[] {
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => {
      const value = stringLiteralValue(element);
      return value === null ? [] : [value];
    });
  }

  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Set'
  ) {
    const firstArg = node.arguments?.[0];
    if (firstArg && ts.isArrayLiteralExpression(firstArg)) {
      return collectionValues(firstArg);
    }
  }

  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) {
        return [];
      }
      const key = symbolName(property.name);
      const value = stringLiteralValue(property.initializer);
      return value === null ? [key] : [key, value];
    });
  }

  return [];
}

export function compactEvidence(values: readonly string[]): string {
  const unique = [...new Set(values)].slice(0, 6);
  return unique.join(', ');
}

export function isRegexNode(node: ts.Node): boolean {
  if (ts.isRegularExpressionLiteral(node)) {
    return true;
  }
  return (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'RegExp'
  );
}

export function regexBody(node: ts.Node): string {
  if (ts.isRegularExpressionLiteral(node)) {
    return node.text;
  }
  if (ts.isNewExpression(node) && node.arguments?.[0]) {
    return node.arguments[0].getText();
  }
  return node.getText();
}

export function isIdentifierLike(value: string): boolean {
  const [firstChar] = value;
  if (
    !firstChar ||
    !(
      firstChar === '_' ||
      firstChar === '$' ||
      (firstChar >= 'A' && firstChar <= 'Z') ||
      (firstChar >= 'a' && firstChar <= 'z')
    )
  ) {
    return false;
  }
  return [...value.slice(1)].every(
    (char) =>
      char === '_' ||
      char === '$' ||
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9'),
  );
}

export function containsPathGrammar(body: string): boolean {
  for (let index = 0; index < body.length - 1; index++) {
    if (body[index] !== '/') {
      continue;
    }
    const next = body[index + 1];
    if (
      (next >= 'A' && next <= 'Z') ||
      (next >= 'a' && next <= 'z') ||
      (next >= '0' && next <= '9') ||
      next === '_' ||
      next === '*' ||
      next === ':' ||
      next === '.' ||
      next === '-'
    ) {
      return true;
    }
  }
  return false;
}

export function containsNumericDecisionGrammar(body: string): boolean {
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    const next = body[index + 1];
    if (char === '\\' && next === 'd') {
      return true;
    }
    if (char === '[' && next && next >= '0' && next <= '9') {
      return true;
    }
    if (char === '<' || char === '>') {
      return true;
    }
  }
  return false;
}

export function containsNamedCaptureGrammar(body: string): boolean {
  return body.includes('?<') && body.includes('>');
}

export function isDecisionTokenRegex(name: string, body: string): boolean {
  if (!isIdentifierLike(name)) {
    return false;
  }
  const hasBranchingAlternatives = body.includes('|');
  const hasPathPattern = containsPathGrammar(body);
  const hasNumericDecisionGrammar = containsNumericDecisionGrammar(body);
  const hasNamedCapture = containsNamedCaptureGrammar(body);
  return hasBranchingAlternatives || hasPathPattern || hasNumericDecisionGrammar || hasNamedCapture;
}

export function nearestFunctionLike(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export function nearestConditional(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isIfStatement(current) || ts.isConditionalExpression(current)) {
      return current;
    }
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

export function nodeContainsRegexPredicate(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isRegularExpressionLiteral(child)) {
      found = true;
      return;
    }
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      ['test', 'match', 'matchAll', 'exec'].includes(child.expression.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}
