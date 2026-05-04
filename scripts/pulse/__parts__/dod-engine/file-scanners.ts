import * as fs from 'fs';
import * as path from 'path';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin, resolveRoot } from '../../lib/safe-path';
import { lineNumberFromIndex } from './helpers';

export function scanFilesForPattern(
  filePaths: string[],
  rootDir: string,
  kernelGrammar: RegExp,
): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const relPath of filePaths) {
    const absPath = safeJoin(resolveRoot(rootDir), relPath);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const content = readTextFile(absPath);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (kernelGrammar.test(lines[i])) {
          matches.push(`${relPath}:${lineNumberFromIndex(i)}`);
        }
      }
    } catch {
      continue;
    }
  }
  return { found: matches.length > 0, matches };
}

export function testFilesExist(
  filePaths: string[],
  rootDir: string,
): { found: boolean; files: string[] } {
  const testPatterns = [/\.spec\.tsx?$/, /\.spec\.jsx?$/, /\.test\.tsx?$/, /\.test\.jsx?$/];
  const dirPatterns = ['__tests__', 'tests', 'test'];
  const sourceDirs = new Set<string>();
  const found: string[] = [];

  for (const relPath of filePaths) {
    const dir = path.dirname(relPath);
    sourceDirs.add(dir);
  }

  for (const dir of sourceDirs) {
    const absPath = safeJoin(resolveRoot(rootDir), dir);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const entries = fs.readdirSync(absPath);
      for (const entry of entries) {
        if (testPatterns.some((p) => p.test(entry))) {
          found.push(`${dir}/${entry}`);
        }
      }
    } catch {
      continue;
    }
  }

  for (const sourceDir of sourceDirs) {
    for (const dp of dirPatterns) {
      const testDir = safeJoin(resolveRoot(rootDir), sourceDir, dp);
      if (pathExists(testDir)) {
        try {
          const entries = fs.readdirSync(testDir);
          for (const entry of entries) {
            if (testPatterns.some((p) => p.test(entry))) {
              found.push(`${sourceDir}/${dp}/${entry}`);
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  return { found: found.length > 0, files: [...new Set(found)].sort() };
}
