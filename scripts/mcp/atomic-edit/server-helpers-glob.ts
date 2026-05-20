import * as fs from 'node:fs';
import * as path from 'node:path';


// ───────────────────────── batch outline ──────────────────────────

export function matchesGlob(pattern: string, filePath: string): boolean {
  const parts = pattern.split('/');
  const fileParts = filePath.split('/');
  let pi = 0;
  let fi = 0;
  while (pi < parts.length) {
    if (parts[pi] === '**') {
      if (pi === parts.length - 1) return true;
      pi++;
      const next = parts[pi];
      while (fi < fileParts.length) {
        if (matchesGlobPart(next, fileParts[fi])) break;
        fi++;
      }
      if (fi >= fileParts.length) return false;
      pi++;
      fi++;
      continue;
    }
    if (fi >= fileParts.length) return false;
    if (!matchesGlobPart(parts[pi], fileParts[fi])) return false;
    pi++;
    fi++;
  }
  return fi === fileParts.length;
}

export function matchesGlobPart(part: string, name: string): boolean {
  if (!part.includes('*')) return part === name;
  const regex = new RegExp(
    '^' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*') + '$',
  );
  return regex.test(name);
}

export function globFindFiles(absCwd: string, pattern: string): string[] {
  const results: string[] = [];
  const excludeDirs = new Set(['node_modules', '.git', 'dist', 'build', '.atomic']);
  const walk = (dir: string, relDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile()) {
        if (matchesGlob(pattern, relPath)) {
          results.push(absPath);
        }
      }
    }
  };
  walk(absCwd, '');
  return results;
}

