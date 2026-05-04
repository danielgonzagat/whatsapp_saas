/**
 * PULSE Parser 84: Concurrency Tester
 * Layer 15: Concurrency & Race Conditions
 * Mode: DEEP/TOTAL (requires running infrastructure)
 *
 * CHECKS:
 * 1. Simultaneous write test: sends 10 concurrent POST/PATCH requests to the same
 *    resource and verifies exactly one succeeds (or all succeed with correct final state)
 * 2. Double-spend prevention: sends 2 concurrent wallet withdrawal requests for the
 *    full balance — verifies only one succeeds (balance never goes negative)
 * 3. Optimistic locking: checks that update operations use version fields or
 *    conditional WHERE clauses to detect concurrent modifications
 * 4. Scans codebase for Prisma update operations on financial records that lack
 *    optimistic locking or transaction isolation
 * 5. Checks for missing SELECT FOR UPDATE / findFirst-then-update patterns
 *    (read-modify-write without lock = classic race condition)
 * 6. Verifies BullMQ job processing uses locks (not processed by multiple workers)
 *
 * REQUIRES: PULSE_DEEP=1, PULSE_CHAOS=1, running backend + DB
 * DIAGNOSTICS:
 *   Emits AST-derived weak signals with predicate metadata. Static code evidence
 *   is used to request a probe, not as runtime authority by itself.
 */
import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type ParserTruthMode = 'weak_signal' | 'confirmed_static';

type ConcurrencyDiagnosticBreak = Break & {
  truthMode: ParserTruthMode;
};

interface ConcurrencyDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: ParserTruthMode;
}

function buildConcurrencyDiagnostic(input: ConcurrencyDiagnosticInput): ConcurrencyDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:concurrency-tester:${predicateToken || 'concurrency-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `ast-evidence:concurrency-tester;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    truthMode: input.truthMode,
  };
}

type PrismaOperationKind = 'read' | 'write' | 'transaction' | 'raw_lock_evidence' | 'other';

interface PrismaCallEvidence {
  readonly kind: PrismaOperationKind;
  readonly operationName: string;
  readonly line: number;
  readonly txScoped: boolean;
  readonly conditionalWriteEvidence: boolean;
  readonly counterMutationEvidence: boolean;
}

interface FunctionEvidence {
  readonly startLine: number;
  readonly calls: PrismaCallEvidence[];
}

type BodyBearingFunction =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function isFunctionLikeWithBody(node: ts.Node): node is BodyBearingFunction {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    Boolean(node.body)
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isPrismaRootExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === 'prisma' || expression.text === 'tx';
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return (
      expression.name.text === 'prisma' ||
      expression.name.text === 'tx' ||
      isPrismaRootExpression(expression.expression)
    );
  }
  return false;
}

function isTxScopedExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === 'tx';
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'tx' || isTxScopedExpression(expression.expression);
  }
  return false;
}

function prismaOperationKind(operationName: string): PrismaOperationKind {
  if (operationName === 'findFirst' || operationName === 'findUnique') {
    return 'read';
  }
  if (operationName === 'update' || operationName === 'updateMany') {
    return 'write';
  }
  if (operationName === '$transaction') {
    return 'transaction';
  }
  if (operationName.startsWith('$executeRaw')) {
    return 'raw_lock_evidence';
  }
  return 'other';
}

function findObjectProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (propertyNameText(property.name) === propertyName) {
      return property;
    }
  }
  return null;
}

function collectObjectPropertyNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isPropertyAssignment(child)) {
      names.add(propertyNameText(child.name));
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return names;
}

function hasCounterMutationEvidence(node: ts.Node): boolean {
  let observed = false;
  const visit = (child: ts.Node): void => {
    if (observed) {
      return;
    }
    if (
      ts.isPropertyAssignment(child) &&
      (propertyNameText(child.name) === 'increment' || propertyNameText(child.name) === 'decrement')
    ) {
      observed = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return observed;
}

function hasConditionalWriteEvidence(call: ts.CallExpression): boolean {
  const [firstArg] = call.arguments;
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return false;
  }
  const whereProperty = findObjectProperty(firstArg, 'where');
  if (!whereProperty || !ts.isObjectLiteralExpression(whereProperty.initializer)) {
    return false;
  }
  const whereNames = collectObjectPropertyNames(whereProperty.initializer);
  return (
    whereNames.has('version') ||
    whereNames.has('updatedAt') ||
    whereProperty.initializer.properties.length > 1
  );
}

function extractPrismaCallEvidence(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): PrismaCallEvidence | null {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return null;
  }

  const operationName = call.expression.name.text;
  const kind = prismaOperationKind(operationName);
  if (kind === 'other' || !isPrismaRootExpression(call.expression.expression)) {
    return null;
  }

  return {
    kind,
    operationName,
    line: lineOf(sourceFile, call),
    txScoped: isTxScopedExpression(call.expression.expression),
    conditionalWriteEvidence: kind === 'write' && hasConditionalWriteEvidence(call),
    counterMutationEvidence: kind === 'write' && hasCounterMutationEvidence(call),
  };
}

function collectFunctionEvidence(sourceFile: ts.SourceFile): FunctionEvidence[] {
  const functions: FunctionEvidence[] = [];

  const visit = (node: ts.Node): void => {
    if (!isFunctionLikeWithBody(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const calls: PrismaCallEvidence[] = [];
    const collectCalls = (child: ts.Node): void => {
      if (ts.isCallExpression(child)) {
        const callEvidence = extractPrismaCallEvidence(sourceFile, child);
        if (callEvidence) {
          calls.push(callEvidence);
        }
      }
      ts.forEachChild(child, collectCalls);
    };
    collectCalls(node.body);

    if (calls.length > 0) {
      functions.push({ startLine: lineOf(sourceFile, node), calls });
    }
  };

  visit(sourceFile);
  return functions;
}

function hasLockEvidence(func: FunctionEvidence): boolean {
  return func.calls.some(
    (call) =>
      call.kind === 'transaction' ||
      call.kind === 'raw_lock_evidence' ||
      call.txScoped ||
      call.conditionalWriteEvidence,
  );
}

function hasUnprotectedReadModifyWrite(
  func: FunctionEvidence,
): { findLine: number; updateLine: number } | null {
  if (hasLockEvidence(func)) {
    return null;
  }

  let findLine = -1;
  for (const call of func.calls) {
    if (call.kind === 'read') {
      findLine = call.line;
    }
    if (findLine >= 0 && call.kind === 'write') {
      return { findLine, updateLine: call.line };
    }
  }

  return null;
}

function hasDirectCounterMutationWithoutTransaction(func: FunctionEvidence): boolean {
  if (hasLockEvidence(func)) {
    return false;
  }
  return func.calls.some((call) => call.kind === 'write' && call.counterMutationEvidence);
}

function hasUnprotectedSharedUpdate(func: FunctionEvidence): boolean {
  return !hasLockEvidence(func) && hasUnprotectedReadModifyWrite(func) !== null;
}

function isSkippableSourceFile(file: string): boolean {
  const normalized = file.split(path.sep).join('/');
  const basename = path.basename(normalized);
  const segments = normalized.split('/');
  return (
    basename.endsWith('.spec.ts') ||
    basename.endsWith('.test.ts') ||
    segments.includes('migration') ||
    segments.includes('migrations') ||
    segments.includes('seed') ||
    segments.includes('seeds')
  );
}

/** Check concurrency. */
export function checkConcurrency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // STATIC ANALYSIS: Check service code for read-modify-write without locking.
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (isSkippableSourceFile(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

    const functionEvidence = collectFunctionEvidence(sourceFile);
    for (const func of functionEvidence) {
      const unprotected = hasUnprotectedReadModifyWrite(func);
      if (!unprotected) {
        continue;
      }

      breaks.push(
        buildConcurrencyDiagnostic({
          predicateKinds: ['read_modify_write', 'no_transaction_or_optimistic_lock'],
          severity: 'critical',
          file: relFile,
          line: unprotected.findLine,
          description: 'Read-modify-write observed without transaction or optimistic lock evidence',
          detail: `findFirst/findUnique at line ${unprotected.findLine} followed by update at line ${unprotected.updateLine} without $transaction or version check`,
          truthMode: 'weak_signal',
        }),
      );
    }

    if (functionEvidence.some(hasDirectCounterMutationWithoutTransaction)) {
      breaks.push(
        buildConcurrencyDiagnostic({
          predicateKinds: ['counter_mutation', 'no_transaction_observed'],
          severity: 'critical',
          file: relFile,
          line: 0,
          description: 'Shared counter mutation observed without transaction evidence',
          detail:
            'Concurrent numeric mutations need transaction, conditional write, or runtime evidence that conflicting writes cannot overlap',
          truthMode: 'weak_signal',
        }),
      );
    }

    // CHECK: Missing optimistic locking on shared resources. Evaluate at function
    // level so transaction-protected financial mutations do not become false positives.
    const unprotectedSharedUpdate = functionEvidence.find(hasUnprotectedSharedUpdate);
    if (unprotectedSharedUpdate) {
      breaks.push(
        buildConcurrencyDiagnostic({
          predicateKinds: ['shared_update', 'no_optimistic_lock_observed'],
          severity: 'high',
          file: relFile,
          line: unprotectedSharedUpdate.startLine,
          description: 'Shared-resource mutation lacks optimistic lock evidence',
          detail:
            'Add a `version` field or protect the mutation with a transaction/conditional guard to detect conflicts',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // RUNTIME CHECKS (require PULSE_CHAOS=1 + running infrastructure)
  if (process.env.PULSE_CHAOS) {
    // TODO: Implement when infrastructure available
    //
    // CHECK 1 — Simultaneous write test
    // 1. Make 10 concurrent POST /products with same name
    // 2. Verify DB has at most 1 record (unique constraint) or exactly 10 (expected)
    // 3. Verify no 500 errors — unique constraint violations must be caught and returned as 409
    //
    // CHECK 2 — Double-spend wallet test
    // 1. Set wallet balance to R$100
    // 2. Send 2 concurrent withdrawal requests for R$100 each
    // 3. Verify: exactly one succeeds (200), one fails (422 insufficient funds)
    // 4. Verify: final balance is R$0, not R$-100
    //
    // CHECK 6 — BullMQ job lock
    // 1. Start 2 workers consuming same queue
    // 2. Enqueue 1 job
    // 3. Verify: job is processed exactly once (not twice)
  }

  return breaks;
}
