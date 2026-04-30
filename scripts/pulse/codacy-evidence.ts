import type {
  PulseCodacyEvidence,
  PulseCodacyEvidenceHotspot,
  PulseConvergenceOwnerLane,
  PulseScopeFile,
  PulseScopeState,
} from './types';
import { classifyCodacyIssues } from './codacy-false-positive-classifier';
import type { CodacyClassification } from './types.codacy-classification';

/**
 * Pulse codacy evidence shape extended with the false-positive classification.
 *
 * This intersection keeps the upstream `PulseCodacyEvidence` shape unchanged
 * (consumed by certification.ts owned by sibling agent B1) while exposing the
 * actionable / non-actionable HIGH split alongside the hotspot summary so
 * downstream consumers (certification staticPass gate, directive blockers)
 * can distinguish real findings from Codacy demo/template noise.
 */
export interface PulseCodacyEvidenceWithClassification extends PulseCodacyEvidence {
  /** Number of HIGH severity issues that this codebase can fix in product code. */
  actionableHigh: number;
  /** Number of HIGH severity issues raised by non-actionable demo/template patterns. */
  nonActionableHigh: number;
  /** Detailed classification record, including per-pattern counts and human action. */
  classification: CodacyClassification;
}

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
export function buildCodacyEvidence(
  scopeState: PulseScopeState,
): PulseCodacyEvidenceWithClassification {
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

  const classification = classifyCodacyIssues(scopeState.codacy, { rootDir: scopeState.rootDir });

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
    actionableHigh: classification.actionableHigh,
    nonActionableHigh: classification.nonActionableHigh,
    classification,
  };
}
