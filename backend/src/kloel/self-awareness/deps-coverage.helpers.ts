import { Logger } from '@nestjs/common';
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

export interface SimpleCoverage {
  pct: number;
  lines: number;
  uncovered: string[];
}

export interface FileDeps {
  imports: string[];
  importedBy: string[];
}

export const REPO_ROOT = path.resolve(process.cwd(), '..');
export const SBOM_DIR = path.join(REPO_ROOT, 'tools', 'sbom');

export function workspaceCoverageDir(ws: string): string {
  return path.join(REPO_ROOT, ws, 'coverage');
}

export function looksLikeFilePath(s: string): boolean {
  return /[/\\]/.test(s) || /\.(ts|tsx|js|jsx)\$/.test(s);
}

export function parseSbom(raw: string): DepResult[] {
  const sbom = JSON.parse(raw) as SbomFile;
  return (sbom.components ?? []).map((c) => ({
    name: c.name,
    version: c.version ?? 'unknown',
    type: c.type ?? 'library',
    ...(c.group !== undefined ? { group: c.group } : {}),
    ...(c.purl !== undefined ? { purl: c.purl } : {}),
  }));
}

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
  const base = path.basename(filePath).replace(/\.(ts|tsx|js|jsx)\$/, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relPath = filePath.replace(/\\.[^.]+\$/, '');
  const escapedRel = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const searchDirs = WORKSPACES.filter((w) => w !== 'root' && w !== 'e2e').map((w) =>
    path.join(REPO_ROOT, w, 'src'),
  );

  for (const dir of searchDirs) {
    await scanDirForImporters(dir, escaped, escapedRel, importers, REPO_ROOT, logger);
  }

  return importers;
}

function uncoveredFromDetail(detail: CoverageDetailFile[string]): Set<number> {
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

function toRanges(uncovered: Set<number>): Array<{ start: number; end: number }> {
  if (uncovered.size === 0) {
    return [];
  }
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
  return ranges;
}

function aggregateTotals(matching: Array<[string, CoverageDetailFile[string]]>): {
  lines: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
} {
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

  const computePct = (covered: number, total: number): number =>
    total > 0 ? Math.round((covered / total) * 10000) / 100 : 0;

  totalStatements.pct = computePct(totalStatements.covered, totalStatements.total);
  totalBranches.pct = computePct(totalBranches.covered, totalBranches.total);
  totalFunctions.pct = computePct(totalFunctions.covered, totalFunctions.total);
  totalLines.pct = computePct(totalLines.covered, totalLines.total);

  return {
    lines: totalLines,
    branches: totalBranches,
    functions: totalFunctions,
    statements: totalStatements,
  };
}

export async function fileCoverage(
  filePath: string,
  workspace: string | undefined,
  logger: Logger,
): Promise<CoverageResult> {
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
        const uncovered = uncoveredFromDetail(detail);
        const ranges = toRanges(uncovered);
        if (ranges.length > 0) {
          uncoveredLines.push({ file: key, ranges });
        }
      }

      const totals = aggregateTotals(matching);

      return {
        available: true,
        lines: totals.lines,
        branches: totals.branches,
        functions: totals.functions,
        statements: totals.statements,
        ...(uncoveredLines.length > 0 ? { uncoveredLines } : {}),
      };
    } catch (err: unknown) {
      debug(logger, err);
      continue;
    }
  }

  return { available: false };
}

export async function fileSimpleCoverage(
  filePath: string,
  workspace: string | undefined,
  logger: Logger,
): Promise<SimpleCoverage> {
  const covResult = await fileCoverage(filePath, workspace, logger);
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

export async function simpleModuleCoverage(
  modulePath: string | undefined,
  logger: Logger,
): Promise<SimpleCoverage> {
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
      debug(logger, err);
      continue;
    }
  }

  return { pct: 0, lines: 0, uncovered: [] };
}
