import { safeResolve } from '../../safe-path';
import type { CapabilityObservability } from '../../types.observability-coverage';
import type { ObservabilityRuntimeContext } from './types-and-utils';

export function detectIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
): string[] {
  return capabilities
    .filter(
      (cap) =>
        cap.details.matchedFilePaths.length === 0 &&
        cap.overallStatus !== 'covered' &&
        cap.untrustedEvidencePillars.length > 0,
    )
    .map((cap) => cap.capabilityId);
}

export function detectRuntimeIntegrationsWithoutObservability(
  capabilities: CapabilityObservability[],
  runtimeContext: ObservabilityRuntimeContext,
): string[] {
  return capabilities
    .filter((cap) => {
      const hasExternalCall = cap.details.matchedFilePaths.some((filePath) => {
        const absolutePath = safeResolve(filePath);
        const nodes = runtimeContext.behaviorNodesByFile.get(absolutePath) ?? [];
        return nodes.some((node) => node.externalCalls.length > 0);
      });
      const hasObservability = cap.overallStatus === 'covered' || cap.overallStatus === 'partial';
      return hasExternalCall && !hasObservability;
    })
    .map((cap) => cap.capabilityId);
}
