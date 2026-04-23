import * as path from 'path';
import type { ServiceTrace, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

// Matches ALL Prisma access patterns:
// 1. this.prisma.modelName.operation()
// 2. this.prismaAny.modelName.operation()
// 3. (this.prisma as any).modelName.operation()
// 4. prismaAny.modelName.operation() (local alias)
// 5. tx.modelName.operation() (inside $transaction callbacks)
// 6. prisma.modelName.operation() (parameter in functions)
const PRISMA_OPS =
  'create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany';
const PRISMA_ACCESS_PATTERNS = [
  new RegExp(`this\\.(?:prisma|prismaAny)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`\\(this\\.prisma\\s+as\\s+any\\)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`(?:prismaAny|prismaExt|prisma)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`\\btx\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
];

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

function collectPrismaModelsFromText(text: string): Set<string> {
  const models = new Set<string>();
  for (const pattern of PRISMA_ACCESS_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      models.add(match[1]);
    }
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
          currentTriggers = collectTriggersFromDecorators(pendingDecorators, currentMethod);
          pendingDecorators = [];
        }

        if (inMethod) {
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

          // Find prisma model accesses using ALL patterns
          for (const modelName of collectPrismaModelsFromText(line)) {
            currentModels.add(modelName);
          }

          for (const serviceCall of collectServiceCallsFromText(line, serviceAliases, className)) {
            currentServiceCalls.add(serviceCall);
          }

          const helperCallRe =
            /\b([A-Za-z_]\w*)\s*\(\s*(?:this\.)?(?:prisma|prismaAny|prismaExt)\b/g;
          let helperCallMatch: RegExpExecArray | null;
          while ((helperCallMatch = helperCallRe.exec(line)) !== null) {
            const helperModels = helperModelMap.get(helperCallMatch[1]) || [];
            for (const modelName of helperModels) {
              currentModels.add(modelName);
            }
          }

          // Method ended
          if (braceDepth === 0 && currentMethod) {
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
