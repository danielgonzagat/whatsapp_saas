import { Node } from 'ts-morph';
import type { AstTargetSymbol, AstTypeChecker, TsMorphSymbol } from './constants';

export function resolveAliasedSymbol(
  symbol: TsMorphSymbol | undefined,
  typeChecker: AstTypeChecker,
): AstTargetSymbol | null {
  if (!symbol) return null;

  try {
    return (typeChecker.getAliasedSymbol(symbol) ?? symbol) as AstTargetSymbol;
  } catch {
    return symbol as AstTargetSymbol;
  }
}

export function resolveCallExpression(
  node: Node,
  typeChecker: AstTypeChecker,
): { resolved: boolean; targetSymbol: AstTargetSymbol | null; genericArgs: string[] } {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      const symbol = resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed, leave unresolved
  }

  try {
    if (Node.isCallExpression(node)) {
      const typeArgs = node.getTypeArguments();
      for (const ta of typeArgs) {
        genericArgs.push(ta.getText());
      }
    }
  } catch {
    // no type arguments or resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}

export function resolveNewExpression(
  node: Node,
  typeChecker: AstTypeChecker,
): {
  resolved: boolean;
  targetSymbol: AstTargetSymbol | null;
  genericArgs: string[];
} {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isNewExpression(node)) {
      const expression = node.getExpression();
      const symbol = resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed
  }

  try {
    if (Node.isNewExpression(node)) {
      const typeArgs = node.getTypeArguments();
      for (const ta of typeArgs) {
        genericArgs.push(ta.getText());
      }
    }
  } catch {
    // no type arguments
  }

  return { resolved, targetSymbol, genericArgs };
}

export function resolveDecorator(
  node: Node,
  typeChecker: AstTypeChecker,
): {
  resolved: boolean;
  targetSymbol: AstTargetSymbol | null;
  genericArgs: string[];
} {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    if (Node.isDecorator(node)) {
      const expression = node.getExpression();
      const symbol = Node.isCallExpression(expression)
        ? resolveAliasedSymbol(expression.getExpression().getSymbol(), typeChecker)
        : resolveAliasedSymbol(expression.getSymbol(), typeChecker);
      if (symbol) {
        targetSymbol = symbol;
        resolved = true;
      }
    }
  } catch {
    // resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}

export function resolveJsxElement(
  node: Node & { getTagNameNode(): { getSymbol(): ReturnType<Node['getSymbol']> } },
  typeChecker: AstTypeChecker,
): { resolved: boolean; targetSymbol: AstTargetSymbol | null; genericArgs: string[] } {
  const genericArgs: string[] = [];
  let targetSymbol: AstTargetSymbol | null = null;
  let resolved = false;

  try {
    const tagNode = node.getTagNameNode();
    const symbol = resolveAliasedSymbol(tagNode.getSymbol(), typeChecker);
    if (symbol) {
      targetSymbol = symbol;
      resolved = true;
    }
  } catch {
    // resolution failed
  }

  return { resolved, targetSymbol, genericArgs };
}
