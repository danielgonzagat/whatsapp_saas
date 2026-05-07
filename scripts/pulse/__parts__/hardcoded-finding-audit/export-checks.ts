import * as ts from 'typescript';

export function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(
        ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      )
    : false;
}

export function isCallableDeclaration(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

export function initializerIsCallable(node: ts.VariableDeclaration): boolean {
  return Boolean(node.initializer && isCallableDeclaration(node.initializer));
}

export function hasStructuralParserSignal(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(child)) {
      const expression = child.expression;
      if (
        ts.isPropertyAccessExpression(expression) &&
        ['forEachChild', 'getText', 'getStart'].includes(expression.name.text)
      ) {
        found = true;
        return;
      }
      if (
        ts.isIdentifier(expression) &&
        ['createSourceFile', 'forEachChild'].includes(expression.text)
      ) {
        found = true;
        return;
      }
    }
    if (ts.isPropertyAccessExpression(child) && child.expression.getText() === 'ts') {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

export function hasExportedExecutableDeclaration(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
      found = true;
      return;
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          initializerIsCallable(declaration) ||
          ts.isObjectLiteralExpression(declaration.initializer)
        ) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
