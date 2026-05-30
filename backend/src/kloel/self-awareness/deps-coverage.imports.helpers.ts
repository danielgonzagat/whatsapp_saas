import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

import { REPO_ROOT, WORKSPACES } from './deps-coverage.helpers';

export interface AffectedResult {
  sourceFiles: string[];
  testFiles: Array<{ file: string; imports: string[] }>;
}

export interface FileDeps {
  imports: string[];
  importedBy: string[];
}

function debug(logger: Logger, err: unknown): void {
  logger.debug(`deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`);
}

async function collectTestCandidates(dir: string, logger: Logger): Promise<string[]> {
  const candidates: string[] = [];
  const matchSpec = (name: string): boolean =>
    name.endsWith('.spec.ts') ||
    name.endsWith('.test.ts') ||
    name.endsWith('.spec.tsx') ||
    name.endsWith('.test.tsx');

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && matchSpec(e.name)) {
        candidates.push(path.join(dir, e.name));
      }
    }
  } catch (err: unknown) {
    debug(logger, err);
  }

  const testsDir = path.join(dir, '__tests__');
  try {
    const entries = await fs.readdir(testsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && matchSpec(e.name)) {
        candidates.push(path.join(testsDir, e.name));
      }
    }
  } catch (err: unknown) {
    debug(logger, err);
  }

  return candidates;
}

async function scanCandidatesForSource(
  candidates: string[],
  src: string,
  seen: Set<string>,
  result: AffectedResult,
  logger: Logger,
): Promise<void> {
  const srcBase = path.basename(src).replace(/\.(ts|tsx|js|jsx)$/, '');
  for (const cand of candidates) {
    if (seen.has(cand)) {
      continue;
    }
    seen.add(cand);

    try {
      const content = await fs.readFile(cand, 'utf-8');
      const imports: string[] = [];
      const escaped = srcBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const importRe = new RegExp(
        `(?:from\\s+['"](\\.\\.?/.*${escaped}[^'"]*)['"]|require\\(['"](\\.\\.?/.*${escaped}[^'"]*)['"]\\))`,
        'g',
      );
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        const imp = m[1] ?? m[2];
        if (imp) {
          imports.push(imp);
        }
      }

      if (imports.length > 0) {
        result.testFiles.push({
          file: path.relative(REPO_ROOT, cand),
          imports,
        });
      }
    } catch (err: unknown) {
      debug(logger, err);
    }
  }
}

export async function affectedTestsImpl(
  sourceFiles: string[],
  logger: Logger,
): Promise<AffectedResult> {
  const result: AffectedResult = { sourceFiles, testFiles: [] };
  const seen = new Set<string>();

  for (const src of sourceFiles) {
    const dir = path.dirname(path.join(REPO_ROOT, src));
    const candidates = await collectTestCandidates(dir, logger);
    await scanCandidatesForSource(candidates, src, seen, result, logger);
  }

  return result;
}

export async function parseImports(absPath: string, logger: Logger): Promise<string[]> {
  try {
    const content = await fs.readFile(absPath, 'utf-8');
    const imports: string[] = [];
    const re =
      /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)|require\(['"]([^'"]+)['"]\))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const imp = m[1] ?? m[2] ?? m[3];
      if (imp) {
        imports.push(imp);
      }
    }
    return imports;
  } catch (err: unknown) {
    debug(logger, err);
    return [];
  }
}

async function scanDirForImporters(
  dir: string,
  escapedBase: string,
  escapedRel: string,
  out: string[],
  root: string,
  logger: Logger,
): Promise<void> {
  let entries: unknown[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    debug(logger, err);
    return;
  }

  if (!Array.isArray(entries)) {
    return;
  }

  const dirs: string[] = [];
  for (const e of entries as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__tests__') {
        dirs.push(full);
      }
    } else if (e.isFile() && /\.(ts|tsx|js|jsx)$/.test(e.name)) {
      try {
        const content = await fs.readFile(full, 'utf-8');
        const re = new RegExp(
          `(?:from\\s+['"]((?:\\.\\.?/)*${escapedBase}(?:/index)?)['"]|from\\s+['"]((?:\\.\\.?/)*${escapedRel})['"]|require\\(['"]((?:\\.\\.?/)*${escapedBase}(?:/index)?)['"]\\)|require\\(['"]((?:\\.\\.?/)*${escapedRel})['"]\\))`,
        );
        if (re.test(content)) {
          out.push(path.relative(root, full));
        }
      } catch (err: unknown) {
        debug(logger, err);
      }
    }
  }

  for (const d of dirs) {
    await scanDirForImporters(d, escapedBase, escapedRel, out, root, logger);
  }
}

export async function findImporters(filePath: string, logger: Logger): Promise<string[]> {
  const importers: string[] = [];
  const base = path.basename(filePath).replace(/\.(ts|tsx|js|jsx)$/, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relPath = filePath.replace(/\.[^.]+$/, '');
  const escapedRel = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const searchDirs = WORKSPACES.filter((w) => w !== 'root' && w !== 'e2e').map((w) =>
    path.join(REPO_ROOT, w, 'src'),
  );

  for (const dir of searchDirs) {
    await scanDirForImporters(dir, escaped, escapedRel, importers, REPO_ROOT, logger);
  }

  return importers;
}
