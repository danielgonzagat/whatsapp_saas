import * as ts from 'typescript';
import { lower, startsWithAny } from './utils';
import type { FunctionRange } from './types';

export function collectFunctionRanges(sourceFile: ts.SourceFile, content: string): FunctionRange[] {
  const ranges: FunctionRange[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
      ranges.push({
        startLine: start,
        endLine: end,
        body: content.slice(node.getStart(sourceFile), node.getEnd()),
        node,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

export function findFunctionRange(
  ranges: readonly FunctionRange[],
  lineIndex: number,
): FunctionRange | null {
  return (
    ranges
      .filter((range) => range.startLine <= lineIndex && range.endLine >= lineIndex)
      .sort(
        (left, right) => left.endLine - left.startLine - (right.endLine - right.startLine),
      )[0] ?? null
  );
}

export function hasMutationCallEvidence(range: FunctionRange | null): boolean {
  if (!range) {
    return false;
  }
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && isMutationOrFetchName(expression.text)) {
        found = true;
        return;
      }
      if (ts.isPropertyAccessExpression(expression)) {
        const owner = expression.expression.getText();
        const member = expression.name.text;
        if (
          member === 'mutate' ||
          member === 'fetch' ||
          lower(owner).endsWith('api') ||
          lower(member).endsWith('api')
        ) {
          found = true;
          return;
        }
      }
    }
    if (ts.isAwaitExpression(node) && node.expression.getText().includes('fetch(')) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(range.node, visit);
  return found;
}

export function isMutationOrFetchName(name: string): boolean {
  const normalized = lower(name);
  return (
    normalized === 'apifetch' ||
    normalized === 'fetch' ||
    startsWithAny(normalized, [
      'create',
      'update',
      'delete',
      'reset',
      'upsert',
      'add',
      'remove',
      'move',
      'change',
      'upload',
      'invite',
      'approve',
      'revoke',
    ])
  );
}
