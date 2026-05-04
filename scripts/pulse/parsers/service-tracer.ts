import * as path from 'path';
import * as ts from 'typescript';
import type { ServiceTrace, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const NON_METHOD_NAMES = new Set([
  'constructor',
  'if',
  'for',
  'while',
  'return',
  'catch',
  'switch',
  'import',
  'export',
  'throw',
  'new',
  'await',
  'super',
]);

const SERVICE_ALIAS_IGNORE = new Set([
  'ConfigService',
  'EventEmitter2',
  'HttpService',
  'Logger',
  'ModuleRef',
  'PrismaService',
  'Reflector',
  'Request',
]);

function extractConstructorAliases(content: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const ctorMatch = content.match(/constructor\s*\(([\s\S]*?)\)\s*\{/);
  if (!ctorMatch) {
    return aliases;
  }

  const paramRe =
    /(?:@(?:Inject|InjectRedis|Optional)\([^)]*\)\s*)?(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\??\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(ctorMatch[1])) !== null) {
    if (!SERVICE_ALIAS_IGNORE.has(match[2])) {
      aliases.set(match[1], match[2]);
    }
  }

  return aliases;
}

function extractAssignedServiceAliases(content: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const assignmentRe = /\bthis\.([A-Za-z_]\w*)\s*=\s*new\s+([A-Z][A-Za-z0-9_]+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = assignmentRe.exec(content)) !== null) {
    if (!SERVICE_ALIAS_IGNORE.has(match[2])) {
      aliases.set(match[1], match[2]);
    }
  }
  return aliases;
}

function getClassMethodDeclarationName(trimmedLine: string): string | null {
  const methodMatch = trimmedLine.match(
    /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\s*\(/,
  );
  if (!methodMatch) {
    return null;
  }

  const methodName = methodMatch[1];
  if (NON_METHOD_NAMES.has(methodName)) {
    return null;
  }

  return methodName;
}

function countParenDelta(value: string): number {
  let delta = 0;
  for (const ch of value) {
    if (ch === '(') {
      delta++;
    } else if (ch === ')') {
      delta--;
    }
  }
  return delta;
}

function identifierTokens(value: string): Set<string> {
  return new Set(
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
}

function hasIdentifierToken(value: string, token: string): boolean {
  return identifierTokens(value).has(token);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function expressionParts(expression: ts.Expression): string[] {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    return [current.text];
  }
  if (current.kind === ts.SyntaxKind.ThisKeyword) {
    return ['this'];
  }
  if (ts.isPropertyAccessExpression(current)) {
    return [...expressionParts(current.expression), current.name.text];
  }
  if (ts.isElementAccessExpression(current) && ts.isStringLiteralLike(current.argumentExpression)) {
    return [...expressionParts(current.expression), current.argumentExpression.text];
  }
  return [];
}

function collectPrismaReceiverNames(sourceFile: ts.SourceFile): Set<string> {
  const receivers = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && hasIdentifierToken(node.text, 'prisma')) {
      receivers.add(node.text);
    }

    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression);
      if (ts.isPropertyAccessExpression(expression)) {
        const callParts = expressionParts(expression);
        const callsTransaction = callParts.some((part) => hasIdentifierToken(part, 'transaction'));
        const usesPrismaReceiver = callParts.some((part) => hasIdentifierToken(part, 'prisma'));
        if (callsTransaction && usesPrismaReceiver) {
          for (const argument of node.arguments) {
            if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
              for (const parameter of argument.parameters) {
                if (ts.isIdentifier(parameter.name)) {
                  receivers.add(parameter.name.text);
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return receivers;
}

function modelFromCallParts(parts: string[], prismaReceivers: Set<string>): string | null {
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const isPrismaToken = hasIdentifierToken(part, 'prisma');
    const isKnownReceiver = prismaReceivers.has(part);
    const modelIndex = index + 1;
    const operationIndex = index + 2;
    if ((isPrismaToken || isKnownReceiver) && operationIndex < parts.length) {
      const modelName = parts[modelIndex];
      if (modelName && !modelName.startsWith('$')) {
        return modelName;
      }
    }
  }
  return null;
}

function sourceFilesForTraceText(fileName: string, text: string): ts.SourceFile[] {
  return [
    ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true),
    ts.createSourceFile(
      fileName,
      `class ServiceTraceSlice {\n${text}\n}`,
      ts.ScriptTarget.Latest,
      true,
    ),
  ];
}

function collectPrismaModelsFromText(text: string): Set<string> {
  const models = new Set<string>();

  for (const sourceFile of sourceFilesForTraceText('service-trace-slice.ts', text)) {
    const prismaReceivers = collectPrismaReceiverNames(sourceFile);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const parts = expressionParts(node.expression);
        const modelName = modelFromCallParts(parts, prismaReceivers);
        if (modelName) {
          models.add(modelName);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
  return models;
}

function collectHelperModelsFromText(
  text: string,
  helperModelMap: Map<string, string[]>,
): Set<string> {
  const models = new Set<string>();

  for (const sourceFile of sourceFilesForTraceText('service-helper-slice.ts', text)) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = unwrapExpression(node.expression);
        if (ts.isIdentifier(expression)) {
          const hasPrismaArgument = node.arguments.some((argument) =>
            expressionParts(argument).some((part) => hasIdentifierToken(part, 'prisma')),
          );
          if (hasPrismaArgument) {
            for (const modelName of helperModelMap.get(expression.text) || []) {
              models.add(modelName);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
  return models;
}

function collectServiceCallsFromText(
  text: string,
  serviceAliases: Map<string, string>,
  className: string,
): Set<string> {
  const calls = new Set<string>();
  const callRe = /\bthis\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const serviceName = serviceAliases.get(match[1]);
    if (!serviceName) {
      continue;
    }
    calls.add(`${serviceName}.${match[2]}`);
  }
  const selfCallRe = /\bthis\.([A-Za-z_]\w*)\s*\(/g;
  while ((match = selfCallRe.exec(text)) !== null) {
    if (!NON_METHOD_NAMES.has(match[1])) {
      calls.add(`${className}.${match[1]}`);
    }
  }
  return calls;
}

function collectTriggersFromDecorators(decorators: string[], methodName: string): string[] {
  const decoratorTriggers = decorators
    .map((decorator) => {
      const cronMatch = decorator.match(/@Cron\(\s*([^)]*)\)/);
      if (cronMatch) {
        return `cron:${cronMatch[1].replace(/\s+/g, ' ').trim()}`;
      }

      const intervalMatch = decorator.match(/@Interval\(\s*([^)]*)\)/);
      if (intervalMatch) {
        return `interval:${intervalMatch[1].replace(/\s+/g, ' ').trim()}`;
      }

      const timeoutMatch = decorator.match(/@Timeout\(\s*([^)]*)\)/);
      if (timeoutMatch) {
        return `timeout:${timeoutMatch[1].replace(/\s+/g, ' ').trim()}`;
      }

      const eventMatch = decorator.match(/@OnEvent\(\s*([^)]*)\)/);
      if (eventMatch) {
        return `event:${eventMatch[1].replace(/\s+/g, ' ').trim()}`;
      }

      const processMatch = decorator.match(/@Process\(\s*([^)]*)\)/);
      if (processMatch) {
        return `queue:${processMatch[1].replace(/\s+/g, ' ').trim()}`;
      }

      return '';
    })
    .filter(Boolean);
  const lifecycleTriggers = ['onModuleInit'].includes(methodName)
    ? [`lifecycle:${methodName}`]
    : [];
  return [...decoratorTriggers, ...lifecycleTriggers];
}

function extractDeclarationBody(lines: string[], startIndex: number, maxLines = 260): string {
  const block: string[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bodyStarted = false;

  for (let i = startIndex; i < Math.min(startIndex + maxLines, lines.length); i++) {
    const line = lines[i];
    const trimmed = line.trim();
    block.push(line);

    if (!bodyStarted) {
      parenDepth += countParenDelta(trimmed);
      if (parenDepth > 0 || !/\{\s*$/.test(trimmed)) {
        continue;
      }
    }

    const scanFrom = bodyStarted ? 0 : line.lastIndexOf('{');
    for (const ch of line.slice(Math.max(0, scanFrom))) {
      if (ch === '{') {
        braceDepth++;
        bodyStarted = true;
      } else if (ch === '}') {
        braceDepth--;
      }
    }

    if (bodyStarted && braceDepth <= 0) {
      break;
    }
  }

  return block.join('\n');
}

function buildPrismaHelperModelMap(files: string[]): Map<string, string[]> {
  const helperModels = new Map<string, string[]>();

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      if (!/prisma|PrismaService/i.test(content)) {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const functionMatch = lines[i]
          .trim()
          .match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(/);
        if (!functionMatch) {
          continue;
        }

        const body = extractDeclarationBody(lines, i);
        const models = collectPrismaModelsFromText(body);
        if (models.size > 0) {
          helperModels.set(functionMatch[1], [...models]);
        }
      }
    } catch {
      continue;
    }
  }

  return helperModels;
}

/** Trace services. */
export function traceServices(config: PulseConfig): ServiceTrace[] {
  const traces: ServiceTrace[] = [];
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (file) => !/\.(spec|test|d)\.ts$/.test(file),
  );
  const helperModelMap = buildPrismaHelperModelMap(backendFiles);
  // Scan BOTH services AND controllers for Prisma model access
  const files = backendFiles.filter(
    (f) =>
      f.endsWith('.service.ts') ||
      f.endsWith('.controller.ts') ||
      f.endsWith('.engine.ts') ||
      f.endsWith('.guard.ts') ||
      f.endsWith('.interceptor.ts') ||
      f.endsWith('.middleware.ts'),
  );

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);
      const serviceAliases = new Map([
        ...extractConstructorAliases(content),
        ...extractAssignedServiceAliases(content),
      ]);

      // Check if file uses Prisma in any form
      const hasPrisma = /prisma|PrismaService/i.test(content);
      if (!hasPrisma && serviceAliases.size === 0) {
        continue;
      }

      // Extract class name
      const classMatch = content.match(/export\s+class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : path.basename(file, '.ts');

      // Find all methods and their Prisma model accesses
      let currentMethod: string | null = null;
      let methodLine = 0;
      let methodBodyStartLine = 0;
      let methodBodyStartColumn = 0;
      let braceDepth = 0;
      let inMethod = false;
      let pendingMethod: { name: string; line: number; parenDepth: number } | null = null;
      const currentModels = new Set<string>();
      const currentServiceCalls = new Set<string>();
      const currentMethodLines: string[] = [];
      let pendingDecorators: string[] = [];
      let currentTriggers: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!inMethod && !pendingMethod && trimmed.startsWith('@')) {
          pendingDecorators.push(trimmed);
          continue;
        }

        // Detect class method declarations only. Prisma calls such as
        // `this.prisma.product.findFirst({` must not become fake method names.
        if (!inMethod && !pendingMethod) {
          const methodName = getClassMethodDeclarationName(trimmed);
          if (methodName) {
            pendingMethod = { name: methodName, line: i + 1, parenDepth: 0 };
          } else if (trimmed && !trimmed.startsWith('@')) {
            pendingDecorators = [];
          }
        }

        if (!inMethod && pendingMethod) {
          pendingMethod.parenDepth += countParenDelta(trimmed);
        }

        if (!inMethod && pendingMethod && pendingMethod.parenDepth <= 0 && /\{\s*$/.test(trimmed)) {
          currentMethod = pendingMethod.name;
          methodLine = pendingMethod.line;
          methodBodyStartLine = i;
          methodBodyStartColumn = Math.max(0, line.lastIndexOf('{'));
          braceDepth = 0;
          inMethod = true;
          pendingMethod = null;
          currentModels.clear();
          currentServiceCalls.clear();
          currentMethodLines.length = 0;
          currentTriggers = collectTriggersFromDecorators(pendingDecorators, currentMethod);
          pendingDecorators = [];
        }

        if (inMethod) {
          currentMethodLines.push(line);

          // Track braces
          const braceScanText =
            i === methodBodyStartLine ? line.slice(methodBodyStartColumn) : line;
          for (const ch of braceScanText) {
            if (ch === '{') {
              braceDepth++;
            }
            if (ch === '}') {
              braceDepth--;
            }
          }

          for (const serviceCall of collectServiceCallsFromText(line, serviceAliases, className)) {
            currentServiceCalls.add(serviceCall);
          }

          // Method ended
          if (braceDepth === 0 && currentMethod) {
            const methodText = currentMethodLines.join('\n');
            for (const modelName of collectPrismaModelsFromText(methodText)) {
              currentModels.add(modelName);
            }
            for (const modelName of collectHelperModelsFromText(methodText, helperModelMap)) {
              currentModels.add(modelName);
            }

            if (currentModels.size > 0 || currentServiceCalls.size > 0) {
              traces.push({
                file: relFile,
                serviceName: className,
                methodName: currentMethod,
                line: methodLine,
                prismaModels: [...currentModels],
                serviceCalls: [...currentServiceCalls],
                triggers: currentTriggers,
              });
            }
            currentMethod = null;
            inMethod = false;
            currentTriggers = [];
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not trace ${file}: ${(e as Error).message}\n`);
    }
  }

  return traces;
}
