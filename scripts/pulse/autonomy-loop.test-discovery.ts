/**
 * Test discovery for autonomous validation.
 *
 * Given changed files, finds related test/spec files that should be executed
 * before accepting a cycle as validated.
 */
import { extname, dirname, basename } from 'path';
import { pathExists } from './safe-fs';
import { resolveRoot, safeJoin } from './lib/safe-path';

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const TEST_MARKERS = ['.spec.', '.test.', '__tests__'];

function isTestFile(file: string): boolean {
  return TEST_MARKERS.some((marker) => file.includes(marker));
}

function buildSpecCandidates(dir: string, base: string): string[] {
  return [
    safeJoin(dir, `${base}.spec.ts`),
    safeJoin(dir, `${base}.spec.tsx`),
    safeJoin(dir, `${base}.test.ts`),
    safeJoin(dir, `${base}.test.tsx`),
    safeJoin(dir, '__tests__', `${base}.spec.ts`),
    safeJoin(dir, '__tests__', `${base}.test.ts`),
    safeJoin('e2e', 'specs', `${base}.spec.ts`),
  ];
}

function collectFromFile(safeRoot: string, file: string, related: string[]): void {
  const ext = extname(file);
  if (!SOURCE_EXTS.has(ext)) {
    return;
  }
  if (isTestFile(file)) {
    return;
  }
  const dir = dirname(file);
  const base = basename(file, ext);
  for (const candidate of buildSpecCandidates(dir, base)) {
    const fullPath = safeJoin(safeRoot, candidate);
    if (pathExists(fullPath)) {
      related.push(fullPath);
    }
  }
}

/**
 * Find test/spec files related to changed source files.
 *
 * Heuristic:
 *   backend/src/foo/bar.service.ts → backend/src/foo/bar.service.spec.ts
 *   frontend/src/.../Component.tsx → frontend/src/.../Component.test.ts(x)
 *   worker/processor.ts → worker/__tests__/processor.test.ts
 *
 * Returns absolute paths to existing spec files.
 */
export function findTestsForChangedFiles(rootDir: string, changedFiles: string[]): string[] {
  const related: string[] = [];
  const safeRoot = resolveRoot(rootDir);
  for (const file of changedFiles) {
    collectFromFile(safeRoot, file, related);
  }
  return [...new Set(related)];
}
