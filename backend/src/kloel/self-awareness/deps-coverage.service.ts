import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const WORKSPACES = [
  'root',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'e2e',
] as const;
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
    branchMap: Record<string, { locations: Array<{ start: { line: number }; end: { line: number } }> }>;
    b: Record<string, number[]>;
    fnMap: Record<string, { name: string; decl: { start: { line: number }; end: { line: number } } }>;
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

  async dependencies(
    workspace: string,
    pattern?: string,
  ): Promise<{ success: boolean; deps?: DepResult[]; error?: string; count?: number }> {
    if (!isWorkspace(workspace)) {
      return { success: false, error: `invalid_workspace: ${workspace}` };
    }

    const cacheKey = `deps:${workspace}`;
    const cached = this.cacheGet<DepResult[]>(cacheKey);
    if (cached) {
      return this.filterDeps(cached, pattern);
    }

    try {
      const sbomPath = path.join(SBOM_DIR, `sbom-${workspace}.json`);
      const raw = await fs.readFile(sbomPath, 'utf-8');
      const sbom = JSON.parse(raw) as SbomFile;

      const deps: DepResult[] = (sbom.components ?? []).map((c) => ({
        name: c.name,
        version: c.version ?? 'unknown',
        group: c.group,
        purl: c.purl,
        type: c.type ?? 'library',
      }));

      this.cacheSet(cacheKey, deps);
      return this.filterDeps(deps, pattern);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to read SBOM for ${workspace}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async codeCoverage(
    filePath?: string,
    workspace?: string,
  ): Promise<CoverageResult> {
    if (filePath) {
      return this.fileCoverage(filePath, workspace);
    }
    return this.summaryCoverage(workspace);
  }

  async affectedTests(
    sourceFiles: string[],
  ): Promise<AffectedResult> {
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
      } catch {
        // dir read failed — skip
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
      } catch {
        // __tests__ doesn't exist — skip
      }

      const srcBase = path.basename(src).replace(/\.(ts|tsx|js|jsx)$/, '');
      for (const cand of candidates) {
        if (seen.has(cand)) continue;
        seen.add(cand);

        try {
          const content = await fs.readFile(cand, 'utf-8');
          const imports: string[] = [];
          const escaped = srcBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const importRe = new RegExp(
            `(?:from\\s+['\"](\.\.?/.*${escaped}[^'\"]*)['\"]|require\\(['\"](\.\.?/.*${escaped}[^'\"]*)['\"]\\))`,
            'g',
          );
          let m: RegExpExecArray | null;
          while ((m = importRe.exec(content)) !== null) {
            imports.push(m[1] ?? m[2]);
          }

          if (imports.length > 0) {
            result.testFiles.push({
              file: path.relative(REPO_ROOT, cand),
              imports,
            });
          }
        } catch {
          // can't read candidate — skip
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

  private async summaryCoverage(workspace?: string): Promise<CoverageResult> {
    const wss = workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

    for (const ws of wss) {
      const covPath = path.join(workspaceCoverageDir(ws), 'coverage-summary.json');
      try {
        const raw = await fs.readFile(covPath, 'utf-8');
        const summary = JSON.parse(raw) as CoverageSummary;
        return {
          available: true,
          lines: summary.total.lines,
          branches: summary.total.branches,
          functions: summary.total.functions,
          statements: summary.total.statements,
        };
      } catch {
        continue;
      }
    }

    return { available: false };
  }

  private async fileCoverage(
    filePath: string,
    workspace?: string,
  ): Promise<CoverageResult> {
    const wss = workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

    for (const ws of wss) {
      const finalPath = path.join(workspaceCoverageDir(ws), 'coverage-final.json');
      try {
        const raw = await fs.readFile(finalPath, 'utf-8');
        const final = JSON.parse(raw) as CoverageDetailFile;

        const matching = Object.entries(final).filter(([k]) => k.includes(filePath));
        if (matching.length === 0) continue;

        const uncoveredLines: Array<{ file: string; ranges: Array<{ start: number; end: number }> }> = [];

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
            let rangeStart = sorted[0];
            let rangeEnd = sorted[0];
            for (let i = 1; i < sorted.length; i++) {
              if (sorted[i] === rangeEnd + 1) {
                rangeEnd = sorted[i];
              } else {
                ranges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = sorted[i];
                rangeEnd = sorted[i];
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
                if (count > 0) coveredLines.add(l);
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
          uncoveredLines: uncoveredLines.length > 0 ? uncoveredLines : undefined,
        };
      } catch {
        continue;
      }
    }

    return { available: false };
  }

  private cacheGet<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private cacheSet<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.CACHE_MS });
  }
}
