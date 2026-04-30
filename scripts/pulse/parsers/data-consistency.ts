/**
 * PULSE Parser 63: Data Consistency
 * Layer 7: Database Health
 * Mode: STATIC
 *
 * Verifies that critical mutating service code has local evidence of
 * application-level consistency checks before it writes durable state.
 */

import * as path from 'path';
import * as ts from 'typescript';
import { walkFiles, readFileSafe } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';

type ConsistencyBreakKind =
  | 'unvalidatedNumericWrite'
  | 'nonAtomicDecrease'
  | 'unvalidatedRelationalWrite'
  | 'orphanedRelationalCreate';

const DATA_CONSISTENCY_BREAK_TYPE_GRAMMAR: Record<ConsistencyBreakKind, Break['type']> = {
  unvalidatedNumericWrite: 'DATA_PRODUCT_NO_PLAN',
  nonAtomicDecrease: 'DATA_ORDER_NO_PAYMENT',
  unvalidatedRelationalWrite: 'DATA_WORKSPACE_NO_OWNER',
  orphanedRelationalCreate: 'DATA_WORKSPACE_NO_OWNER',
};

const PRISMA_MUTATION_KERNEL_GRAMMAR = new Set([
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
]);

const PRISMA_READ_KERNEL_GRAMMAR = new Set(['count', 'findFirst', 'findMany', 'findUnique']);
const NUMERIC_SCHEMA_KERNEL_GRAMMAR = new Set(['BigInt', 'Decimal', 'Float', 'Int']);

interface PrismaModelEvidence {
  accessor: string;
  hasNumericField: boolean;
  hasRelationField: boolean;
}

interface FunctionEvidence {
  name: string;
  body: string;
  startLine: number;
  firstWritePosition: number | null;
  hasValidationBeforeWrite: boolean;
  writesNumericState: boolean;
  writesRelationalState: boolean;
  decreasesState: boolean;
  hasTransaction: boolean;
  hasNestedRelationshipSeed: boolean;
  createAccessorCount: number;
}

interface PrismaMutationEvidence {
  methodName: string;
  accessor: string | null;
  position: number;
  dataArgument: ts.ObjectLiteralExpression | null;
}

interface PrismaSchemaEvidence {
  modelsByAccessor: Map<string, PrismaModelEvidence>;
}

function consistencyBreakType(kind: ConsistencyBreakKind): Break['type'] {
  return DATA_CONSISTENCY_BREAK_TYPE_GRAMMAR[kind];
}

function prismaAccessorForModel(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function collectPrismaSchemaEvidence(schemaPath: string | undefined): PrismaSchemaEvidence {
  const evidence: PrismaSchemaEvidence = {
    modelsByAccessor: new Map(),
  };
  if (!schemaPath || !pathExists(schemaPath)) {
    return evidence;
  }

  let schemaContent: string;
  try {
    schemaContent = readTextFile(schemaPath, 'utf8');
  } catch {
    return evidence;
  }

  const modelBlockKernelGrammar = /\bmodel\s+([A-Za-z]\w*)\s*\{([\s\S]*?)\n\s*\}/g;
  for (const match of schemaContent.matchAll(modelBlockKernelGrammar)) {
    const modelName = match[1];
    const modelBody = match[2];
    if (!modelName || !modelBody) {
      continue;
    }
    const fieldLines = modelBody
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'));
    const modelEvidence: PrismaModelEvidence = {
      accessor: prismaAccessorForModel(modelName),
      hasNumericField: fieldLines.some((line) =>
        line
          .split(/\s+/)
          .slice(1)
          .some((token) => NUMERIC_SCHEMA_KERNEL_GRAMMAR.has(token.replace(/[?[\]]/g, ''))),
      ),
      hasRelationField: fieldLines.some((line) => line.includes('@relation')),
    };
    evidence.modelsByAccessor.set(modelEvidence.accessor, modelEvidence);
  }

  return evidence;
}

function isSkippedServiceFile(file: string): boolean {
  return !file.endsWith('.service.ts') || file.includes('.spec.') || file.includes('.test.');
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (!name) {
    return null;
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function calledMethodName(node: ts.CallExpression): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  return node.expression.name.text;
}

function prismaAccessorFromCall(node: ts.CallExpression): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  const target = node.expression.expression;
  if (!ts.isPropertyAccessExpression(target)) {
    return null;
  }
  return target.name.text;
}

function hasPrismaRoot(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  let current: ts.Expression = node.expression.expression;
  while (ts.isPropertyAccessExpression(current)) {
    if (current.name.text === 'prisma') {
      return true;
    }
    current = current.expression;
  }
  return ts.isIdentifier(current) && current.text === 'tx';
}

function objectProperty(
  node: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (propertyNameText(property.name) === propertyName) {
      return property.initializer;
    }
  }
  return null;
}

function dataArgumentFromCall(node: ts.CallExpression): ts.ObjectLiteralExpression | null {
  const [firstArgument] = node.arguments;
  if (!firstArgument || !ts.isObjectLiteralExpression(firstArgument)) {
    return null;
  }
  const dataValue = objectProperty(firstArgument, 'data');
  return dataValue && ts.isObjectLiteralExpression(dataValue) ? dataValue : null;
}

function isNumericExpression(node: ts.Node): boolean {
  if (ts.isNumericLiteral(node)) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    return true;
  }
  return false;
}

function objectHasNumericValue(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (isNumericExpression(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function objectHasNestedObjectValue(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false;
    }
    const value = property.initializer;
    return ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value);
  });
}

function mutationHasNestedRelationshipSeed(mutation: PrismaMutationEvidence): boolean {
  return Boolean(
    mutation.methodName === 'create' &&
    mutation.dataArgument &&
    objectHasNestedObjectValue(mutation.dataArgument),
  );
}

function objectHasDecreaseOperator(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isPropertyAssignment(child) && propertyNameText(child.name) === 'decrement') {
      found = true;
      return;
    }
    if (
      ts.isPrefixUnaryExpression(child) &&
      (child.operator === ts.SyntaxKind.MinusToken ||
        child.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      found = true;
      return;
    }
    if (
      ts.isBinaryExpression(child) &&
      child.operatorToken.kind === ts.SyntaxKind.MinusToken &&
      objectHasNumericValue(child.right)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function collectPrismaCalls(
  sourceFile: ts.SourceFile,
  body: string,
): { reads: number[]; mutations: PrismaMutationEvidence[]; hasTransaction: boolean } {
  const bodyFile = ts.createSourceFile(sourceFile.fileName, body, ts.ScriptTarget.Latest, true);
  const reads: number[] = [];
  const mutations: PrismaMutationEvidence[] = [];
  let hasTransaction = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const methodName = calledMethodName(node);
      if (methodName && hasPrismaRoot(node)) {
        if (methodName === '$transaction') {
          hasTransaction = true;
        }
        if (PRISMA_READ_KERNEL_GRAMMAR.has(methodName)) {
          reads.push(node.getStart(bodyFile));
        }
        if (PRISMA_MUTATION_KERNEL_GRAMMAR.has(methodName)) {
          mutations.push({
            methodName,
            accessor: prismaAccessorFromCall(node),
            position: node.getStart(bodyFile),
            dataArgument: dataArgumentFromCall(node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(bodyFile);
  return { reads, mutations, hasTransaction };
}

function functionLikeName(node: ts.Node): string | null {
  if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
    return node.name ? propertyNameText(node.name) : null;
  }
  if (
    ts.isVariableDeclaration(node.parent) &&
    (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return null;
}

function isReadOnlyFunctionName(name: string): boolean {
  const firstToken = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/)[0];
  return Boolean(firstToken && PRISMA_READ_KERNEL_GRAMMAR.has(firstToken));
}

function functionBodyText(node: ts.FunctionLikeDeclarationBase, sourceFile: ts.SourceFile): string {
  return node.body ? node.body.getText(sourceFile) : '';
}

function isFunctionWithBody(node: ts.Node): node is ts.FunctionLikeDeclarationBase {
  return (
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function extractFunctionEvidence(
  content: string,
  file: string,
  schemaEvidence: PrismaSchemaEvidence,
): FunctionEvidence[] {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const functions: FunctionEvidence[] = [];

  const visit = (node: ts.Node): void => {
    if (isFunctionWithBody(node) && node.body) {
      const name = functionLikeName(node);
      if (name && !isReadOnlyFunctionName(name)) {
        const body = functionBodyText(node, sourceFile);
        const calls = collectPrismaCalls(sourceFile, body);
        const firstWritePosition =
          calls.mutations.length > 0
            ? Math.min(...calls.mutations.map((mutation) => mutation.position))
            : null;
        const hasValidationBeforeWrite =
          firstWritePosition !== null &&
          calls.reads.some((position) => position < firstWritePosition);
        const createAccessors = new Set(
          calls.mutations
            .filter((mutation) => mutation.methodName === 'create' && mutation.accessor)
            .map((mutation) => mutation.accessor),
        );
        const writesNumericState = calls.mutations.some((mutation) => {
          const modelEvidence = mutation.accessor
            ? schemaEvidence.modelsByAccessor.get(mutation.accessor)
            : null;
          return Boolean(
            modelEvidence?.hasNumericField || objectHasNumericValue(mutation.dataArgument ?? node),
          );
        });
        const writesRelationalState = calls.mutations.some((mutation) => {
          const modelEvidence = mutation.accessor
            ? schemaEvidence.modelsByAccessor.get(mutation.accessor)
            : null;
          return Boolean(
            modelEvidence?.hasRelationField ||
            (mutation.dataArgument && objectHasNestedObjectValue(mutation.dataArgument)),
          );
        });
        const hasNestedRelationshipSeed = calls.mutations.some((mutation) =>
          mutationHasNestedRelationshipSeed(mutation),
        );

        functions.push({
          name,
          body,
          startLine: lineNumber(sourceFile, node),
          firstWritePosition,
          hasValidationBeforeWrite,
          writesNumericState,
          writesRelationalState,
          decreasesState: calls.mutations.some((mutation) =>
            objectHasDecreaseOperator(mutation.dataArgument ?? node),
          ),
          hasTransaction: calls.hasTransaction,
          hasNestedRelationshipSeed,
          createAccessorCount: createAccessors.size,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return functions;
}

function isConsistencyCriticalService(
  content: string,
  file: string,
  schemaEvidence: PrismaSchemaEvidence,
): boolean {
  return extractFunctionEvidence(content, file, schemaEvidence).some(
    (fn) => fn.firstWritePosition !== null && (fn.writesNumericState || fn.writesRelationalState),
  );
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

/** Check data consistency. */
export function checkDataConsistency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const schemaEvidence = collectPrismaSchemaEvidence(config.schemaPath);

  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  const criticalServiceFiles = backendFiles.filter((file) => {
    if (isSkippedServiceFile(file)) {
      return false;
    }
    const content = readFileSafe(file);
    return isConsistencyCriticalService(content, file, schemaEvidence);
  });

  for (const file of criticalServiceFiles) {
    const content = readFileSafe(file);
    if (!content) {
      continue;
    }

    const fileName = path.basename(file);
    const functions = extractFunctionEvidence(content, file, schemaEvidence);

    for (const fn of functions) {
      if (fn.firstWritePosition !== null && !fn.hasValidationBeforeWrite) {
        if (fn.writesNumericState) {
          pushBreak(breaks, {
            type: consistencyBreakType('unvalidatedNumericWrite'),
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Numeric durable write without prior existence validation in ${fileName}`,
            detail:
              `Function '${fn.name}' performs a write operation without a read guard before the write. ` +
              'A numeric state record could be created for an invalid or unauthorized reference.',
          });
        } else if (fn.writesRelationalState) {
          pushBreak(breaks, {
            type: consistencyBreakType('unvalidatedRelationalWrite'),
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Relational durable write without prior validation in ${fileName}`,
            detail:
              `Function '${fn.name}' mutates relational state without first validating referenced ` +
              'records through a local read guard.',
          });
        }
      }

      if (fn.decreasesState && !fn.hasTransaction) {
        pushBreak(breaks, {
          type: consistencyBreakType('nonAtomicDecrease'),
          severity: 'high',
          file,
          line: fn.startLine,
          description: `State-decreasing function '${fn.name}' may not validate state atomically`,
          detail:
            `${fileName}: '${fn.name}' decreases durable state without a Prisma transaction boundary. ` +
            'Concurrent writes can violate consistency unless the validation and mutation are atomic.',
        });
      }

      if (
        fn.writesRelationalState &&
        !fn.hasNestedRelationshipSeed &&
        fn.createAccessorCount === 1
      ) {
        pushBreak(breaks, {
          type: consistencyBreakType('orphanedRelationalCreate'),
          severity: 'high',
          file,
          line: fn.startLine,
          description: `Relational create in '${fn.name}' has no sibling relationship seed`,
          detail:
            `${fileName}: '${fn.name}' creates relational state but does not show a sibling create ` +
            'or nested relationship seed in the same function body.',
        });
      }
    }
  }

  return breaks;
}
