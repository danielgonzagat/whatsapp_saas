import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const WORKSPACES = ['root', 'backend', 'frontend', 'frontend-admin', 'worker', 'e2e'] as const;
type Workspace = (typeof WORKSPACES)[number];

function isWorkspace(s: string): s is Workspace {
  return (WORKSPACES as readonly string[]).includes(s);
}

interface SbomComponent {
  type: string;
  name: string;
  group?: string;
  version?: string;
  purl?: string;
}
interface SbomFile {
  components: SbomComponent[];
}

interface CoverageTotal {
  lines: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

interface CoverageSummary {
  total: CoverageTotal;
  [fileKey: string]: CoverageTotal;
}

interface CoverageDetailFile {
  [fileKey: string]: {
    path: string;
    statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
    s: Record<string, number>;
    branchMap: Record<
      string,
      { locations: Array<{ start: { line: number }; end: { line: number } }> }
    >;
    b: Record<string, number[]>;
    fnMap: Record<
      string,
      { name: string; decl: { start: { line: number }; end: { line: number } } }
    >;
    f: Record<string, number>;
  };
}

interface DepResult {
  name: string;
  version: string;
  group?: string;
  purl?: string;
  type: string;
}

interface CoverageResult {
  available: boolean;
  lines?: { total: number; covered: number; pct: number };
  branches?: { total: number; covered: number; pct: number };
  functions?: { total: number; covered: number; pct: number };
  statements?: { total: number; covered: number; pct: number };
  uncoveredLines?: Array<{ file: string; ranges: Array<{ start: number; end: number }> }>;
}

interface AffectedResult {
  sourceFiles: string[];
  testFiles: Array<{ file: string; imports: string[] }>;
}

interface SimpleCoverage {
  pct: number;
  lines: number;
  uncovered: string[];
}

interface FileDeps {
  imports: string[];
  importedBy: string[];
}

const REPO_ROOT = path.resolve(process.cwd(), '..');
const SBOM_DIR = path.join(REPO_ROOT, 'tools', 'sbom');

function workspaceCoverageDir(ws: string): string {
  return path.join(REPO_ROOT, ws, 'coverage');
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class DepsCoverageService {
  private readonly logger = new Logger(DepsCoverageService.name);
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly CACHE_MS = 60_000;
  private readonly SHORT_CACHE_MS = 5_000;

  // ── dependencies (overloaded) ──

  /** Static analysis: imports of a single file + reverse-lookup of files importing it. */
  async dependencies(filePath: string): Promise<FileDeps>;
  /** SBOM-based package listing for a workspace. */
  async dependencies(
    workspace: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number }>;
  async dependencies(
    workspaceOrFile: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number } | FileDeps> {
    // Branch: file-based dependency analysis when the arg looks like a file path
    if (
      !isWorkspace(workspaceOrFile) &&
      pattern === undefined &&
      this.looksLikeFilePath(workspaceOrFile)
    ) {
      return this.fileDependencies(workspaceOrFile);
    }

    if (!isWorkspace(workspaceOrFile)) {
      return { success: false, error: `invalid_workspace: ${workspaceOrFile}` };
    }

    const cacheKey = `deps:${workspaceOrFile}`;
    const cached = this.cacheGet<DepResult[]>(cacheKey);
    if (cached) {
      return this.filterDeps(cached, pattern);
    }

    try {
      const sbomPath = path.join(SBOM_DIR, `sbom-${workspaceOrFile}.json`);
      const raw = await fs.readFile(sbomPath, 'utf-8');
      const sbom = JSON.parse(raw) as SbomFile;

      const deps: DepResult[] = (sbom.components ?? []).map((c) => ({
        name: c.name,
        version: c.version ?? 'unknown',
        type: c.type ?? 'library',
        ...(c.group !== undefined ? { group: c.group } : {}),
        ...(c.purl !== undefined ? { purl: c.purl } : {}),
      }));

      this.cacheSet(cacheKey, deps);
      return this.filterDeps(deps, pattern);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to read SBOM for ${workspaceOrFile}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ── codeCoverage (unified SimpleCoverage) ──

  /**
   * Returns simplified coverage: pct, total lines, uncovered line refs.
   * Pass a file path for per-file uncovered detail.
   * Pass a workspace name (e.g. "backend") or omit for summary.
   */
  async codeCoverage(filePath?: string, workspace?: string): Promise<SimpleCoverage> {
    if (filePath && isWorkspace(filePath) && workspace === undefined) {
      return this.simpleModuleCoverage(filePath);
    }
    if (!filePath) {
      return this.simpleModuleCoverage(workspace);
    }
    return this.fileSimpleCoverage(filePath, workspace);
  }

  // ── affectedTests (overloaded) ──

  /** Single source file → test file paths. */
  async affectedTests(filePath: string): Promise<string[]>;
  /** Multiple source files → full affected-result with import details. */
  async affectedTests(sourceFiles: string[]): Promise<AffectedResult>;
  async affectedTests(input: string | string[]): Promise<string[] | AffectedResult> {
    const sourceFiles = Array.isArray(input) ? input : [input];
    const result = await this.affectedTestsImpl(sourceFiles);
    if (!Array.isArray(input)) {
      return result.testFiles.map((t) => t.file);
    }
    return result;
  }

  private async affectedTestsImpl(sourceFiles: string[]): Promise<AffectedResult> {
    const result: AffectedResult = { sourceFiles, testFiles: [] };
    const seen = new Set<string>();

    for (const src of sourceFiles) {
      const dir = path.dirname(path.join(REPO_ROOT, src));
      const candidates: string[] = [];

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (
            e.isFile() &&
            (e.name.endsWith('.spec.ts') ||
              e.name.endsWith('.test.ts') ||
              e.name.endsWith('.spec.tsx') ||
              e.name.endsWith('.test.tsx'))
          ) {
            candidates.push(path.join(dir, e.name));
          }
        }
      } catch (err: unknown) {
        this.logger.debug(
          `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
        ); // dir read failed — skip
      }

      const testsDir = path.join(dir, '__tests__');
      try {
        const entries = await fs.readdir(testsDir, { withFileTypes: true });
        for (const e of entries) {
          if (
            e.isFile() &&
            (e.name.endsWith('.spec.ts') ||
              e.name.endsWith('.test.ts') ||
              e.name.endsWith('.spec.tsx') ||
              e.name.endsWith('.test.tsx'))
          ) {
            candidates.push(path.join(testsDir, e.name));
          }
        }
      } catch (err: unknown) {
        this.logger.debug(
          `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
        ); // __tests__ doesn't exist — skip
      }

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
          this.logger.debug(
            `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
          ); // can't read candidate — skip
        }
      }
    }

    return result;
  }

  private filterDeps(
    deps: DepResult[],
    pattern?: string,
  ): { success: boolean; deps: DepResult[]; count: number } {
    if (!pattern) {
      return { success: true, deps, count: deps.length };
    }
    const lower = pattern.toLowerCase();
    const filtered = deps.filter(
      (d) =>
        d.name.toLowerCase().includes(lower) ||
        (d.group?.toLowerCase().includes(lower) ?? false) ||
        (d.purl?.toLowerCase().includes(lower) ?? false),
    );
    return { success: true, deps: filtered, count: filtered.length };
  }

  private async fileCoverage(filePath: string, workspace?: string): Promise<CoverageResult> {
    const wss = workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

    for (const ws of wss) {
      const finalPath = path.join(workspaceCoverageDir(ws), 'coverage-final.json');
      try {
        const raw = await fs.readFile(finalPath, 'utf-8');
        const final = JSON.parse(raw) as CoverageDetailFile;

        const matching = Object.entries(final).filter(([k]) => k.includes(filePath));
        if (matching.length === 0) {
          continue;
        }

        const uncoveredLines: Array<{
          file: string;
          ranges: Array<{ start: number; end: number }>;
        }> = [];

        for (const [key, detail] of matching) {
          const uncovered = new Set<number>();
          for (const [stmtIdx, count] of Object.entries(detail.s ?? {})) {
            if (count === 0) {
              const stmt = detail.statementMap[stmtIdx];
              if (stmt) {
                for (let l = stmt.start.line; l <= stmt.end.line; l++) {
                  uncovered.add(l);
                }
              }
            }
          }

          for (const [branchIdx, hits] of Object.entries(detail.b ?? {})) {
            if (hits.every((h) => h === 0)) {
              const branch = detail.branchMap[branchIdx];
              if (branch) {
                for (const loc of branch.locations) {
                  for (let l = loc.start.line; l <= loc.end.line; l++) {
                    uncovered.add(l);
                  }
                }
              }
            }
          }

          if (uncovered.size > 0) {
            const sorted = Array.from(uncovered).sort((a, b) => a - b);
            const ranges: Array<{ start: number; end: number }> = [];
            let rangeStart = sorted[0] ?? 0;
            let rangeEnd = sorted[0] ?? 0;
            for (let i = 1; i < sorted.length; i++) {
              const curr = sorted[i];
              if (curr === undefined) {
                continue;
              }
              if (curr === rangeEnd + 1) {
                rangeEnd = curr;
              } else {
                ranges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = curr;
                rangeEnd = curr;
              }
            }
            ranges.push({ start: rangeStart, end: rangeEnd });
            uncoveredLines.push({ file: key, ranges });
          }
        }

        const totalLines = { total: 0, covered: 0, pct: 0 };
        const totalBranches = { total: 0, covered: 0, pct: 0 };
        const totalFunctions = { total: 0, covered: 0, pct: 0 };
        const totalStatements = { total: 0, covered: 0, pct: 0 };

        for (const [, detail] of matching) {
          const sKeys = Object.keys(detail.s ?? {});
          totalStatements.total += sKeys.length;
          totalStatements.covered += sKeys.filter((k) => (detail.s?.[k] ?? 0) > 0).length;

          const bKeys = Object.keys(detail.b ?? {});
          totalBranches.total += bKeys.length;
          totalBranches.covered += bKeys.filter((k) =>
            (detail.b?.[k] ?? []).some((h: number) => h > 0),
          ).length;

          const fKeys = Object.keys(detail.f ?? {});
          totalFunctions.total += fKeys.length;
          totalFunctions.covered += fKeys.filter((k) => (detail.f?.[k] ?? 0) > 0).length;

          const allLines = new Set<number>();
          const coveredLines = new Set<number>();
          for (const [stmtIdx, count] of Object.entries(detail.s ?? {})) {
            const stmt = detail.statementMap[stmtIdx];
            if (stmt) {
              for (let l = stmt.start.line; l <= stmt.end.line; l++) {
                allLines.add(l);
                if (count > 0) {
                  coveredLines.add(l);
                }
              }
            }
          }
          totalLines.total += allLines.size;
          totalLines.covered += coveredLines.size;
        }

        totalStatements.pct =
          totalStatements.total > 0
            ? Math.round((totalStatements.covered / totalStatements.total) * 10000) / 100
            : 0;
        totalBranches.pct =
          totalBranches.total > 0
            ? Math.round((totalBranches.covered / totalBranches.total) * 10000) / 100
            : 0;
        totalFunctions.pct =
          totalFunctions.total > 0
            ? Math.round((totalFunctions.covered / totalFunctions.total) * 10000) / 100
            : 0;
        totalLines.pct =
          totalLines.total > 0
            ? Math.round((totalLines.covered / totalLines.total) * 10000) / 100
            : 0;

        return {
          available: true,
          lines: totalLines,
          branches: totalBranches,
          functions: totalFunctions,
          statements: totalStatements,
          ...(uncoveredLines.length > 0 ? { uncoveredLines } : {}),
        };
      } catch (err: unknown) {
        this.logger.debug(
          `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
    }

    return { available: false };
  }

  private cacheGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheSet<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.CACHE_MS });
  }

  private cacheShortGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheShortSet<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.SHORT_CACHE_MS });
  }

  private looksLikeFilePath(s: string): boolean {
    return /[/\\]/.test(s) || /\.(ts|tsx|js|jsx)\$/.test(s);
  }

  // ── file-based dependency analysis ──

  private async fileDependencies(filePath: string): Promise<FileDeps> {
    const cacheKey = `filedeps:${filePath}`;
    const cached = this.cacheShortGet<FileDeps>(cacheKey);
    if (cached) {
      return cached;
    }

    const absPath = path.resolve(REPO_ROOT, filePath);
    const [imports, importedBy] = await Promise.all([
      this.parseImports(absPath),
      this.findImporters(filePath),
    ]);

    const result: FileDeps = { imports, importedBy };
    this.cacheShortSet(cacheKey, result);
    return result;
  }

  private async parseImports(absPath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(absPath, 'utf-8');
      const imports: string[] = [];
      const re =
        /(?:import\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]([^'"]+)['"]|import\\(['"]([^'"]+)['"]\\)|require\\(['"]([^'"]+)['"]\\))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const imp = m[1] ?? m[2] ?? m[3];
        if (imp) {
          imports.push(imp);
        }
      }
      return imports;
    } catch (err: unknown) {
      this.logger.debug(`deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  private async findImporters(filePath: string): Promise<string[]> {
    const cacheKey = `importers:${filePath}`;
    const cached = this.cacheShortGet<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const importers: string[] = [];
    const base = path.basename(filePath).replace(/\.(ts|tsx|js|jsx)\$/, '');
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const relPath = filePath.replace(/\\.[^.]+\$/, '');
    const escapedRel = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const searchDirs = WORKSPACES.filter((w) => w !== 'root' && w !== 'e2e').map((w) =>
      path.join(REPO_ROOT, w, 'src'),
    );

    for (const dir of searchDirs) {
      await this.scanDirForImporters(dir, escaped, escapedRel, importers, REPO_ROOT);
    }

    this.cacheShortSet(cacheKey, importers);
    return importers;
  }

  private async scanDirForImporters(
    dir: string,
    escapedBase: string,
    escapedRel: string,
    out: string[],
    root: string,
  ): Promise<void> {
    let entries: unknown[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: unknown) {
      this.logger.debug(`deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    const dirs: string[] = [];
    for (const e of entries as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__tests__') {
          dirs.push(full);
        }
      } else if (e.isFile() && /\.(ts|tsx|js|jsx)\$/.test(e.name)) {
        try {
          const content = await fs.readFile(full, 'utf-8');
          const re = new RegExp(
            `(?:from\\s+['"]((?:\\.\\.?/)*${escapedBase}(?:/index)?)['"]|from\\s+['"]((?:\\.\\.?/)*${escapedRel})['"]|require\\(['"]((?:\\.\\.?/)*${escapedBase}(?:/index)?)['"]\\)|require\\(['"]((?:\\.\\.?/)*${escapedRel})['"]\\))`,
          );
          if (re.test(content)) {
            out.push(path.relative(root, full));
          }
        } catch (err: unknown) {
          this.logger.debug(
            `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
          ); // unreadable file — skip
        }
      }
    }

    for (const d of dirs) {
      await this.scanDirForImporters(d, escapedBase, escapedRel, out, root);
    }
  }

  // ── simplified coverage helpers ──

  private async fileSimpleCoverage(filePath: string, workspace?: string): Promise<SimpleCoverage> {
    const covResult = await this.fileCoverage(filePath, workspace);
    if (!covResult.available) {
      return { pct: 0, lines: 0, uncovered: [] };
    }

    const uncovered: string[] = [];
    if (covResult.uncoveredLines) {
      for (const uf of covResult.uncoveredLines) {
        for (const r of uf.ranges) {
          for (let l = r.start; l <= r.end; l++) {
            uncovered.push(`${uf.file}:${l}`);
          }
        }
      }
    }

    return {
      pct: covResult.lines?.pct ?? 0,
      lines: covResult.lines?.total ?? 0,
      uncovered,
    };
  }

  private async simpleModuleCoverage(modulePath?: string): Promise<SimpleCoverage> {
    const wss = modulePath && isWorkspace(modulePath) ? [modulePath] : WORKSPACES;

    for (const ws of wss) {
      const covPath = path.join(workspaceCoverageDir(ws), 'coverage-summary.json');
      try {
        const raw = await fs.readFile(covPath, 'utf-8');
        const summary = JSON.parse(raw) as CoverageSummary;
        return {
          pct: summary.total.lines.pct,
          lines: summary.total.lines.total,
          uncovered: [],
        };
      } catch (err: unknown) {
        this.logger.debug(
          `deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
    }

    return { pct: 0, lines: 0, uncovered: [] };
  }
}
