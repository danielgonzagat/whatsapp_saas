import * as fs from 'fs';
import * as path from 'path';
import type { ServiceTrace, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Matches BOTH this.prisma. and this.prismaAny. (133 uses of prismaAny in codebase)
const PRISMA_ACCESS_RE = /this\.(?:prisma|prismaAny)\.(\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g;
const PRISMA_RAW_RE = /this\.(?:prisma|prismaAny)\.\$(?:queryRaw|executeRaw)/g;
const PRISMA_TX_RE = /this\.(?:prisma|prismaAny)\.\$transaction/g;

export function traceServices(config: PulseConfig): ServiceTrace[] {
  const traces: ServiceTrace[] = [];
  const files = walkFiles(config.backendDir, ['.ts']).filter(f => f.endsWith('.service.ts'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Check if service injects Prisma
      const hasPrisma = /(?:private|readonly)\s+(?:readonly\s+)?(?:prisma|prismaAny)\s*:\s*PrismaService/.test(content);
      if (!hasPrisma) continue;

      // Extract service class name
      const classMatch = content.match(/export\s+class\s+(\w+)/);
      const serviceName = classMatch ? classMatch[1] : path.basename(file, '.service.ts');

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
        if (!inMethod) {
          const methodMatch = trimmed.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|,\s]+)?\s*\{/);
          if (methodMatch && !['constructor', 'onModuleInit', 'onModuleDestroy'].includes(methodMatch[1])) {
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

          // Find prisma model accesses in this line
          PRISMA_ACCESS_RE.lastIndex = 0;
          let match;
          while ((match = PRISMA_ACCESS_RE.exec(line)) !== null) {
            currentModels.add(match[1]);
          }

          // Method ended
          if (braceDepth === 0 && currentMethod) {
            if (currentModels.size > 0) {
              traces.push({
                file: relFile,
                serviceName,
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
