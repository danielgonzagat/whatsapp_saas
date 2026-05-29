import * as fs from 'fs/promises';
import * as path from 'path';

export const WORKSPACES = [
  'root',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'e2e',
] as const;
export type Workspace = (typeof WORKSPACES)[number];

export function isWorkspace(s: string): s is Workspace {
  return (WORKSPACES as readonly string[]).includes(s);
}

export interface SbomComponent {
  type: string;
  name: string;
  group?: string;
  version?: string;
  purl?: string;
}
export interface SbomFile {
  components: SbomComponent[];
}

export interface CoverageTotal {
  lines: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
}

export interface CoverageSummary {
  total: CoverageTotal;
  [fileKey: string]: CoverageTotal;
}

export interface CoverageDetailFile {
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

export interface DepResult {
  name: string;
  version: string;
  group?: string;
  purl?: string;
  type: string;
}

export interface CoverageResult {
  available: boolean;
  lines?: { total: number; covered: number; pct: number };
  branches?: { total: number; covered: number; pct: number };
  functions?: { total: number; covered: number; pct: number };
  statements?: { total: number; covered: number; pct: number };
  uncoveredLines?: Array<{ file: string; ranges: Array<{ start: number; end: number }> }>;
}

export interface AffectedResult {
  sourceFiles: string[];
  testFiles: Array<{ file: string; imports: string[] }>;
}

export const REPO_ROOT = path.resolve(process.cwd(), '..');
export const SBOM_DIR = path.join(REPO_ROOT, 'tools', 'sbom');

export function workspaceCoverageDir(ws: string, repoRoot: string = REPO_ROOT): string {
  return path.join(repoRoot, ws, 'coverage');
}

/** Pure helper: filter SBOM-derived deps by case-insensitive pattern. */
export function filterDeps(
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

/** Pure helper: parse SBOM components into normalized dep records. */
export function parseSbomComponents(sbom: SbomFile): DepResult[] {
  return (sbom.components ?? []).map((c) => ({
    name: c.name,
    version: c.version ?? 'unknown',
    type: c.type ?? 'library',
    ...(c.group !== undefined ? { group: c.group } : {}),
    ...(c.purl !== undefined ? { purl: c.purl } : {}),
  }));
}

const TEST_SUFFIXES = ['.spec.ts', '.test.ts', '.spec.tsx', '.test.tsx'] as const;

function isTestFile(name: string): boolean {
  return TEST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

async function listTestCandidates(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && isTestFile(e.name)) {
        out.push(path.join(dir, e.name));
      }
    }
  } catch {
    // dir absent / unreadable — skip
  }
  return out;
}

function extractImports(content: string, srcBase: string): string[] {
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
  return imports;
}

/** Pure helper: list test files that import any of the given source files. */
export async function affectedTestsImpl(
  sourceFiles: string[],
  repoRoot: string = REPO_ROOT,
): Promise<AffectedResult> {
  const result: AffectedResult = { sourceFiles, testFiles: [] };
  const seen = new Set<string>();

  for (const src of sourceFiles) {
    const dir = path.dirname(path.join(repoRoot, src));
    const candidates: string[] = [];
    candidates.push(...(await listTestCandidates(dir)));
    candidates.push(...(await listTestCandidates(path.join(dir, '__tests__'))));

    const srcBase = path.basename(src).replace(/\.(ts|tsx|js|jsx)$/, '');
    for (const cand of candidates) {
      if (seen.has(cand)) {
        continue;
      }
      seen.add(cand);

      try {
        const content = await fs.readFile(cand, 'utf-8');
        const imports = extractImports(content, srcBase);
        if (imports.length > 0) {
          result.testFiles.push({
            file: path.relative(repoRoot, cand),
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

/** Pure helper: aggregated workspace coverage from coverage-summary.json. */
export async function simpleModuleCoverage(
  workspace?: string,
  repoRoot: string = REPO_ROOT,
): Promise<CoverageResult> {
  const wss = workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

  for (const ws of wss) {
    const covPath = path.join(workspaceCoverageDir(ws, repoRoot), 'coverage-summary.json');
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

interface DetailRecord {
  s: Record<string, number>;
  b: Record<string, number[]>;
  f: Record<string, number>;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  branchMap: Record<
    string,
    { locations: Array<{ start: { line: number }; end: { line: number } }> }
  >;
}

function collectUncoveredLineNumbers(detail: DetailRecord): Set<number> {
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
  return uncovered;
}

function compressRanges(sorted: number[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  if (sorted.length === 0) {
    return ranges;
  }
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
  return ranges;
}

function pct(covered: number, total: number): number {
  return total > 0 ? Math.round((covered / total) * 10000) / 100 : 0;
}

/** Pure helper: per-file coverage detail (uncovered ranges + per-metric totals). */
export async function fileSimpleCoverage(
  filePath: string,
  workspace?: string,
  repoRoot: string = REPO_ROOT,
): Promise<CoverageResult> {
  const wss = workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

  for (const ws of wss) {
    const finalPath = path.join(workspaceCoverageDir(ws, repoRoot), 'coverage-final.json');
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
        const uncovered = collectUncoveredLineNumbers(detail);
        if (uncovered.size > 0) {
          const sorted = Array.from(uncovered).sort((a, b) => a - b);
          uncoveredLines.push({ file: key, ranges: compressRanges(sorted) });
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

      totalStatements.pct = pct(totalStatements.covered, totalStatements.total);
      totalBranches.pct = pct(totalBranches.covered, totalBranches.total);
      totalFunctions.pct = pct(totalFunctions.covered, totalFunctions.total);
      totalLines.pct = pct(totalLines.covered, totalLines.total);

      return {
        available: true,
        lines: totalLines,
        branches: totalBranches,
        functions: totalFunctions,
        statements: totalStatements,
        ...(uncoveredLines.length > 0 ? { uncoveredLines } : {}),
      };
    } catch {
      continue;
    }
  }

  return { available: false };
}

/** Pure helper: parse SBOM file for one workspace + return normalized deps. */
export async function fileDependencies(
  workspace: Workspace,
  sbomDir: string = SBOM_DIR,
): Promise<DepResult[]> {
  const sbomPath = path.join(sbomDir, `sbom-${workspace}.json`);
  const raw = await fs.readFile(sbomPath, 'utf-8');
  const sbom = JSON.parse(raw) as SbomFile;
  return parseSbomComponents(sbom);
}
