import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  WORKSPACES,
  Workspace,
  isWorkspace,
  workspaceCoverageDir,
} from './deps-coverage.helpers';

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

export interface CoverageResult {
  available: boolean;
  lines?: { total: number; covered: number; pct: number };
  branches?: { total: number; covered: number; pct: number };
  functions?: { total: number; covered: number; pct: number };
  statements?: { total: number; covered: number; pct: number };
  uncoveredLines?: Array<{ file: string; ranges: Array<{ start: number; end: number }> }>;
}

export interface SimpleCoverage {
  pct: number;
  lines: number;
  uncovered: string[];
}

function debug(logger: Logger, err: unknown): void {
  logger.debug(`deps-coverage minor: ${err instanceof Error ? err.message : String(err)}`);
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
  const wss: readonly Workspace[] =
    workspace && isWorkspace(workspace) ? [workspace] : WORKSPACES;

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
  const wss: readonly Workspace[] =
    modulePath && isWorkspace(modulePath) ? [modulePath] : WORKSPACES;

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
