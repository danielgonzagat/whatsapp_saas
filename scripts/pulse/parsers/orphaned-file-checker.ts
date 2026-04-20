import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    base === 'index.ts' ||
    base === 'main.ts' ||
    base.endsWith('.module.ts') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.test.ts') ||
    base.endsWith('.d.ts') ||
    /\.(spec|test)\.ts$/.test(filePath) ||
    /__tests__|__mocks__|\/migration\.|\/seed\.|fixture/i.test(filePath)
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Check orphaned files. */
export function checkOrphanedFiles(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Only check backend services, controllers, and dtos
  const targetFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (shouldSkipFile(f)) {
      return false;
    }
    const base = path.basename(f);
    return (
      base.endsWith('.service.ts') || base.endsWith('.controller.ts') || base.endsWith('.dto.ts')
    );
  });

  if (targetFiles.length === 0) {
    return breaks;
  }

  // Build corpus of all backend .ts files to search for imports
  const allBackendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    return !/__tests__|__mocks__|\/migration\.|\/seed\.|fixture/i.test(f);
  });

  // Cache file contents
  const contentCache = new Map<string, string>();
  for (const f of allBackendFiles) {
    try {
      contentCache.set(f, fs.readFileSync(f, 'utf8'));
    } catch {
      // skip unreadable files
    }
  }

  for (const file of targetFiles) {
    const base = path.basename(file, '.ts');
    const relFile = path.relative(config.rootDir, file);

    let isImported = false;

    for (const [otherFile, otherContent] of contentCache) {
      if (otherFile === file) {
        continue;
      }

      // Check for import ... from ... 'basename' or require('basename')
      const importRe = new RegExp(
        `(?:import[^;]*from|require)\\s*\\(?\\s*['"\`][^'"\`]*${escapeRegex(base)}['"\`]`,
      );
      if (importRe.test(otherContent)) {
        isImported = true;
        break;
      }
    }

    if (!isImported) {
      breaks.push({
        type: 'ORPHANED_FILE',
        severity: 'low',
        file: relFile,
        line: 1,
        description: `File '${path.basename(file)}' is not imported by any other backend file`,
        detail: `${relFile} has no import references. It may be dead code or accidentally disconnected from its module.`,
      });
    }
  }

  return breaks;
}
