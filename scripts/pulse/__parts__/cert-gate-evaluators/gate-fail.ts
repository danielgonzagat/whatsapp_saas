import type { PulseGateFailureClass, PulseGateResult } from '../../types';

export function gateFail(
  reason: string,
  failureClass: PulseGateFailureClass,
  options?: {
    affectedCapabilityIds?: string[];
    affectedFlowIds?: string[];
    evidenceMode?: 'observed' | 'inferred' | 'aspirational';
    confidence?: 'high' | 'medium' | 'low';
  },
): PulseGateResult {
  return {
    status: 'fail',
    reason,
    failureClass,
    affectedCapabilityIds: options?.affectedCapabilityIds,
    affectedFlowIds: options?.affectedFlowIds,
    evidenceMode: options?.evidenceMode,
    confidence: options?.confidence,
  };
}
