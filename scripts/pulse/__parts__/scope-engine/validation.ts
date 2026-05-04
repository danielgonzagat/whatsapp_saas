import { safeJoin } from '../../lib/safe-path';
import { ensureDir, writeTextFile } from '../../safe-fs';
import type { ScopeEngineState } from '../../types.scope-engine';
import { buildScopeEngineState } from './engine';
import { getCriticalOrphans } from './orphans';

export interface ZeroUnknownReport {
  passed: boolean;
  generatedAt: string;
  totalFiles: number;
  unknownFiles: number;
  unknownFilePaths: string[];
  criticalOrphans: number;
  criticalOrphanPaths: string[];
}

export function validateZeroUnknown(state: ScopeEngineState): ZeroUnknownReport {
  const unknownEntries = state.files.filter((f) => f.status === 'unknown');
  const criticalOrphans = getCriticalOrphans(state);

  return {
    passed: unknownEntries.length === 0 && criticalOrphans.length === 0,
    generatedAt: new Date().toISOString(),
    totalFiles: state.summary.totalFiles,
    unknownFiles: unknownEntries.length,
    unknownFilePaths: unknownEntries.map((f) => f.filePath),
    criticalOrphans: criticalOrphans.length,
    criticalOrphanPaths: criticalOrphans.map((f) => f.filePath),
  };
}

export function enforceZeroUnknown(rootDir: string): ZeroUnknownReport {
  const state = buildScopeEngineState(rootDir);
  const report = validateZeroUnknown(state);

  const outDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outDir, { recursive: true });
  const outPath = safeJoin(outDir, 'PULSE_SCOPE_ZERO_UNKNOWN.json');
  writeTextFile(outPath, JSON.stringify(report, null, 2));

  if (!report.passed) {
    if (process.env.PULSE_SCOPE_DEBUG === '1') {
      console.warn(
        `[scope-engine] zero-unknown FAIL: ${report.unknownFiles} unknown, ${report.criticalOrphans} critical orphans`,
      );
    }
  }

  return report;
}
