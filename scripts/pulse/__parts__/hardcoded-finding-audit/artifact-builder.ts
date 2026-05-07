import type { HardcodedFindingAuditSource, HardcodedFindingAuditArtifact } from './types';
import { isAuditableSource } from './auditability';
import { auditSource } from './audit-engine';

export function buildHardcodedFindingAuditArtifact(
  sources: readonly HardcodedFindingAuditSource[],
): HardcodedFindingAuditArtifact {
  const files = sources
    .filter(isAuditableSource)
    .map(auditSource)
    .filter((file) => file.findings.length > 0)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));

  const totalFindings = files.reduce((total, file) => total + file.findings.length, 0);

  return {
    artifact: 'PULSE_HARDCODED_FINDING_AUDIT',
    version: 1,
    scannedFiles: sources.length,
    totalFindings,
    files,
  };
}
