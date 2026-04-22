import type {
  PulseCodacyEvidence,
  PulseCodacyEvidenceHotspot,
  PulseConvergenceOwnerLane,
  PulseScopeFile,
  PulseScopeState,
} from './types';

function sortHotspots(hotspots: PulseCodacyEvidenceHotspot[]): PulseCodacyEvidenceHotspot[] {
  return [...hotspots].sort((left, right) => {
    if (right.highSeverityCount !== left.highSeverityCount) {
      return right.highSeverityCount - left.highSeverityCount;
    }
    if (right.issueCount !== left.issueCount) {
      return right.issueCount - left.issueCount;
    }
    return left.filePath.localeCompare(right.filePath);
  });
}

function getOwnerLane(file: PulseScopeFile | null): PulseConvergenceOwnerLane {
  return file?.ownerLane || 'platform';
}

/** Build Codacy evidence from the current scope snapshot. */
export function buildCodacyEvidence(scopeState: PulseScopeState): PulseCodacyEvidence {
  const fileByPath = new Map(scopeState.files.map((file) => [file.path, file] as const));
  const hotspots = sortHotspots(
    scopeState.codacy.topFiles.map((entry) => {
      const file = fileByPath.get(entry.filePath) || null;
      return {
        filePath: entry.filePath,
        issueCount: entry.issueCount,
        highSeverityCount: entry.highSeverityCount,
        categories: entry.categories,
        tools: entry.tools,
        ownerLane: getOwnerLane(file),
        runtimeCritical: Boolean(file?.runtimeCritical),
        userFacing: Boolean(file?.userFacing),
        protectedByGovernance: Boolean(file?.protectedByGovernance),
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      snapshotAvailable: scopeState.codacy.snapshotAvailable,
      stale: scopeState.codacy.stale,
      totalIssues: scopeState.codacy.totalIssues,
      highIssues: scopeState.codacy.severityCounts.HIGH,
      runtimeCriticalHotspots: hotspots.filter((item) => item.runtimeCritical).length,
      userFacingHotspots: hotspots.filter((item) => item.userFacing).length,
      humanRequiredHotspots: hotspots.filter((item) => item.protectedByGovernance).length,
    },
    hotspots,
  };
}
