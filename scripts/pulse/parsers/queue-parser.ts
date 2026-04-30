import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface JobRef {
  file: string;
  line: number;
  jobName: string;
  queueVar?: string;
}

type QueueBreakKind = 'missingProcessor' | 'missingProducer';

const QUEUE_BREAK_TYPES: Record<QueueBreakKind, Break['type']> = {
  missingProcessor: 'QUEUE_NO_PROCESSOR',
  missingProducer: 'PROCESSOR_NO_PRODUCER',
};

function queueBreakType(kind: QueueBreakKind): Break['type'] {
  return QUEUE_BREAK_TYPES[kind];
}

function stringLiteralValue(node: ts.Node | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function lineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function identifierTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value) {
    const isWordChar =
      (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
    if (!isWordChar) {
      if (current) {
        tokens.push(current.toLowerCase());
        current = '';
      }
      continue;
    }
    const previous = current[current.length - 1];
    if (previous && previous >= 'a' && previous <= 'z' && char >= 'A' && char <= 'Z') {
      tokens.push(current.toLowerCase());
      current = char;
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current.toLowerCase());
  }
  return tokens;
}

function hasToken(value: string, token: string): boolean {
  return identifierTokens(value).includes(token);
}

function isIdentifierLikeJobName(value: string): boolean {
  if (value.length === 0 || value.length > 80) {
    return false;
  }
  const [firstChar] = value;
  if (
    !firstChar ||
    !((firstChar >= 'A' && firstChar <= 'Z') || (firstChar >= 'a' && firstChar <= 'z'))
  ) {
    return false;
  }
  return [...value].every(
    (char) =>
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9') ||
      char === '_' ||
      char === '-',
  );
}

function isUppercaseStateValue(value: string): boolean {
  if (value.length < 2 || value.length > 20 || value.includes('-')) {
    return false;
  }
  return [...value].every(
    (char) => (char >= 'A' && char <= 'Z') || char === '_' || (char >= '0' && char <= '9'),
  );
}

function isSkippedQueueSourceFile(file: string): boolean {
  return (
    file.endsWith('.d.ts') ||
    file.endsWith('.spec.ts') ||
    file.endsWith('.test.ts') ||
    file.includes('node_modules')
  );
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

function queueVarFromAddTarget(target: ts.Expression): string | undefined {
  if (ts.isIdentifier(target)) {
    return target.text;
  }
  if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.name)) {
    return target.name.text;
  }
  return undefined;
}

function isQueueAddTarget(target: ts.Expression): boolean {
  if (target.kind === ts.SyntaxKind.ThisKeyword) {
    return true;
  }
  const text = propertyAccessText(target);
  return Boolean(text && (text.startsWith('this.') || hasToken(text, 'queue')));
}

function isCollectionAddTarget(target: ts.Expression): boolean {
  const text = propertyAccessText(target);
  if (!text) {
    return false;
  }
  return [
    'classList',
    'eventListeners',
    'listeners',
    'subscribers',
    'middlewares',
    'routes',
    'providers',
    'imports',
    'exports',
    'controllers',
    'interceptors',
    'pipes',
    'guards',
    'filters',
    'modules',
  ].some((token) => identifierTokens(text).includes(token.toLowerCase()));
}

function isQueueConstructorName(value: string): boolean {
  return value === 'Bull' || value === 'Queue' || value === 'BullQueue';
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

function hasJobProcessorEvidence(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Worker'
    ) {
      found = true;
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ((ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'process') ||
        callExpressionName(node.expression) === 'Process')
    ) {
      found = true;
      return;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'job' &&
      (node.name.text === 'name' || node.name.text === 'data')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isJobNameComparison(node: ts.BinaryExpression): string | null {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return null;
  }
  const leftIsJobName =
    ts.isPropertyAccessExpression(node.left) &&
    ts.isIdentifier(node.left.expression) &&
    node.left.expression.text === 'job' &&
    node.left.name.text === 'name';
  return leftIsJobName ? stringLiteralValue(node.right) : null;
}

function processDecoratorJobName(node: ts.Node): string | null {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  for (const decorator of decorators ?? []) {
    const expression = decorator.expression;
    if (
      ts.isCallExpression(expression) &&
      callExpressionName(expression.expression) === 'Process'
    ) {
      return stringLiteralValue(expression.arguments[0]);
    }
  }
  return null;
}

/** Check queues. */
export function checkQueues(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- Collect producers (.add('jobName') in backend) ----
  const producers: JobRef[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (file) => !isSkippedQueueSourceFile(file),
  );

  // Also look in worker dir (worker can self-enqueue)
  const allSourceFiles = [...backendFiles];
  if (config.workerDir) {
    allSourceFiles.push(
      ...walkFiles(config.workerDir, ['.ts']).filter((f) => {
        return !isSkippedQueueSourceFile(f);
      }),
    );
  }

  for (const file of allSourceFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'add' &&
        isQueueAddTarget(node.expression.expression) &&
        !isCollectionAddTarget(node.expression.expression)
      ) {
        const jobName = stringLiteralValue(node.arguments[0]);
        if (jobName && isIdentifierLikeJobName(jobName)) {
          producers.push({
            file,
            line: lineNumber(sourceFile, node),
            jobName,
            queueVar: queueVarFromAddTarget(node.expression.expression),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  // ---- Collect consumers (case 'jobName': or job.name === 'jobName' in worker) ----
  const consumers: JobRef[] = [];

  const workerFiles = allSourceFiles;

  for (const file of workerFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const fileIsProcessor = hasJobProcessorEvidence(sourceFile);
    const visit = (node: ts.Node): void => {
      if (fileIsProcessor && ts.isCaseClause(node)) {
        const jobName = stringLiteralValue(node.expression);
        if (jobName && !isUppercaseStateValue(jobName)) {
          consumers.push({ file, line: lineNumber(sourceFile, node), jobName });
        }
      }
      if (ts.isBinaryExpression(node)) {
        const jobName = isJobNameComparison(node);
        if (jobName) {
          consumers.push({ file, line: lineNumber(sourceFile, node), jobName });
        }
      }
      const decoratedJobName = processDecoratorJobName(node);
      if (decoratedJobName) {
        consumers.push({ file, line: lineNumber(sourceFile, node), jobName: decoratedJobName });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  // ---- Collect queue names that have Worker processors (handle all jobs regardless of name) ----
  const workerQueueNames = new Set<string>();
  const queueNameByVar = new Map<string, string>();

  const allWorkerAndQueueFiles = [...workerFiles, ...backendFiles];
  for (const file of allWorkerAndQueueFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const queueName = stringLiteralValue(node.arguments?.[0]);
        if (node.expression.text === 'Worker' && queueName) {
          workerQueueNames.add(queueName);
        }
        if (isQueueConstructorName(node.expression.text) && queueName) {
          const parent = node.parent;
          if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
            queueNameByVar.set(parent.name.text, queueName);
          }
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = callExpressionName(node.expression);
        const queueName = stringLiteralValue(node.arguments[0]);
        if ((callee === 'lazyQueue' || callee === 'lazyQueueProxy') && queueName) {
          const parent = node.parent;
          if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
            queueNameByVar.set(parent.name.text, queueName);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  // For each producer, check if the queue variable maps to a queue that has a Worker
  // If so, the job IS consumed (by the generic Worker processor)
  const producersWithWorker = new Set<string>();
  for (const prod of producers) {
    if (prod.queueVar) {
      const varName = prod.queueVar;
      const queueName = queueNameByVar.get(varName);
      if (queueName && workerQueueNames.has(queueName)) {
        producersWithWorker.add(prod.jobName);
      }
    }
  }

  // ---- Cross-reference ----
  const producerJobNames = new Set(producers.map((p) => p.jobName));
  const consumerJobNames = new Set(consumers.map((c) => c.jobName));

  // Deduplicate producers by jobName to avoid spamming the same job name from multiple callers
  const reportedProducerMissing = new Set<string>();
  const reportedConsumerMissing = new Set<string>();

  // Producer has no consumer
  for (const prod of producers) {
    if (consumerJobNames.has(prod.jobName)) {
      continue;
    }
    // Skip if the producer's queue has a generic Worker that handles all jobs
    if (producersWithWorker.has(prod.jobName)) {
      continue;
    }
    if (reportedProducerMissing.has(prod.jobName)) {
      continue;
    }
    reportedProducerMissing.add(prod.jobName);

    const relFile = path.relative(config.rootDir, prod.file);
    const breakType = queueBreakType('missingProcessor');
    breaks.push({
      type: breakType,
      severity: 'high',
      file: relFile,
      line: prod.line,
      description: `Queue job '${prod.jobName}' is produced but has no worker processor`,
      detail: `No 'case "${prod.jobName}":' or 'job.name === "${prod.jobName}"' found in worker — jobs will silently pile up`,
    });
  }

  // Consumer has no producer
  for (const cons of consumers) {
    if (producerJobNames.has(cons.jobName)) {
      continue;
    }
    if (reportedConsumerMissing.has(cons.jobName)) {
      continue;
    }
    reportedConsumerMissing.add(cons.jobName);

    const relFile = path.relative(config.rootDir, cons.file);
    const breakType = queueBreakType('missingProducer');
    breaks.push({
      type: breakType,
      severity: 'low',
      file: relFile,
      line: cons.line,
      description: `Worker processor handles job '${cons.jobName}' but no producer calls queue.add('${cons.jobName}')`,
      detail: `Dead processor — no backend code enqueues this job name. May be renamed or removed producer.`,
    });
  }

  return breaks;
}
