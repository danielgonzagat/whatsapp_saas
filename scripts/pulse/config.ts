import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import type { PulseConfig } from './types';
import { pathExists, readDir, readTextFile } from './safe-fs';

/** Detect config. */
export function detectConfig(rootDir: string): PulseConfig {
  // Auto-detect frontend
  const frontendCandidates = ['frontend/src', 'src', 'client/src', 'app'];
  const frontendDir =
    frontendCandidates.find((d) => pathExists(safeJoin(rootDir, d))) || 'frontend/src';

  // Auto-detect backend
  const backendCandidates = ['backend/src', 'server/src', 'api/src', 'src'];
  const backendDir =
    backendCandidates.find((d) => {
      const full = safeJoin(rootDir, d);
      if (!pathExists(full)) {
        return false;
      }
      try {
        const files = readDir(full, { recursive: true }) as string[];
        return files.some((f) => /\.controller\.ts$/.test(String(f)));
      } catch {
        return false;
      }
    }) || 'backend/src';

  // Auto-detect schema
  const schemaCandidates = ['backend/prisma/schema.prisma', 'prisma/schema.prisma'];
  const schemaPath = schemaCandidates.find((s) => pathExists(safeJoin(rootDir, s))) || '';

  // Detect global prefix in main.ts
  let globalPrefix = '';
  const mainTsCandidates = ['backend/src/main.ts', 'src/main.ts'];
  for (const m of mainTsCandidates) {
    const mainPath = safeJoin(rootDir, m);
    if (pathExists(mainPath)) {
      const content = readTextFile(mainPath, 'utf8');
      const prefixMatch = content.match(/setGlobalPrefix\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
      if (prefixMatch) {
        globalPrefix = prefixMatch[1];
      }
      break;
    }
  }

  // Auto-detect worker
  const workerCandidates = ['worker', 'worker/src'];
  const workerDir = workerCandidates.find((d) => pathExists(safeJoin(rootDir, d))) || 'worker';

  return {
    rootDir,
    frontendDir: safeJoin(rootDir, frontendDir),
    backendDir: safeJoin(rootDir, backendDir),
    workerDir: safeJoin(rootDir, workerDir),
    schemaPath: schemaPath ? safeJoin(rootDir, schemaPath) : '',
    globalPrefix,
  };
}
