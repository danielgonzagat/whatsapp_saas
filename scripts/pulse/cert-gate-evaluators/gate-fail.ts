import type { PulseGateFailureClass } from '../types.gate-failure';
import type { PulseGateResult } from '../types.evidence';

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
    ...(options?.affectedCapabilityIds !== undefined ? { affectedCapabilityIds: options.affectedCapabilityIds } : {}),
    ...(options?.affectedFlowIds !== undefined ? { affectedFlowIds: options.affectedFlowIds } : {}),
    ...(options?.evidenceMode !== undefined ? { evidenceMode: options.evidenceMode } : {}),
    ...(options?.confidence !== undefined ? { confidence: options.confidence } : {}),
  };
}
