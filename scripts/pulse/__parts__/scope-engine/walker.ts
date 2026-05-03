import * as crypto from 'crypto';
import * as path from 'path';
import { readDir, statPath } from '../../safe-fs';
import { IGNORED_DIRECTORIES } from '../../scope-state.constants';
import { SCANNABLE_EXTENSIONS } from './constants';

function walkFiles(dir: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readDir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    let stats;
    try {
      stats = statPath(fullPath);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (!entry.startsWith('.') && entry !== 'node_modules') {
        walkFiles(fullPath, files);
      }
    } else if (stats.isFile()) {
      const ext = path.extname(entry).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
}

function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export { walkFiles, computeContentHash };
