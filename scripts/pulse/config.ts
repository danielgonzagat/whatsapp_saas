import * as fs from 'fs';
import * as path from 'path';
import type { PulseConfig } from './types';

export function detectConfig(rootDir: string): PulseConfig {
  // Auto-detect frontend
  const frontendCandidates = ['frontend/src', 'src', 'client/src', 'app'];
  const frontendDir =
    frontendCandidates.find((d) => fs.existsSync(path.join(rootDir, d))) || 'frontend/src';

  // Auto-detect backend
  const backendCandidates = ['backend/src', 'server/src', 'api/src', 'src'];
  const backendDir =
    backendCandidates.find((d) => {
      const full = path.join(rootDir, d);
      if (!fs.existsSync(full)) {
        return false;
      }
      try {
        const files = fs.readdirSync(full, { recursive: true }) as string[];
        return files.some((f) => /\.controller\.ts$/.test(String(f)));
      } catch {
        return false;
      }
    }) || 'backend/src';

  // Auto-detect schema
  const schemaCandidates = ['backend/prisma/schema.prisma', 'prisma/schema.prisma'];
  const schemaPath = schemaCandidates.find((s) => fs.existsSync(path.join(rootDir, s))) || '';

  // Detect global prefix in main.ts
  let globalPrefix = '';
  const mainTsCandidates = ['backend/src/main.ts', 'src/main.ts'];
  for (const m of mainTsCandidates) {
    const mainPath = path.join(rootDir, m);
    if (fs.existsSync(mainPath)) {
      const content = fs.readFileSync(mainPath, 'utf8');
      const prefixMatch = content.match(/setGlobalPrefix\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
      if (prefixMatch) {
        globalPrefix = prefixMatch[1];
      }
      break;
    }
  }

  // Auto-detect worker
  const workerCandidates = ['worker', 'worker/src'];
  const workerDir = workerCandidates.find((d) => fs.existsSync(path.join(rootDir, d))) || 'worker';

  return {
    rootDir,
    frontendDir: path.join(rootDir, frontendDir),
    backendDir: path.join(rootDir, backendDir),
    workerDir: path.join(rootDir, workerDir),
    schemaPath: schemaPath ? path.join(rootDir, schemaPath) : '',
    globalPrefix,
  };
}
