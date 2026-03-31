import * as fs from 'fs';
import * as path from 'path';
import type { ServiceTrace, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Matches ALL Prisma access patterns:
// 1. this.prisma.modelName.operation()
// 2. this.prismaAny.modelName.operation()
// 3. (this.prisma as any).modelName.operation()
// 4. prismaAny.modelName.operation() (local alias)
// 5. tx.modelName.operation() (inside $transaction callbacks)
// 6. prisma.modelName.operation() (parameter in functions)
const PRISMA_OPS = 'create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany';
const PRISMA_ACCESS_PATTERNS = [
  new RegExp(`this\\.(?:prisma|prismaAny)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`\\(this\\.prisma\\s+as\\s+any\\)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`(?:prismaAny|prismaExt|prisma)\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
  new RegExp(`\\btx\\.([a-z]\\w+)\\.\\s*(?:${PRISMA_OPS})\\s*\\(`, 'g'),
];

export function traceServices(config: PulseConfig): ServiceTrace[] {
  const traces: ServiceTrace[] = [];
  // Scan BOTH services AND controllers for Prisma model access
  const files = walkFiles(config.backendDir, ['.ts']).filter(f =>
    f.endsWith('.service.ts') || f.endsWith('.controller.ts')
  );

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Check if file uses Prisma in any form
      const hasPrisma = /prisma|PrismaService/i.test(content);
      if (!hasPrisma) continue;

      // Extract class name
      const classMatch = content.match(/export\s+class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : path.basename(file, '.ts');

      // Find all methods and their Prisma model accesses
      let currentMethod: string | null = null;
      let methodLine = 0;
      let braceDepth = 0;
      let inMethod = false;
      const currentModels = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect method declaration (inside class body)
        // Relaxed regex: NestJS methods have decorators in params like @Req() req: any
        // So we match "async methodName(" without requiring the closing paren on same line
        if (!inMethod) {
          const methodMatch = trimmed.match(/(?:async\s+)?(\w+)\s*\(/) ;
          if (methodMatch && !['constructor', 'onModuleInit', 'onModuleDestroy', 'if', 'for', 'while', 'return', 'catch', 'switch', 'import', 'export', 'throw', 'new', 'await', 'super'].includes(methodMatch[1]) && /\{$/.test(trimmed)) {
            currentMethod = methodMatch[1];
            methodLine = i + 1;
            braceDepth = 0;
            inMethod = true;
            currentModels.clear();
          }
        }

        if (inMethod) {
          // Track braces
          for (const ch of line) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
          }

          // Find prisma model accesses using ALL patterns
          for (const pattern of PRISMA_ACCESS_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(line)) !== null) {
              currentModels.add(match[1]);
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
