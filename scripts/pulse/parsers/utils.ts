import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Dirent } from 'fs';
import { pathExists, readDir, readTextFile } from '../safe-fs';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.git',
  'coverage',
  '__tests__',
  '__mocks__',
  '.turbo',
  '.vercel',
]);

/** Walk files. */
export function walkFiles(dir: string, exts: string[] = ['.ts', '.tsx', '.js', '.jsx']): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  const results: string[] = [];

  function walk(current: string) {
    let entries: Dirent[];
    try {
      entries = readDir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      const full = safeJoin(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (exts.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/** Read file safe. */
export function readFileSafe(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
