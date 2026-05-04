import * as path from 'path';
import * as fs from 'fs';

import { pathExists, readJsonFile } from '../../safe-fs';

const PROTECTED_FILES_PATH = 'ops/protected-governance-files.json';

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

function expandDirectory(dirPath: string, rootDir: string, accumulator: string[]): void {
  if (!pathExists(dirPath)) {
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      expandDirectory(full, rootDir, accumulator);
    } else if (entry.isFile()) {
      accumulator.push(path.relative(rootDir, full));
    }
  }
}

export function loadProtectedFiles(rootDir: string): string[] {
  const configPath = path.join(rootDir, PROTECTED_FILES_PATH);

  if (!pathExists(configPath)) {
    return [];
  }

  try {
    const config = readJsonFile<ProtectedGovernanceConfig>(configPath);
    const files: string[] = [];

    if (config.protectedExact) {
      for (const file of config.protectedExact) {
        files.push(file);
      }
    }

    if (config.protectedPrefixes) {
      for (const prefix of config.protectedPrefixes) {
        const fullPrefix = path.join(rootDir, prefix);
        if (pathExists(fullPrefix)) {
          expandDirectory(fullPrefix, rootDir, files);
        }
      }
    }

    return files;
  } catch {
    return [];
  }
}
