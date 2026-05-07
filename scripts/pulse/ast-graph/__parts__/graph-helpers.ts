// PULSE — AST Graph Helpers
// Module graph builder, enclosing symbol finder, callee text extraction.

import { Node } from 'ts-morph';
import type { AstModuleGraph } from '../../types.ast-graph';
import { normalizePath } from './core-utils';

export function buildModuleGraph(file: import('ts-morph').SourceFile): AstModuleGraph | null {
  if (!file) return null;

  const filePath = normalizePath(file.getFilePath());

  const imports: AstModuleGraph['imports'] = [];
  try {
    for (const imp of file.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const namedImports = imp.getNamedImports().map((ni) => ni.getName());
      const isTypeOnly = imp.isTypeOnly();
      imports.push({
        source: moduleSpecifier,
        symbols: namedImports,
        isTypeOnly,
      });
    }
  } catch {
    // skip import parsing
  }

  const exports: AstModuleGraph['exports'] = [];
  try {
    for (const exp of file.getExportDeclarations()) {
      const namedExports = exp.getNamedExports();
      for (const ne of namedExports) {
        exports.push({
          name: ne.getName(),
          isReExport: !exp.isTypeOnly() && exp.getModuleSpecifierValue() != null,
          source: exp.getModuleSpecifierValue() ?? undefined,
        });
      }
    }
  } catch {
    // skip export parsing
  }

  return { filePath, imports, exports };
}

export function isInsideDecorator(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    if (Node.isDecorator(current)) return true;
    current = current.getParent();
  }
  return false;
}

export function findEnclosingSymbol(
  node: Node,
): { name: string; filePath: string; line: number } | null {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isClassDeclaration(current)
    ) {
      const nameNode = current as unknown as { getName?(): string };
      if (typeof nameNode.getName === 'function') {
        const name = nameNode.getName();
        if (name && name !== 'constructor') {
          return {
            name,
            filePath: normalizePath(current.getSourceFile().getFilePath()),
            line: current.getStartLineNumber(),
          };
        }
      }
    }
    if (Node.isArrowFunction(current)) {
      const parent = current.getParent();
      if (parent && Node.isVariableDeclaration(parent)) {
        return {
          name: parent.getName(),
          filePath: normalizePath(parent.getSourceFile().getFilePath()),
          line: parent.getStartLineNumber(),
        };
      }
    }
    current = current.getParent();
  }
  return null;
}

export function extractCalleeText(node: Node): string {
  try {
    if (Node.isCallExpression(node) || Node.isNewExpression(node)) {
      return node.getExpression().getText();
    }
    if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
      return node.getTagNameNode().getText();
    }
  } catch {
    return '<unknown>';
  }
  return '<unknown>';
}
