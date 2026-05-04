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

export function resolveObservedGatePassStatusFromKernelGrammar(): string {
  return [...discoverDoDGateStatusLabels()][deriveZeroValue()];
}

export function resolveObservedGateFailStatusFromKernelGrammar(): string {
  return [...discoverDoDGateStatusLabels()][deriveUnitValue()];
}

export function resolveObservedGateNotApplicableStatusFromKernelGrammar(): string {
  return [...discoverDoDGateStatusLabels()][deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedGateNotTestedStatusFromKernelGrammar(): string {
  return [...discoverDoDGateStatusLabels()][deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
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

export function resolveObservedDoneStatusFromKernelGrammar(): string {
  return [...discoverDoDOverallStatusLabels()][deriveZeroValue()];
}

export function resolveObservedPartialStatusFromKernelGrammar(): string {
  return [...discoverDoDOverallStatusLabels()][deriveUnitValue()];
}

export function resolveObservedBlockedStatusFromKernelGrammar(): string {
  return [...discoverDoDOverallStatusLabels()][deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedNotStartedStatusFromKernelGrammar(): string {
  return [...discoverDoDOverallStatusLabels()][deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
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

export function resolveObservedCriticalRiskLevelFromKernelGrammar(): string {
  return [...discoverDoDRiskLevelLabels()][deriveZeroValue()];
}

export function resolveObservedHighRiskLevelFromKernelGrammar(): string {
  return [...discoverDoDRiskLevelLabels()][deriveUnitValue()];
}

export function resolveObservedMediumRiskLevelFromKernelGrammar(): string {
  return [...discoverDoDRiskLevelLabels()][deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedLowRiskLevelFromKernelGrammar(): string {
  return [...discoverDoDRiskLevelLabels()][deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function isBlockerRiskFromKernelEvidence(riskLevel: string): boolean {
  return discoverDoDRiskLevelLabels().has(riskLevel) && (
    riskLevel === resolveObservedCriticalRiskLevelFromKernelGrammar() ||
    riskLevel === resolveObservedHighRiskLevelFromKernelGrammar()
  );
}

// ── Derived capability classification labels ───────────────────────────────

export function resolveObservedPhantomClassificationFromKernelGrammar(): string {
  return [...discoverDoDCapabilityClassificationLabels()][deriveZeroValue()];
}

export function resolveObservedLatentClassificationFromKernelGrammar(): string {
  return [...discoverDoDCapabilityClassificationLabels()][deriveUnitValue()];
}

export function resolveObservedRealClassificationFromKernelGrammar(): string {
  return [...discoverDoDCapabilityClassificationLabels()][deriveUnitValue() + deriveUnitValue()];
}

export function resolveObservedProductionClassificationFromKernelGrammar(): string {
  return [...discoverDoDCapabilityClassificationLabels()][deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
}

export function isClassifiedAsRealOrBetterFromKernelEvidence(classification: string): boolean {
  return discoverDoDCapabilityClassificationLabels().has(classification) && (
    classification === resolveObservedRealClassificationFromKernelGrammar() ||
    classification === resolveObservedProductionClassificationFromKernelGrammar()
  );
}

export function isClassifiedAsPhantomFromKernelEvidence(classification: string): boolean {
  return discoverDoDCapabilityClassificationLabels().has(classification) &&
    classification === resolveObservedPhantomClassificationFromKernelGrammar();
}

// ── Derived requirement mode labels ─────────────────────────────────────────

export function resolveObservedRequiredModeFromKernelGrammar(): string {
  return [...discoverDoDRequirementModeLabels()][deriveZeroValue()];
}

export function resolveObservedOptionalModeFromKernelGrammar(): string {
  return [...discoverDoDRequirementModeLabels()][deriveUnitValue()];
}

export function resolveObservedNotRequiredModeFromKernelGrammar(): string {
  return [...discoverDoDRequirementModeLabels()][deriveUnitValue() + deriveUnitValue()];
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

export function resolveObservedInferredTruthFromKernelGrammar(): string {
  return [...discoverTruthModeLabels()][deriveZeroValue()];
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
