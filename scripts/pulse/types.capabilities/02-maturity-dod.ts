import type { PulseCapabilityMaturityStage, PulseDoDStatus } from './01-primitives';

export interface PulseCapabilityMaturityDimensions {
  interfacePresent: boolean;
  apiSurfacePresent: boolean;
  orchestrationPresent: boolean;
  persistencePresent: boolean;
  sideEffectPresent: boolean;
  runtimeEvidencePresent: boolean;
  validationPresent: boolean;
  scenarioCoveragePresent: boolean;
  codacyHealthy: boolean;
  simulationOnly: boolean;
}

export interface PulseCapabilityDoD {
  status: PulseDoDStatus;
  missingRoles: string[];
  blockers: string[];
  truthModeMet: boolean;
  governedBlockers?: Array<{
    role: string;
    executionMode: 'ai_safe';
    reason: string;
    expectedValidation: string;
  }>;
}

export interface PulseCapabilityMaturity {
  stage: PulseCapabilityMaturityStage;
  score: number;
  dimensions: PulseCapabilityMaturityDimensions;
  missing: string[];
}
