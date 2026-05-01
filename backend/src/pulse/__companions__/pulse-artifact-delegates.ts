import type { PulseArtifactService } from '../pulse-artifact.service';

export function getLatestDirective(artifacts: PulseArtifactService) {
  return artifacts.getLatestDirective();
}
export function getLatestCertificate(artifacts: PulseArtifactService) {
  return artifacts.getLatestCertificate();
}
export function getLatestProductVision(artifacts: PulseArtifactService) {
  return artifacts.getLatestProductVision();
}
export function getLatestParityGaps(artifacts: PulseArtifactService) {
  return artifacts.getLatestParityGaps();
}
export function getLatestScopeState(artifacts: PulseArtifactService) {
  return artifacts.getLatestScopeState();
}
export function getLatestCodacyEvidence(artifacts: PulseArtifactService) {
  return artifacts.getLatestCodacyEvidence();
}
export function getLatestCapabilityState(artifacts: PulseArtifactService) {
  return artifacts.getLatestCapabilityState();
}
export function getLatestFlowProjection(artifacts: PulseArtifactService) {
  return artifacts.getLatestFlowProjection();
}
export function getLatestExecutionMatrix(artifacts: PulseArtifactService) {
  return artifacts.getLatestExecutionMatrix();
}
export function getMachineReadiness(artifacts: PulseArtifactService) {
  return artifacts.getMachineReadiness();
}
export function getLatestConvergencePlan(artifacts: PulseArtifactService) {
  return artifacts.getLatestConvergencePlan();
}
export function getLatestExternalSignalState(artifacts: PulseArtifactService) {
  return artifacts.getLatestExternalSignalState();
}
export function getLatestAutonomyState(artifacts: PulseArtifactService) {
  return artifacts.getLatestAutonomyState();
}
export function getLatestAgentOrchestrationState(artifacts: PulseArtifactService) {
  return artifacts.getLatestAgentOrchestrationState();
}
export function getProductionSnapshot(artifacts: PulseArtifactService) {
  return artifacts.getProductionSnapshot();
}
