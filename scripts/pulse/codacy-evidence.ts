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
  const topFilesByPath = new Map(
    scopeState.codacy.topFiles.map((entry) => [entry.filePath, entry]),
  );
  const highPriorityByPath = new Map<string, typeof scopeState.codacy.highPriorityBatch>();

  for (const issue of scopeState.codacy.highPriorityBatch) {
    const current = highPriorityByPath.get(issue.filePath) || [];
    current.push(issue);
    highPriorityByPath.set(issue.filePath, current);
  }

  const hotspotPaths = [...new Set([...topFilesByPath.keys(), ...highPriorityByPath.keys()])];
  const hotspots = sortHotspots(
    hotspotPaths.map((filePath) => {
      const entry = topFilesByPath.get(filePath);
      const issues = highPriorityByPath.get(filePath) || [];
      const highIssues = issues.filter((issue) => issue.severityLevel === 'HIGH');
      const file = fileByPath.get(filePath) || null;
      return {
        filePath,
        issueCount: Math.max(entry?.issueCount || 0, issues.length),
        highSeverityCount: highIssues.length,
        categories: [
          ...new Set([...(entry?.categories || []), ...issues.map((issue) => issue.category)]),
        ]
          .filter(Boolean)
          .sort(),
        tools: [...new Set([...(entry?.tools || []), ...issues.map((issue) => issue.tool)])]
          .filter(Boolean)
          .sort(),
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
