/**
 * PULSE Parser 83: State Machine Checker
 * Layer 14: Business Logic Integrity
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * DIAGNOSTICS:
 * Syntax and token evidence are weak sensors only. They identify state
 * transition evidence that needs validation; they are not domain authority.
 *
 * CHECKS:
 * 1. Stateful flows must check current status before assigning a new terminal status
 * 2. Status changes that carry money-like state require an intermediate processing guard
 * 3. Authentication/session-like state transitions must not skip intermediate states
 * 5. Checks that state transition code uses a centralized state machine
 *    (not scattered `status = 'X'` assignments across multiple files)
 * 6. Checks that invalid transitions are explicitly rejected (throw, not silent ignore)
 *
 * REQUIRES: PULSE_DEEP=1
 * DIAGNOSTIC TYPES:
 *   Derived from observed predicates, for example:
 *   diagnostic:state-machine-checker:direct-status-assignment+missing-nearby-current-state-evidence
 */
import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type StateMachineTruthMode = 'weak_signal' | 'confirmed_static';

type StateMachineDiagnosticBreak = Break & {
  truthMode: StateMachineTruthMode;
};

interface StateMachineDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: StateMachineTruthMode;
}

function buildStateMachineDiagnostic(
  input: StateMachineDiagnosticInput,
): StateMachineDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:state-machine-checker:${predicateToken || 'state-transition-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:state-machine-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'state-machine',
    truthMode: input.truthMode,
  };
}

interface StateMutationSignal {
  line: number;
  text: string;
  hasNearbyGuard: boolean;
  hasNearbyIntermediateEvidence: boolean;
}

function splitIdentifier(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value) {
    const isAlphaNumeric = /[A-Za-z0-9]/.test(char);
    if (!isAlphaNumeric) {
      if (current) {
        words.push(current.toLowerCase());
        current = '';
      }
      continue;
    }
    if (current && /[a-z0-9]/.test(current[current.length - 1]) && /[A-Z]/.test(char)) {
      words.push(current.toLowerCase());
      current = char;
      continue;
    }
    current += char;
  }
  if (current) {
    words.push(current.toLowerCase());
  }
  return words;
}

function tokenSet(value: string): Set<string> {
  return new Set(splitIdentifier(value));
}

function propertyText(name: ts.PropertyName | undefined): string {
  if (!name) {
    return '';
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function hasStateToken(value: string): boolean {
  const tokens = tokenSet(value);
  return tokens.has('state') || tokens.has('status');
}

function hasTransitionToken(value: string): boolean {
  const tokens = tokenSet(value);
  return (
    tokens.has('transition') ||
    tokens.has('transitions') ||
    tokens.has('machine') ||
    tokens.has('fsm')
  );
}

function hasGuardToken(value: string): boolean {
  const tokens = tokenSet(value);
  return (
    hasTransitionToken(value) ||
    tokens.has('current') ||
    tokens.has('from') ||
    tokens.has('existing') ||
    tokens.has('previous') ||
    tokens.has('allowed') ||
    tokens.has('valid') ||
    tokens.has('can')
  );
}

function hasIntermediateToken(value: string): boolean {
  const tokens = tokenSet(value);
  return (
    tokens.has('pending') || tokens.has('processing') || tokens.has('in') || tokens.has('progress')
  );
}

function looksLikeTerminalLiteral(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized === normalized.toUpperCase();
}

function isStatePropertyAssignment(node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left)
  ) {
    return hasStateToken(node.left.name.text) && ts.isStringLiteralLike(node.right);
  }

  if (ts.isPropertyAssignment(node) && hasStateToken(propertyText(node.name))) {
    return ts.isStringLiteralLike(node.initializer);
  }

  return false;
}

function collectStateMutationSignals(
  sourceFile: ts.SourceFile,
  lines: string[],
): StateMutationSignal[] {
  const signals: StateMutationSignal[] = [];

  const visit = (node: ts.Node): void => {
    if (isStatePropertyAssignment(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const context = lines.slice(Math.max(0, line - 5), line + 2).join('\n');
      const wideContext = lines.slice(Math.max(0, line - 40), line + 2).join('\n');
      signals.push({
        line: line + 1,
        text: node.getText(sourceFile),
        hasNearbyGuard: hasGuardToken(context),
        hasNearbyIntermediateEvidence: hasIntermediateToken(wideContext),
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return signals;
}

function sourceHasStateEvidence(sourceFile: ts.SourceFile): boolean {
  return hasStateToken(sourceFile.getText()) || hasTransitionToken(sourceFile.getText());
}

function sourceHasTransitionAuthorityEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      hasTransitionToken(node.name?.getText(sourceFile) ?? '')
    ) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) && hasTransitionToken(node.expression.getText(sourceFile))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function sourceHasExplicitRejectionEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isThrowStatement(node) && hasStateToken(node.getText(sourceFile))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function sourceHasQuantityCoupledState(sourceFile: ts.SourceFile): boolean {
  let hasNumericStateNeighbor = false;
  const visit = (node: ts.Node): void => {
    if (hasNumericStateNeighbor) {
      return;
    }
    if (ts.isPropertyAssignment(node) || ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sourceFile);
      const tokens = tokenSet(text);
      if (
        hasStateToken(text) &&
        [...tokens].some((token) => token.endsWith('total') || token.endsWith('count'))
      ) {
        hasNumericStateNeighbor = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hasNumericStateNeighbor;
}

/** Check state machine. */
export function checkStateMachine(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  const directSetFiles: string[] = [];
  const transitionGuardFiles: string[] = [];

  for (const file of backendFiles) {
    if (file.endsWith('.spec.ts')) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    if (!sourceHasStateEvidence(sourceFile)) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');
    const mutationSignals = collectStateMutationSignals(sourceFile, lines);

    if (sourceHasTransitionAuthorityEvidence(sourceFile)) {
      transitionGuardFiles.push(relFile);
    }

    for (const signal of mutationSignals) {
      if (!signal.hasNearbyGuard) {
        directSetFiles.push(relFile);
        breaks.push(
          buildStateMachineDiagnostic({
            severity: 'high',
            file: relFile,
            line: signal.line,
            description: 'Static state-change signal lacks nearby current-state evidence',
            detail: `${signal.text.slice(0, 120)} - weak static signal from state mutation syntax; verify a current-state guard or transition validator before treating this as an invalid-transition finding`,
            predicateKinds: ['direct-status-assignment', 'missing-nearby-current-state-evidence'],
            truthMode: 'weak_signal',
          }),
        );
      }

      if (
        looksLikeTerminalLiteral(signal.text) &&
        sourceHasQuantityCoupledState(sourceFile) &&
        !signal.hasNearbyIntermediateEvidence
      ) {
        breaks.push(
          buildStateMachineDiagnostic({
            severity: 'critical',
            file: relFile,
            line: signal.line,
            description: 'Quantity-coupled state-change signal lacks intermediate-state evidence',
            detail: `${signal.text.slice(0, 120)} - weak static signal from quantity-coupled terminal state syntax; verify the transition source of truth before treating this as a skipped-intermediate-state finding`,
            predicateKinds: [
              'quantity-coupled-content',
              'terminal-status-syntax',
              'missing-intermediate-evidence',
            ],
            truthMode: 'weak_signal',
          }),
        );
      }
    }
  }

  if (transitionGuardFiles.length === 0 && directSetFiles.length > 3) {
    breaks.push(
      buildStateMachineDiagnostic({
        severity: 'high',
        file: path.relative(config.rootDir, config.backendDir),
        line: 0,
        description: `Static scan found state-change signals across ${directSetFiles.length} files without transition authority evidence`,
        detail:
          'Syntax evidence did not identify a transition authority. This is a weak architecture signal; confirm the real transition authority before prescribing a module shape.',
        predicateKinds: ['direct-status-assignment-files', 'missing-transition-authority-evidence'],
        truthMode: 'weak_signal',
      }),
    );
  }

  for (const file of backendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    if (!sourceHasStateEvidence(sourceFile)) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const mutationSignals = collectStateMutationSignals(sourceFile, content.split('\n'));

    if (mutationSignals.length > 0 && !sourceHasExplicitRejectionEvidence(sourceFile)) {
      breaks.push(
        buildStateMachineDiagnostic({
          severity: 'high',
          file: relFile,
          line: 0,
          description: 'Static state-change signal lacks explicit rejection evidence',
          detail:
            'Weak static scan found state mutation syntax without throw evidence tied to state tokens. Confirm the real transition authority before prescribing exception text.',
          predicateKinds: [
            'direct-status-assignment',
            'missing-invalid-transition-rejection-evidence',
          ],
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // TODO: Implement when infrastructure available
  // - Runtime state machine validation against live DB
  // - Detection of orphaned records stuck in intermediate states
  // - Automated state transition diagram generation

  return breaks;
}
