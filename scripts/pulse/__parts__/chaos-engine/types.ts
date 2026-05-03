import type { ChaosScenarioKind, ChaosTarget } from '../../types.chaos-engine';
import type { PulseCapability, PulseExecutionTrace, PulseRuntimeProbe } from '../../types';

/**
 * External dependency detected in the codebase.
 *
 * The value is a stable, sanitized identifier derived from observed code or
 * artifact evidence. It is intentionally open-ended so PULSE does not carry a
 * catalog of product names.
 */
export type ChaosProviderName = string;

export type ChaosOperationalConcern =
  | 'payment_idempotency'
  | 'whatsapp_queue_retry'
  | 'email_retry_fallback'
  | 'ai_model_fallback_cache';

export interface ChaosEvidenceContext {
  dependency: ChaosProviderName;
  target: ChaosTarget;
  files: string[];
  capabilities: PulseCapability[];
  runtimeProbes: PulseRuntimeProbe[];
  executionPhases: PulseExecutionTrace['phases'];
  artifactRecords: Record<string, unknown>[];
  evidenceText: string;
}

export type ChaosScenarioSeed = {
  kind: ChaosScenarioKind;
  params: Record<string, number>;
  evidenceWeight: number;
};

export type LatencyTier = 'low' | 'medium' | 'high' | 'extreme';
