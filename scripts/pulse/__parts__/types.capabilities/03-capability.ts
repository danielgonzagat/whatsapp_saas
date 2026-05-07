import type { PulseConvergenceOwnerLane } from '../../types.gate-failure';
import type {
  PulseScopeExecutionMode,
  PulseStructuralRole,
  PulseTruthMode,
} from '../../types.truth';
import type { PulseCapabilityStatus } from './01-primitives';
import type { PulseCapabilityDoD, PulseCapabilityMaturity } from './02-maturity-dod';

export interface PulseCapability {
  id: string;
  name: string;
  truthMode: PulseTruthMode;
  status: PulseCapabilityStatus;
  confidence: number;
  userFacing: boolean;
  runtimeCritical: boolean;
  protectedByGovernance: boolean;
  ownerLane: PulseConvergenceOwnerLane;
  executionMode: PulseScopeExecutionMode;
  rolesPresent: PulseStructuralRole[];
  missingRoles: PulseStructuralRole[];
  filePaths: string[];
  nodeIds: string[];
  routePatterns: string[];
  evidenceSources: string[];
  codacyIssueCount: number;
  highSeverityIssueCount: number;
  blockingReasons: string[];
  validationTargets: string[];
  maturity: PulseCapabilityMaturity;
  dod: PulseCapabilityDoD;
  statusDetail?: {
    structuralStatus?: string;
    operationalStatus?: string;
    scenarioStatus?: string;
    scenarioPassed?: number;
    scenarioTotal?: number;
    dodStatus?: string;
    productionStatus?: string;
  };
}

export interface PulseCapabilityStateSummary {
  totalCapabilities: number;
  realCapabilities: number;
  partialCapabilities: number;
  latentCapabilities: number;
  phantomCapabilities: number;
  humanRequiredCapabilities: number;
  foundationalCapabilities: number;
  connectedCapabilities: number;
  operationalCapabilities: number;
  productionReadyCapabilities: number;
  runtimeObservedCapabilities: number;
  scenarioCoveredCapabilities: number;
}

export interface PulseCapabilityState {
  generatedAt: string;
  summary: PulseCapabilityStateSummary;
  capabilities: PulseCapability[];
}
