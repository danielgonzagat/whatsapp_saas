import * as path from 'path';
import { EXPORT_REGEX, RESOLVE_EXTENSIONS } from './constants';

function hasExports(content: string): boolean {
  EXPORT_REGEX.lastIndex = 0;
  return EXPORT_REGEX.test(content) || /module\.exports\b/.test(content);
}

function resolveImportPath(
  importSpec: string,
  importerDir: string,
  allKnownPaths: Set<string>,
): string | null {
  if (importSpec.startsWith('.')) {
    const rawCandidate = path.resolve(importerDir, importSpec);
    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = rawCandidate + ext;
      if (allKnownPaths.has(candidate)) return candidate;
    }
    if (allKnownPaths.has(rawCandidate)) return rawCandidate;
    return null;
  }
  return importSpec;
}

export { hasExports, resolveImportPath };
