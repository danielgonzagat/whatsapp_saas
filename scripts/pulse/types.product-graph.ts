// PULSE — Live Codebase Nervous System
// Execution chain and product graph types

import type { PulseTruthMode } from './types.structural';
import type { ConfidenceMeasure } from './types.legacy-layers';

// ===== P1 — Execution Chain Layer =====

/** Execution chain step role type. */
export type PulseExecutionChainStepRole =
  | 'trigger'
  | 'interface'
  | 'client_api'
  | 'controller'
  | 'orchestration'
  | 'service'
  | 'persistence'
  | 'side_effect'
  | 'queue'
  | 'worker'
  | 'observability'
  | 'feedback_ui';

/** Single step in execution chain. */
export interface PulseExecutionChainStep {
  /** Step ID property. */
  id: string;
  /** Step role property. */
  role: PulseExecutionChainStepRole;
  /** Node ID from structural graph property. */
  nodeId: string;
  /** Human description property. */
  description: string;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Files touched in this step property. */
  filesInvolved: string[];
  /** Models touched property. */
  modelsInvolved: string[];
  /** External providers touched property. */
  providersInvolved: string[];
}

/** Formal execution chain (flow graph). */
export interface PulseExecutionChain {
  /** Chain ID property. */
  id: string;
  /** Human description property. */
  description: string;
  /** Entry point (trigger) property. */
  entrypoint: PulseExecutionChainStep;
  /** Ordered steps property. */
  steps: PulseExecutionChainStep[];
  /** Conditional branches property. */
  conditionalBranches: Array<{
    /** Condition description property. */
    condition: string;
    /** Branch steps property. */
    steps: PulseExecutionChainStep[];
  }>;
  /** Required state before execution property. */
  requiredState: string[];
  /** Side effects during chain property. */
  sideEffects: Array<{
    /** Side effect type property. */
    type:
      | 'network_call'
      | 'queue_dispatch'
      | 'event_emit'
      | 'message_send'
      | 'file_write'
      | 'external_api';
    /** Description property. */
    description: string;
    /** Order in chain property. */
    stepIndex: number;
  }>;
  /** Completeness score property. */
  completeness: {
    /** Total expected steps property. */
    expectedSteps: number;
    /** Steps actually found property. */
    foundSteps: number;
    /** Score 0-1 property. */
    score: number;
  };
  /** Failure points property. */
  failurePoints: Array<{
    /** At which step property. */
    stepIndex: number;
    /** Failure reason property. */
    reason: string;
    /** Recovery strategy property. */
    recovery: string;
  }>;
  /** Completion proof property. */
  completionProof: {
    /** What evidence proves completion property. */
    indicator: string;
    /** How to verify property. */
    verification: string;
    /** Current truth mode property. */
    truthMode: PulseTruthMode;
  };
  /** Overall truth mode property. */
  truthMode: PulseTruthMode;
  /** Confidence in chain accuracy property. */
  confidence: ConfidenceMeasure;
}

/** All execution chains for a surface/capability. */
export interface PulseExecutionChainSet {
  /** Chains property. */
  chains: PulseExecutionChain[];
  /** Summary property. */
  summary: {
    /** Total chains property. */
    totalChains: number;
    /** Fully implemented property. */
    completeChains: number;
    /** Partially implemented property. */
    partialChains: number;
    /** Needs simulation property. */
    simulatedChains: number;
    /** Overall completeness 0-1 property. */
    overallCompleteness: number;
  };
}

/** Product surface (Auth, Payments, WhatsApp, etc.) */
export interface PulseProductSurface {
  /** Surface ID property. */
  id: string;
  /** Human name property. */
  name: string;
  /** Description property. */
  description: string;
  /** Artifacts in this surface property. */
  artifactIds: string[];
  /** Capabilities property. */
  capabilities: string[];
  /** Completeness 0-100 property. */
  completeness: number;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
}

/** Product capability (Settings, Payments, WhatsApp Connection, etc.) */
export interface PulseProductCapability {
  /** Capability ID property. */
  id: string;
  /** Name property. */
  name: string;
  /** Surface ID property. */
  surfaceId: string;
  /** Artifacts involved property. */
  artifactIds: string[];
  /** Flows using this capability property. */
  flowIds: string[];
  /** Component presence: UI/API/Storage/Runtime/Validation/Observability property. */
  maturityScore: number;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** Criticality property. */
  criticality: 'must_have' | 'should_have' | 'nice_to_have';
  /** Blocking issues property. */
  blockers: string[];
}

/** User flow/journey (Signup, Connect WhatsApp, Checkout, etc.) */
export interface PulseProductFlow {
  /** Flow ID property. */
  id: string;
  /** Name property. */
  name: string;
  /** Entry capability ID property. */
  entryCapability: string;
  /** Ordered steps property. */
  capabilities: string[];
  /** Completeness 0-1 property. */
  completeness: number;
  /** Truth mode property. */
  truthMode: PulseTruthMode;
  /** What blocks this flow property. */
  blockers: Array<{
    /** Issue type property. */
    type: string;
    /** Affected component property. */
    component: string;
    /** Description property. */
    reason: string;
    /** Severity property. */
    severity: 'blocker' | 'degraded' | 'warning';
  }>;
}

/** Complete product graph (all surfaces, capabilities, flows). */
export interface PulseProductGraph {
  /** Surfaces property. */
  surfaces: PulseProductSurface[];
  /** Capabilities property. */
  capabilities: PulseProductCapability[];
  /** Flows property. */
  flows: PulseProductFlow[];
  /** Orphaned artifacts property. */
  orphanedArtifactIds: string[];
  /** Phantom capabilities (fake/placeholder) property. */
  phantomCapabilities: string[];
  /** Latent capabilities (declared but not implemented) property. */
  latentCapabilities: string[];
}
