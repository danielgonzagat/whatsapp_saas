import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceExecutionModeLabels } from '../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverConvergenceRiskLevelLabels } from '../__kernel_additions__/discoverConvergenceRiskLevelLabels';
import { discoverExecutionMatrixPathStatusLabels } from '../__kernel_additions__/discoverExecutionMatrixPathStatusLabels';
import { discoverHarnessExecutionStatusLabels } from '../dynamic-reality-kernel/type-contract-engines';

const _PATH_CLASSIFICATION_MEMBERS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.path-coverage-engine.ts',
  'PathClassification',
);

const _PATH_COVERAGE_EXECUTION_MODE_MEMBERS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.path-coverage-engine.ts',
  'PathCoverageExecutionMode',
);

const _RISK_LEVEL_MEMBERS = discoverConvergenceRiskLevelLabels();
const _HARNESS_STATUS_MEMBERS = discoverHarnessExecutionStatusLabels();
const _MATRIX_PATH_STATUS_MEMBERS = discoverExecutionMatrixPathStatusLabels();
const _CONVERGENCE_EXECUTION_MODE_MEMBERS = discoverConvergenceExecutionModeLabels();
const _ARTIFACT_NAMES = discoverAllObservedArtifactFilenames();

function isObservedPassClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'observed_pass';
}
function isObservedFailClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'observed_fail';
}
function isInferredOnlyClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'inferred_only';
}
function isProbeBlueprintClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'probe_blueprint_generated';
}
function isUnreachableClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'unreachable';
}
function isNotExecutableClass(c: string) {
  return _PATH_CLASSIFICATION_MEMBERS.has(c) && c === 'not_executable';
}
function isCriticalRiskLevel(r: string) {
  return _RISK_LEVEL_MEMBERS.has(r) && r === 'critical';
}
function isHighRiskLevel(r: string) {
  return _RISK_LEVEL_MEMBERS.has(r) && r === 'high';
}
function isGovernedValidationMode(m: string) {
  return _PATH_COVERAGE_EXECUTION_MODE_MEMBERS.has(m) && m === 'governed_validation';
}
function isAiSafeMode(m: string) {
  return _PATH_COVERAGE_EXECUTION_MODE_MEMBERS.has(m) && m === 'ai_safe';
}
function isEvidenceStatusPassed(s: string) {
  return _HARNESS_STATUS_MEMBERS.has(s) && s === 'passed';
}
function isEvidenceStatusFailed(s: string) {
  return _HARNESS_STATUS_MEMBERS.has(s) && s === 'failed';
}
function isBlockedHumanRequiredMatrixStatus(s: string) {
  return _MATRIX_PATH_STATUS_MEMBERS.has(s) && s === 'blocked_human_required';
}
function isUntestedMatrixStatus(s: string) {
  return _MATRIX_PATH_STATUS_MEMBERS.has(s) && s === 'untested';
}
function isHumanRequiredExecutionMode(m: string) {
  return _CONVERGENCE_EXECUTION_MODE_MEMBERS.has(m) && m === 'human_required';
}
function isObservationOnlyExecutionMode(m: string) {
  return _CONVERGENCE_EXECUTION_MODE_MEMBERS.has(m) && m === 'observation_only';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export {
  _PATH_CLASSIFICATION_MEMBERS,
  _PATH_COVERAGE_EXECUTION_MODE_MEMBERS,
  _RISK_LEVEL_MEMBERS,
  _HARNESS_STATUS_MEMBERS,
  _MATRIX_PATH_STATUS_MEMBERS,
  _CONVERGENCE_EXECUTION_MODE_MEMBERS,
  _ARTIFACT_NAMES,
  isObservedPassClass,
  isObservedFailClass,
  isInferredOnlyClass,
  isProbeBlueprintClass,
  isUnreachableClass,
  isNotExecutableClass,
  isCriticalRiskLevel,
  isHighRiskLevel,
  isGovernedValidationMode,
  isAiSafeMode,
  isEvidenceStatusPassed,
  isEvidenceStatusFailed,
  isBlockedHumanRequiredMatrixStatus,
  isUntestedMatrixStatus,
  isHumanRequiredExecutionMode,
  isObservationOnlyExecutionMode,
  unique,
};
