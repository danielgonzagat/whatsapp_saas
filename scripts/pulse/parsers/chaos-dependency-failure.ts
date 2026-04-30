/**
 * PULSE Parser 81: Chaos - Dependency Failure (STATIC)
 * Layer 13: Chaos Engineering
 *
 * STATIC analysis: derives dependency-failure diagnostics from syntax evidence.
 * No live infrastructure required.
 */

import * as path from 'path';
import ts from 'typescript';
import { readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

interface DependencyFailureObservation {
  file: string;
  line: number;
  dependencyPredicates: string[];
  hasDependencyBoundary: boolean;
  hasErrorBoundary: boolean;
  hasRecoveryBoundary: boolean;
  hasRetryPolicy: boolean;
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function shouldScanSourceFile(file: string): boolean {
  return !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(file);
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function identifierTokens(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasAnyToken(tokens: Set<string>, tokenGrammar: readonly string[]): boolean {
  return tokenGrammar.some((token) => tokens.has(token));
}

function callExpressionName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  return null;
}

function expressionRootName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return expressionRootName(node.expression);
  }
  return null;
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

function importSymbols(sourceFile: ts.SourceFile): Set<string> {
  const symbols = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text.startsWith('.')) {
      continue;
    }
    const clause = statement.importClause;
    if (!clause) {
      continue;
    }
    if (clause.name) {
      symbols.add(clause.name.text);
    }
    if (!clause.namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(clause.namedBindings)) {
      symbols.add(clause.namedBindings.name.text);
      continue;
    }
    for (const element of clause.namedBindings.elements) {
      symbols.add(element.name.text);
    }
  }
  return symbols;
}

function addPredicate(observation: DependencyFailureObservation, predicate: string): void {
  if (!observation.dependencyPredicates.includes(predicate)) {
    observation.dependencyPredicates.push(predicate);
  }
}

function markDependencyBoundary(
  observation: DependencyFailureObservation,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  predicate: string,
): void {
  const currentLine = lineNumber(sourceFile, node);
  observation.hasDependencyBoundary = true;
  observation.line = Math.min(observation.line === 1 ? currentLine : observation.line, currentLine);
  addPredicate(observation, predicate);
}

function objectLiteralHasResiliencePolicy(node: ts.ObjectLiteralExpression): boolean {
  return node.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false;
    }
    const name = propertyNameText(property.name);
    if (!name) {
      return false;
    }
    const tokens = identifierTokens(name);
    const initializerTokens = identifierTokens(property.initializer.getText());
    return (
      hasAnyToken(tokens, ['attempt', 'backoff', 'retry', 'fail', 'failure', 'recover']) ||
      hasAnyToken(initializerTokens, ['attempt', 'backoff', 'retry', 'fail', 'failure', 'recover'])
    );
  });
}

function observeDependencyFailureEvidence(
  file: string,
  content: string,
): DependencyFailureObservation {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports = importSymbols(sourceFile);
  const sourceTokens = identifierTokens(content);
  const observation: DependencyFailureObservation = {
    file,
    line: 1,
    dependencyPredicates: [],
    hasDependencyBoundary: false,
    hasErrorBoundary: false,
    hasRecoveryBoundary: false,
    hasRetryPolicy: false,
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTryStatement(node) && node.catchClause) {
      observation.hasErrorBoundary = true;
      observation.hasRecoveryBoundary = true;
    }

    if (ts.isCatchClause(node)) {
      observation.hasErrorBoundary = true;
      observation.hasRecoveryBoundary = true;
    }

    if (ts.isObjectLiteralExpression(node) && objectLiteralHasResiliencePolicy(node)) {
      observation.hasRetryPolicy = true;
      observation.hasRecoveryBoundary = true;
    }

    if (ts.isNewExpression(node)) {
      const root = expressionRootName(node.expression);
      if (root && imports.has(root)) {
        markDependencyBoundary(observation, sourceFile, node, 'imported-client-constructor');
      }
    }

    if (ts.isCallExpression(node)) {
      const name = callExpressionName(node.expression);
      const root = expressionRootName(node.expression);
      const nameTokens = identifierTokens(name ?? '');

      if (root && imports.has(root)) {
        markDependencyBoundary(observation, sourceFile, node, 'imported-client-call');
      }

      if (name && hasAnyToken(nameTokens, ['connect', 'create', 'client', 'queue', 'worker'])) {
        markDependencyBoundary(observation, sourceFile, node, 'dependency-factory-call');
      }

      if (hasAnyToken(nameTokens, ['catch', 'on', 'once', 'handle'])) {
        observation.hasErrorBoundary = true;
      }

      if (hasAnyToken(nameTokens, ['retry', 'backoff', 'recover', 'reconnect', 'degrade'])) {
        observation.hasRetryPolicy = true;
        observation.hasRecoveryBoundary = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  observation.hasErrorBoundary =
    observation.hasErrorBoundary || hasAnyToken(sourceTokens, ['catch', 'error', 'failure']);
  observation.hasRecoveryBoundary =
    observation.hasRecoveryBoundary ||
    hasAnyToken(sourceTokens, ['recover', 'reconnect', 'degrade', 'fallback']);
  observation.hasRetryPolicy =
    observation.hasRetryPolicy || hasAnyToken(sourceTokens, ['retry', 'backoff', 'attempt']);

  return observation;
}

function predicateToken(predicates: string[]): string {
  return predicates
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');
}

function dependencyFailureFinding(input: {
  observation: DependencyFailureObservation;
  config: PulseConfig;
  missingPredicate: string;
  description: string;
  detail: string;
}): Break {
  const predicates = [...input.observation.dependencyPredicates, input.missingPredicate];
  const token = predicateToken(predicates);
  return {
    type: `diagnostic:chaos-dependency-failure:${token || 'dependency-failure-observation'}`,
    severity: 'high',
    file: path.relative(input.config.rootDir, input.observation.file),
    line: input.observation.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:chaos-dependency-failure;predicates=${predicates.join(',')}`,
    surface: 'dependency-failure-resilience',
  };
}

function appendFinding(target: Break[], entry: Break): void {
  target.push(entry);
}

/** Check dependency failure resilience from static source evidence. */
export function checkChaosDependencyFailure(config: PulseConfig): Break[] {
  const findings: Break[] = [];
  const files = [...walkFiles(config.backendDir, ['.ts']), ...walkFiles(config.workerDir, ['.ts'])]
    .filter(shouldScanSourceFile)
    .sort();

  for (const file of files) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const observation = observeDependencyFailureEvidence(file, content);
    if (!observation.hasDependencyBoundary) {
      continue;
    }

    if (!observation.hasErrorBoundary) {
      appendFinding(
        findings,
        dependencyFailureFinding({
          observation,
          config,
          missingPredicate: 'error-boundary-not-observed',
          description: 'Dependency boundary has no static error-handling evidence',
          detail:
            'Add explicit error-boundary handling around dependency clients so connection failures are surfaced as diagnosable degraded states instead of unhandled process failures.',
        }),
      );
    }

    if (!observation.hasRecoveryBoundary) {
      appendFinding(
        findings,
        dependencyFailureFinding({
          observation,
          config,
          missingPredicate: 'recovery-boundary-not-observed',
          description: 'Dependency boundary has no recovery or degraded-state evidence',
          detail:
            'Record a recovery path such as reconnect handling, fallback state, degraded response, or equivalent failure outcome for unavailable dependencies.',
        }),
      );
    }

    if (!observation.hasRetryPolicy) {
      appendFinding(
        findings,
        dependencyFailureFinding({
          observation,
          config,
          missingPredicate: 'retry-policy-not-observed',
          description: 'Dependency boundary has no retry or backoff policy evidence',
          detail:
            'Add retry, backoff, or attempt-policy evidence where dependency work can be retried safely after transient failure.',
        }),
      );
    }
  }

  return findings;
}
