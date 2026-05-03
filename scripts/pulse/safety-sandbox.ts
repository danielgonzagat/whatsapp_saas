// PULSE — Live Codebase Nervous System
// Safety Sandbox (Wave 9.3)
//
// Classifies destructive operations by risk level, defines isolation
// rules per operation type, simulates logical sandbox workspaces for
// planning validation, and gates autonomous execution of dangerous changes.
//
// This is a PLANNING module — it defines what should happen.
// It does NOT actually clone workspaces, execute patches, or apply migrations.

export type {
  ActionSafetyRequirements,
  FileEffectGraph,
} from './__parts__/safety-sandbox/effect-graph';
export {
  RISK_ORDER,
  ACTION_KIND_GRAMMAR,
  normalizeRepoPath,
} from './__parts__/safety-sandbox/effect-graph';

export {
  buildEmptyEffectGraph,
  deriveRiskLevelFromEffectGraph,
  deriveRequirementsFromEffectGraph,
} from './__parts__/safety-sandbox/risk-classification';

export { loadProtectedFiles } from './__parts__/safety-sandbox/protected-files';

export { classifyDestructiveActions } from './__parts__/safety-sandbox/classify-actions';

export {
  classifyRiskLevel,
  isActionAllowedInAutonomy,
  classifyGateRequirement,
} from './__parts__/safety-sandbox/gate-requirements';
export type { GateDecision } from './__parts__/safety-sandbox/gate-requirements';

export { validatePatchForProtectedFiles } from './__parts__/safety-sandbox/patch-validation';

export {
  createLogicalSandbox,
  getIsolationRules,
  getAllIsolationRules,
  validateWorkspaceForAction,
} from './__parts__/safety-sandbox/sandbox-workspace';

export { buildSandboxState } from './__parts__/safety-sandbox/sandbox-state';
