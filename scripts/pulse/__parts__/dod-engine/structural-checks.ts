import type { DoDRiskLevel } from '../../types.dod-engine';
import { dodStructuralEvidenceKernelGrammar, type CheckRequirement } from './gates-and-risk';
import { isApplicableRequirement, isEmptyTotal } from './helpers';
import { scanFilesForPattern } from './file-scanners';
import type { CapabilityInput } from './artifacts';

export function evaluateStructuralChecks(
  capability: CapabilityInput,
  rootDir: string,
  riskLevel: DoDRiskLevel,
): Record<string, boolean> {
  const results: Record<string, boolean> = {};

  for (const check of dodStructuralEvidenceKernelGrammar()) {
    const reqMode = check[riskLevel] as CheckRequirement;
    if (reqMode === 'not_required') {
      results[check.name] = true; // waived
      continue;
    }

    let found = false;

    if (check.pathKernelGrammar) {
      const hasPathMatch = capability.filePaths.some((fp) => check.pathKernelGrammar!.test(fp));
      if (hasPathMatch) {
        found = true;
      }
    }

    if (!found) {
      const scanResult = scanFilesForPattern(capability.filePaths, rootDir, check.kernelGrammar);
      if (scanResult.found) {
        found = true;
      }
    }

    results[check.name] = found;
  }

  return results;
}

export function countRequiredStructuralChecks(
  checks: Record<string, boolean>,
  riskLevel: DoDRiskLevel,
): number {
  return dodStructuralEvidenceKernelGrammar().filter((check) => {
    const reqMode = check[riskLevel] as CheckRequirement;
    return isApplicableRequirement(reqMode) && checks[check.name];
  }).length;
}

export function applicableStructuralChecks(riskLevel: DoDRiskLevel): number {
  return dodStructuralEvidenceKernelGrammar().filter((check) =>
    isApplicableRequirement(check[riskLevel] as CheckRequirement),
  ).length;
}

export function structuralEvidenceProfile(
  checks: Record<string, boolean>,
  riskLevel: DoDRiskLevel,
): {
  hasAnyEvidence: boolean;
  hasMajorityEvidence: boolean;
  hasCompleteEvidence: boolean;
} {
  const applicable = applicableStructuralChecks(riskLevel);
  const observed = countRequiredStructuralChecks(checks, riskLevel);

  if (isEmptyTotal(applicable)) {
    return {
      hasAnyEvidence: true,
      hasMajorityEvidence: true,
      hasCompleteEvidence: true,
    };
  }

  return {
    hasAnyEvidence: observed > 0,
    hasMajorityEvidence: observed * 2 >= applicable,
    hasCompleteEvidence: observed === applicable,
  };
}
