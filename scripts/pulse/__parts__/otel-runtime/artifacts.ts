import type { RuntimeCallGraphEvidence } from '../../types.otel-runtime';
import { safeJoin } from '../../safe-path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { RUNTIME_TRACES_ARTIFACT, TRACE_DIFF_ARTIFACT } from './constants';

export function exportTraceToJson(evidence: RuntimeCallGraphEvidence): string {
  return JSON.stringify(evidence, null, 2);
}

/**
 * Persist the full runtime trace evidence to `.pulse/current/PULSE_RUNTIME_TRACES.json`.
 */
export function saveRuntimeTracesArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }
  const filePath = safeJoin(currentDir, RUNTIME_TRACES_ARTIFACT);
  writeTextFile(filePath, exportTraceToJson(evidence));
  return filePath;
}

/**
 * Persist the trace diff (coverage gap + runtime-only edges) to
 * `.pulse/current/PULSE_TRACE_DIFF.json`.
 */
export function saveTraceDiffArtifact(rootDir: string, evidence: RuntimeCallGraphEvidence): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }

  const diff = {
    generatedAt: evidence.generatedAt,
    source: evidence.source,
    sourceDetails: evidence.sourceDetails,
    staticGraphCoverage: evidence.staticGraphCoverage,
    runtimeOnlyEdges: evidence.runtimeOnlyEdges,
    summary: {
      tracesAnalyzed: evidence.traces.length,
      spansAnalyzed: evidence.traces.reduce((sum, t) => sum + t.spans.length, 0),
      staticEdgesTotal: evidence.staticGraphCoverage.totalStaticEdges,
      staticEdgesObserved: evidence.staticGraphCoverage.observedInRuntime,
      staticEdgesMissing: evidence.staticGraphCoverage.missingFromRuntime,
      coveragePercent: evidence.staticGraphCoverage.coveragePercent,
      newEdgesFound: evidence.runtimeOnlyEdges.length,
    },
  };

  const filePath = safeJoin(currentDir, TRACE_DIFF_ARTIFACT);
  writeTextFile(filePath, JSON.stringify(diff, null, 2));
  return filePath;
}

/**
 * @deprecated Use `saveRuntimeTracesArtifact` and `saveTraceDiffArtifact` instead.
 */
export function saveRuntimeCallGraphArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  return saveRuntimeTracesArtifact(rootDir, evidence);
}

/**
 * Load previously persisted runtime call graph evidence.
 */
export function loadRuntimeCallGraphArtifact(rootDir: string): RuntimeCallGraphEvidence | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', RUNTIME_TRACES_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<RuntimeCallGraphEvidence>(filePath);
  } catch {
    return null;
  }
}

/**
 * Load the trace diff artifact if it exists.
 */
export function loadTraceDiffArtifact(rootDir: string): unknown | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', TRACE_DIFF_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<unknown>(filePath);
  } catch {
    return null;
  }
}
