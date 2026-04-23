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
  'onModuleInit',
  'onModuleDestroy',
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
    (f) => f.endsWith('.service.ts') || f.endsWith('.controller.ts') || f.endsWith('.engine.ts'),
  );

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Check if file uses Prisma in any form
      const hasPrisma = /prisma|PrismaService/i.test(content);
      if (!hasPrisma) {
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

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect class method declarations only. Prisma calls such as
        // `this.prisma.product.findFirst({` must not become fake method names.
        if (!inMethod && !pendingMethod) {
          const methodName = getClassMethodDeclarationName(trimmed);
          if (methodName) {
            pendingMethod = { name: methodName, line: i + 1, parenDepth: 0 };
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
            if (currentModels.size > 0) {
              traces.push({
                file: relFile,
                serviceName: className,
                methodName: currentMethod,
                line: methodLine,
                prismaModels: [...currentModels],
              });
            }
            currentMethod = null;
            inMethod = false;
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not trace ${file}: ${(e as Error).message}\n`);
    }
  }

  return traces;
}
