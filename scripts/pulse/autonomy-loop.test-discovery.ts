/**
 * Test discovery for autonomous validation.
 *
 * Given changed files, finds related test/spec files that should be executed
 * before accepting a cycle as validated.
 */
import * as path from 'path';
import * as fs from 'fs';

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

  for (const file of changedFiles) {
    const ext = path.extname(file);
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;
    if (file.includes('.spec.') || file.includes('.test.') || file.includes('__tests__')) continue;

    const dir = path.dirname(file);
    const base = path.basename(file, ext);

    // Same directory, .spec suffix
    const specCandidates = [
      path.join(dir, `${base}.spec.ts`),
      path.join(dir, `${base}.spec.tsx`),
      path.join(dir, `${base}.test.ts`),
      path.join(dir, `${base}.test.tsx`),
      // __tests__ subdirectory
      path.join(dir, '__tests__', `${base}.spec.ts`),
      path.join(dir, '__tests__', `${base}.test.ts`),
      // e2e specs for critical modules
      path.join('e2e', 'specs', `${base}.spec.ts`),
    ];

    for (const candidate of specCandidates) {
      const fullPath = path.resolve(rootDir, candidate);
      if (fs.existsSync(fullPath)) {
        related.push(fullPath);
      }
    }
  }

  return [...new Set(related)];
}
