// PULSE — Live Codebase Nervous System
// Perfectness Test Harness (Wave 9.4)
//
// Formal 72-hour autonomous test plan that validates the PULSE system's
// ability to operate without external intervention.
//
// Defines the test suite structure, gate criteria, evidence collection
// plan, exit conditions, and the evaluation pipeline.
//
// This is a PLANNING module — it defines the evaluation framework.
// It does NOT execute the autonomous work or mutate the repository.

export {
  buildTestSuite,
  getGateNames,
  getAcceptanceCriteria,
} from './__parts__/perfectness-test/test-suite';
export { resolveExitAction } from './__parts__/perfectness-test/state-helpers';
export {
  evaluateGate,
  computeVerdict,
  isAutonomousApproved,
} from './__parts__/perfectness-test/evaluation';
export { hasElapsed72h, evaluateLongRunEvidence } from './__parts__/perfectness-test/time-utils';
export { evaluatePerfectness } from './__parts__/perfectness-test/perfectness-runner';
