import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type RedisKeyTruthMode = 'weak_signal' | 'confirmed_static';

type RedisKeyDiagnosticBreak = Break & {
  truthMode: RedisKeyTruthMode;
};

interface RedisCallEvidence {
  method: string;
  key: string;
  line: number;
  statementText: string;
}

interface RedisKeyDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: RedisKeyTruthMode;
}

function buildRedisKeyDiagnostic(input: RedisKeyDiagnosticInput): RedisKeyDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replaceAll('_', '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:redis-key-checker:${predicateToken || 'redis-key-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `static-ast-signal:redis-key-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'redis-key-lifecycle',
    truthMode: input.truthMode,
  };
}

function shouldSkipFile(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  const segments = normalized.split('/');
  const fileName = segments.length > 0 ? segments[segments.length - 1] : '';
  const lowerName = fileName.toLowerCase();
  const lowerPath = normalized.toLowerCase();

  return (
    lowerName.endsWith('.spec.ts') ||
    lowerName.endsWith('.test.ts') ||
    lowerName.endsWith('.d.ts') ||
    segments.includes('__tests__') ||
    segments.includes('__mocks__') ||
    lowerPath.includes('/seed.') ||
    lowerPath.includes('/migration.') ||
    lowerPath.includes('fixture')
  );
}

function sourceFileFor(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
}

function propertyAccessText(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const parent = propertyAccessText(node.expression);
    return parent ? `${parent}.${node.name.text}` : node.name.text;
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this';
  }
  return null;
}

function identifierTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (const char of value) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9');
    if (isAlphaNumeric) {
      current += char.toLowerCase();
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function hasIdentifierToken(value: string, token: string): boolean {
  return identifierTokens(value).includes(token);
}

function isRedisWriteMethod(methodName: string): boolean {
  return (
    methodName === 'set' || methodName === 'hset' || methodName === 'setex' || methodName === 'mset'
  );
}

function normalizeKeyArgument(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    const pieces = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    return pieces.join('*');
  }

  return null;
}

function lineNumberFor(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function nearestStatementText(sourceFile: ts.SourceFile, node: ts.Node): string {
  let current: ts.Node = node;
  while (current.parent && !ts.isStatement(current)) {
    current = current.parent;
  }
  return current.getText(sourceFile);
}

function collectRedisCallEvidence(sourceFile: ts.SourceFile): RedisCallEvidence[] {
  const evidence: RedisCallEvidence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const targetText = propertyAccessText(node.expression.expression);
      const key = node.arguments[0] ? normalizeKeyArgument(node.arguments[0]) : null;
      const method = node.expression.name.text;

      if (targetText && key && hasIdentifierToken(targetText, 'redis')) {
        evidence.push({
          method,
          key,
          line: lineNumberFor(sourceFile, node),
          statementText: nearestStatementText(sourceFile, node),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return evidence;
}

function textHasTtlSignal(text: string): boolean {
  const tokens = identifierTokens(text);
  return (
    tokens.includes('ex') ||
    tokens.includes('px') ||
    tokens.includes('expire') ||
    tokens.includes('ttl') ||
    tokens.includes('exat') ||
    tokens.includes('setex') ||
    tokens.includes('pexpire')
  );
}

function hasNearbyTtlEvidence(lines: string[], call: RedisCallEvidence): boolean {
  if (call.method === 'setex') {
    return true;
  }

  if (textHasTtlSignal(call.statementText)) {
    return true;
  }

  const nearbyLines = lines
    .slice(Math.max(call.line - 1, 0), Math.min(call.line + 3, lines.length))
    .join('\n');

  return textHasTtlSignal(nearbyLines);
}

/** Check redis keys. */
export function checkRedisKeys(config: PulseConfig): Break[] {
  const diagnostics: Break[] = [];

  const dirs = [config.backendDir, config.workerDir].filter(Boolean);
  const allFiles: string[] = [];
  for (const dir of dirs) {
    allFiles.push(...walkFiles(dir, ['.ts']).filter((file) => !shouldSkipFile(file)));
  }

  if (allFiles.length === 0) {
    return diagnostics;
  }

  for (const file of allFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!content.includes('redis')) {
      continue;
    }

    const sourceFile = sourceFileFor(file, content);
    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const redisCalls = collectRedisCallEvidence(sourceFile);

    for (const call of redisCalls) {
      if (isRedisWriteMethod(call.method)) {
        if (!hasNearbyTtlEvidence(lines, call)) {
          diagnostics.push(
            buildRedisKeyDiagnostic({
              predicateKinds: ['redis_write_observed', 'ttl_evidence_not_observed'],
              severity: 'medium',
              file: relFile,
              line: call.line,
              description: `Redis key '${call.key}' set without TTL expiry`,
              detail: `${call.statementText.trim().slice(0, 120)} - add EX/PX option or call redis.expire() to prevent unbounded cache growth.`,
              truthMode: 'confirmed_static',
            }),
          );
        }
      }
    }
  }

  return diagnostics;
}
