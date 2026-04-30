import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface SourceObservation {
  file: string;
  line: number;
  hasOutboundCall: boolean;
  hasErrorBoundary: boolean;
  hasTimeoutControl: boolean;
  hasRecoveryAction: boolean;
  predicates: string[];
}

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function shouldScanFile(file: string): boolean {
  return !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(file);
}

function splitIdentifierTokens(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasAnyToken(tokens: Set<string>, values: readonly string[]): boolean {
  return values.some((value) => tokens.has(value));
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

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function sourceObservation(file: string, content: string): SourceObservation {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const allTokens = splitIdentifierTokens(content);
  const observation: SourceObservation = {
    file,
    line: 1,
    hasOutboundCall: false,
    hasErrorBoundary: false,
    hasTimeoutControl: false,
    hasRecoveryAction: false,
    predicates: [],
  };

  const markOutboundCall = (node: ts.Node, predicate: string): void => {
    const currentLine = lineNumber(sourceFile, node);
    observation.hasOutboundCall = true;
    observation.line = Math.min(
      observation.line === 1 ? currentLine : observation.line,
      currentLine,
    );
    if (!observation.predicates.includes(predicate)) {
      observation.predicates.push(predicate);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTryStatement(node) && node.catchClause) {
      observation.hasErrorBoundary = true;
    }
    if (ts.isCatchClause(node)) {
      observation.hasErrorBoundary = true;
    }
    if (ts.isCallExpression(node)) {
      const name = callExpressionName(node.expression);
      if (name) {
        const tokens = splitIdentifierTokens(name);
        if (
          hasAnyToken(tokens, ['fetch', 'request', 'send']) ||
          (hasAnyToken(tokens, ['get', 'post', 'put', 'patch', 'delete']) &&
            hasAnyToken(allTokens, ['http', 'url', 'endpoint']))
        ) {
          markOutboundCall(node, 'outbound-call');
        }
        if (hasAnyToken(tokens, ['catch', 'finally'])) {
          observation.hasErrorBoundary = true;
        }
        if (hasAnyToken(tokens, ['timeout', 'abort'])) {
          observation.hasTimeoutControl = true;
        }
        if (hasAnyToken(tokens, ['retry', 'reconnect', 'fallback', 'degrade', 'degraded'])) {
          observation.hasRecoveryAction = true;
        }
      }
    }
    if (ts.isNewExpression(node)) {
      const name = callExpressionName(node.expression);
      if (name) {
        const tokens = splitIdentifierTokens(name);
        if (hasAnyToken(tokens, ['client']) && hasAnyToken(allTokens, ['url', 'endpoint', 'api'])) {
          markOutboundCall(node, 'dependency-client');
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  observation.hasTimeoutControl =
    observation.hasTimeoutControl ||
    hasAnyToken(allTokens, ['timeout', 'abort', 'signal', 'deadline', 'ttl']);
  observation.hasRecoveryAction =
    observation.hasRecoveryAction ||
    hasAnyToken(allTokens, ['retry', 'backoff', 'fallback', 'degraded', 'reconnect', 'queue']);
  observation.hasErrorBoundary =
    observation.hasErrorBoundary || hasAnyToken(allTokens, ['catch', 'error', 'exception']);

  return observation;
}

function predicateToken(predicates: string[]): string {
  return predicates
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');
}

function chaosFinding(input: {
  observation: SourceObservation;
  config: PulseConfig;
  missingPredicate: string;
  description: string;
  detail: string;
}): Break {
  const token = predicateToken([...input.observation.predicates, input.missingPredicate]);
  return {
    type: `diagnostic:chaos-third-party:${token || 'external-dependency-observation'}`,
    severity: 'high',
    file: path.relative(input.config.rootDir, input.observation.file),
    line: input.observation.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:chaos-third-party;predicates=${[
      ...input.observation.predicates,
      input.missingPredicate,
    ].join(',')}`,
    surface: 'external-dependency-resilience',
  };
}

function appendBreak(target: Break[], entry: Break): void {
  target.push(entry);
}

/** Check third-party dependency resilience from dynamic source evidence. */
export function checkChaosThirdParty(config: PulseConfig): Break[] {
  const findings: Break[] = [];
  const files = [...walkFiles(config.backendDir, ['.ts']), ...walkFiles(config.workerDir, ['.ts'])]
    .filter(shouldScanFile)
    .sort();

  for (const file of files) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const observation = sourceObservation(file, content);
    if (!observation.hasOutboundCall) {
      continue;
    }

    if (!observation.hasErrorBoundary) {
      appendBreak(
        findings,
        chaosFinding({
          observation,
          config,
          missingPredicate: 'error-boundary-not-observed',
          description: 'External dependency call has no nearby error boundary evidence',
          detail:
            'Wrap outbound dependency calls in an explicit error boundary and return an honest degraded state, retry record, or surfaced failure.',
        }),
      );
    }

    if (!observation.hasTimeoutControl) {
      appendBreak(
        findings,
        chaosFinding({
          observation,
          config,
          missingPredicate: 'timeout-control-not-observed',
          description: 'External dependency call has no timeout or abort control evidence',
          detail:
            'Add a timeout, abort signal, deadline, or equivalent cancellation control so a stalled dependency cannot block the execution path indefinitely.',
        }),
      );
    }

    if (!observation.hasRecoveryAction) {
      appendBreak(
        findings,
        chaosFinding({
          observation,
          config,
          missingPredicate: 'recovery-action-not-observed',
          description: 'External dependency call has no retry, queue, or degraded-state evidence',
          detail:
            'Record a recoverable outcome such as retry scheduling, queue handoff, reconnect behavior, or an explicit degraded-state response.',
        }),
      );
    }
  }

  return findings;
}
