import {
  discoverDoDGateStatusLabels,
  discoverDoDOverallStatusLabels,
  discoverDoDRiskLevelLabels,
  discoverDoDCapabilityClassificationLabels,
  discoverDoDRequirementModeLabels,
  discoverTruthModeLabels,
  deriveUnitValue,
  deriveZeroValue,
} from './dynamic-reality-kernel';

// ── Re-exports from parts ───────────────────────────────────────────────────

export { determineRiskLevel } from './__parts__/dod-engine/classification';
export { buildDoDEngineState } from './__parts__/dod-engine/engine';

// ── Derived gate status labels (dynamic-reality kernel grammar) ─────────────

const OBSERVED_GATE_STATUS_LABELS = [...discoverDoDGateStatusLabels()];

export function resolveObservedGatePassStatusFromKernelGrammar(): string {
  return OBSERVED_GATE_STATUS_LABELS[deriveZeroValue()];
}

export function resolveObservedGateFailStatusFromKernelGrammar(): string {
  return OBSERVED_GATE_STATUS_LABELS[deriveUnitValue()];
}

export function resolveObservedGateNotApplicableStatusFromKernelGrammar(): string {
  return OBSERVED_GATE_STATUS_LABELS[deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedGateNotTestedStatusFromKernelGrammar(): string {
  return OBSERVED_GATE_STATUS_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function hasPassedGateFromKernelEvidence(status: string): boolean {
  return discoverDoDGateStatusLabels().has(status) && status === resolveObservedGatePassStatusFromKernelGrammar();
}

export function hasFailedGateFromKernelEvidence(status: string): boolean {
  return discoverDoDGateStatusLabels().has(status) && status === resolveObservedGateFailStatusFromKernelGrammar();
}

export function isGateApplicableFromKernelEvidence(status: string): boolean {
  return discoverDoDGateStatusLabels().has(status) && status !== resolveObservedGateNotApplicableStatusFromKernelGrammar();
}

export function isGateTestedFromKernelEvidence(status: string): boolean {
  return discoverDoDGateStatusLabels().has(status) && status !== resolveObservedGateNotTestedStatusFromKernelGrammar();
}

// ── Derived overall status labels ───────────────────────────────────────────

const OBSERVED_OVERALL_STATUS_LABELS = [...discoverDoDOverallStatusLabels()];

export function resolveObservedDoneStatusFromKernelGrammar(): string {
  return OBSERVED_OVERALL_STATUS_LABELS[deriveZeroValue()];
}

export function resolveObservedPartialStatusFromKernelGrammar(): string {
  return OBSERVED_OVERALL_STATUS_LABELS[deriveUnitValue()];
}

export function resolveObservedBlockedStatusFromKernelGrammar(): string {
  return OBSERVED_OVERALL_STATUS_LABELS[deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedNotStartedStatusFromKernelGrammar(): string {
  return OBSERVED_OVERALL_STATUS_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function isDoneStatusFromKernelEvidence(status: string): boolean {
  return discoverDoDOverallStatusLabels().has(status) && status === resolveObservedDoneStatusFromKernelGrammar();
}

export function isPartialStatusFromKernelEvidence(status: string): boolean {
  return discoverDoDOverallStatusLabels().has(status) && status === resolveObservedPartialStatusFromKernelGrammar();
}

export function isBlockedStatusFromKernelEvidence(status: string): boolean {
  return discoverDoDOverallStatusLabels().has(status) && status === resolveObservedBlockedStatusFromKernelGrammar();
}

export function isNotStartedStatusFromKernelEvidence(status: string): boolean {
  return discoverDoDOverallStatusLabels().has(status) && status === resolveObservedNotStartedStatusFromKernelGrammar();
}

// ── Derived risk level labels ───────────────────────────────────────────────

const OBSERVED_RISK_LEVEL_LABELS = [...discoverDoDRiskLevelLabels()];

export function resolveObservedCriticalRiskLevelFromKernelGrammar(): string {
  return OBSERVED_RISK_LEVEL_LABELS[deriveZeroValue()];
}

export function resolveObservedHighRiskLevelFromKernelGrammar(): string {
  return OBSERVED_RISK_LEVEL_LABELS[deriveUnitValue()];
}

export function resolveObservedMediumRiskLevelFromKernelGrammar(): string {
  return OBSERVED_RISK_LEVEL_LABELS[deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedLowRiskLevelFromKernelGrammar(): string {
  return OBSERVED_RISK_LEVEL_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function isBlockerRiskFromKernelEvidence(riskLevel: string): boolean {
  const labels = discoverDoDRiskLevelLabels();
  return labels.has(riskLevel) && (
    riskLevel === resolveObservedCriticalRiskLevelFromKernelGrammar() ||
    riskLevel === resolveObservedHighRiskLevelFromKernelGrammar()
  );
}

// ── Derived capability classification labels ───────────────────────────────

const OBSERVED_CLASSIFICATION_LABELS = [...discoverDoDCapabilityClassificationLabels()];

export function resolveObservedPhantomClassificationFromKernelGrammar(): string {
  return OBSERVED_CLASSIFICATION_LABELS[deriveZeroValue()];
}

export function resolveObservedLatentClassificationFromKernelGrammar(): string {
  return OBSERVED_CLASSIFICATION_LABELS[deriveUnitValue()];
}

export function resolveObservedRealClassificationFromKernelGrammar(): string {
  return OBSERVED_CLASSIFICATION_LABELS[deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedProductionClassificationFromKernelGrammar(): string {
  return OBSERVED_CLASSIFICATION_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function isClassifiedAsRealOrBetterFromKernelEvidence(classification: string): boolean {
  const labels = discoverDoDCapabilityClassificationLabels();
  return labels.has(classification) && (
    classification === resolveObservedRealClassificationFromKernelGrammar() ||
    classification === resolveObservedProductionClassificationFromKernelGrammar()
  );
}

export function isClassifiedAsPhantomFromKernelEvidence(classification: string): boolean {
  return discoverDoDCapabilityClassificationLabels().has(classification) &&
    classification === resolveObservedPhantomClassificationFromKernelGrammar();
}

// ── Derived requirement mode labels ─────────────────────────────────────────

const OBSERVED_REQUIREMENT_MODE_LABELS = [...discoverDoDRequirementModeLabels()];

export function resolveObservedRequiredModeFromKernelGrammar(): string {
  return OBSERVED_REQUIREMENT_MODE_LABELS[deriveZeroValue()];
}

export function resolveObservedOptionalModeFromKernelGrammar(): string {
  return OBSERVED_REQUIREMENT_MODE_LABELS[deriveUnitValue()];
}

export function resolveObservedNotRequiredModeFromKernelGrammar(): string {
  return OBSERVED_REQUIREMENT_MODE_LABELS[deriveUnitValue() + deriveUnitValue()];
}

export function isRequiredModeFromKernelEvidence(mode: string): boolean {
  return discoverDoDRequirementModeLabels().has(mode) &&
    mode === resolveObservedRequiredModeFromKernelGrammar();
}

export function isNotRequiredModeFromKernelEvidence(mode: string): boolean {
  return discoverDoDRequirementModeLabels().has(mode) &&
    mode === resolveObservedNotRequiredModeFromKernelGrammar();
}

// ── Derived truth mode labels ───────────────────────────────────────────────

const OBSERVED_TRUTH_MODE_LABELS = [...discoverTruthModeLabels()];

export function resolveObservedInferredTruthFromKernelGrammar(): string {
  return OBSERVED_TRUTH_MODE_LABELS[deriveZeroValue()];
}

export function isInferredTruthFromKernelEvidence(truthMode: string): boolean {
  return discoverTruthModeLabels().has(truthMode) &&
    truthMode === resolveObservedInferredTruthFromKernelGrammar();
}

// ── Derived numeric thresholds ──────────────────────────────────────────────

export function deriveUnitThresholdFromObservedEvidence(): number {
  return deriveUnitValue();
}

export function deriveZeroThresholdFromObservedEvidence(): number {
  return deriveZeroValue();
}

export function deriveCollectionThresholdFromObservedEvidence(): number {
  return deriveZeroValue();
}

export function deriveMinimumLengthFromObservedEvidence(): number {
  return deriveUnitValue();
}
