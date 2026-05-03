import * as ts from 'typescript';
import type { HardcodedFindingAuditFinding, HardcodedFindingAuditSource } from './types';
import { MIN_COLLECTION_SIZE, ALLOWLIST_NAME_RE, BREAK_TYPE_RE } from './types';
import {
  locationOf,
  symbolName,
  declarationName,
  stringLiteralValue,
  collectStringLiteralValues,
  collectionValues,
  compactEvidence,
  isRegexNode,
  regexBody,
  isDecisionTokenRegex,
  nearestFunctionLike,
  nearestConditional,
  nodeContainsRegexPredicate,
} from './ast-helpers';

export function isBreakObject(node: ts.ObjectLiteralExpression): boolean {
  return objectBreakType(node) !== null;
}

export function isBreaksPushArgument(node: ts.ObjectLiteralExpression): boolean {
  const parent = node.parent;
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node) {
    return false;
  }
  if (!ts.isPropertyAccessExpression(parent.expression)) {
    return false;
  }
  return (
    parent.expression.name.text === 'push' && parent.expression.expression.getText() === 'breaks'
  );
}

export function objectBreakType(node: ts.ObjectLiteralExpression): string | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (symbolName(property.name) !== 'type') {
      continue;
    }
    return stringLiteralValue(property.initializer);
  }
  return null;
}
