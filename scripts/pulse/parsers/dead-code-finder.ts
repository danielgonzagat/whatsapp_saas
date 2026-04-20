import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Files excluded from the export check — these are entrypoints or re-export
// aggregators that NestJS or Next.js auto-discovers.
function isEntrypointFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    base === 'index.ts' ||
    base === 'main.ts' ||
    base === 'bootstrap.ts' ||
    base.endsWith('.module.ts') ||
    base === 'page.tsx' ||
    base === 'route.ts' ||
    base === 'layout.tsx' ||
    base === 'loading.tsx' ||
    base === 'error.tsx' ||
    base === 'not-found.tsx'
  );
}

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test|d)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(filePath);
}

/**
 * Extract exported identifiers from a TypeScript source file.
 * Handles: export function X, export class X, export const X, export type X,
 * export interface X, export enum X, export { X }, export default (ignored).
 */
function extractExports(content: string): string[] {
  const names: string[] = [];

  // Named statement exports: export (async)? (function|class|const|let|var|enum|abstract class) NAME
  // NOTE: Exclude `export interface` and `export type` — these are consumed implicitly
  // by TypeScript's declaration emit and don't need explicit import references.
  const stmtRe =
    /^export\s+(?:async\s+)?(?:function|class|const|let|var|enum|abstract\s+class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = stmtRe.exec(content)) !== null) {
    names.push(m[1]);
  }

  // Named export lists: export { A, B as C }
  const listRe = /^export\s+\{([^}]+)\}/gm;
  while ((m = listRe.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      // "A as B" → use B (the external name)
      const alias = part.trim().split(/\s+as\s+/);
      const exported = alias[alias.length - 1].trim();
      if (exported && /^[A-Za-z_$]/.test(exported)) {
        names.push(exported);
      }
    }
  }

  return names;
}

export function checkDeadCode(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Only scan backend services and controllers — not frontend (too many re-exports)
  const targetFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => {
    if (shouldSkipFile(f) || isEntrypointFile(f)) {
      return false;
    }
    const rel = path.relative(config.backendDir, f);
    // Only services and controllers
    return rel.includes('.service.ts') || rel.includes('.controller.ts');
  });

  if (targetFiles.length === 0) {
    return breaks;
  }

  // Build a corpus of all backend .ts files to search for references
  const allBackendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Cache file contents to avoid repeated reads
  const contentCache = new Map<string, string>();
  for (const f of allBackendFiles) {
    try {
      contentCache.set(f, fs.readFileSync(f, 'utf8'));
    } catch {
      // skip unreadable
    }
  }

  for (const file of targetFiles) {
    const content = contentCache.get(file);
    if (!content) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const exportedNames = extractExports(content);

    for (const name of exportedNames) {
      // Skip very short names and common generic names that will have many false positives
      if (name.length < 4) {
        continue;
      }
      if (['default', 'type', 'interface', 'enum'].includes(name)) {
        continue;
      }

      let foundReference = false;

      // Search all other backend files for any reference to this name
      for (const [otherFile, otherContent] of contentCache) {
        if (otherFile === file) {
          continue;
        }

        // Check for import statements referencing this name
        const importRe = new RegExp(`import[^;]*\\b${escapeRegex(name)}\\b[^;]*from`, 'g');
        if (importRe.test(otherContent)) {
          foundReference = true;
          break;
        }

        // Check for direct usage (class instantiation, decoration, etc.)
        // Use word boundaries to avoid partial matches
        const usageRe = new RegExp(`\\b${escapeRegex(name)}\\b`);
        if (usageRe.test(otherContent)) {
          foundReference = true;
          break;
        }
      }

      if (!foundReference) {
        // Find the line number of the export in the file
        const lines = content.split('\n');
        let lineNum = 1;
        const nameRe = new RegExp(`\\bexport\\b.*\\b${escapeRegex(name)}\\b`);
        for (let i = 0; i < lines.length; i++) {
          if (nameRe.test(lines[i])) {
            lineNum = i + 1;
            break;
          }
        }

        breaks.push({
          type: 'DEAD_EXPORT',
          severity: 'low',
          file: relFile,
          line: lineNum,
          description: `Exported symbol '${name}' has no references in other files`,
          detail: `'${name}' is exported from ${path.basename(file)} but not imported/used anywhere in the backend. Consider removing or making it private.`,
        });
      }
    }
  }

  return breaks;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
