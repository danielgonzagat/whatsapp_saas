/**
 * PULSE Wave 5 — Playwright Spec & Dynamic Plan (barrel)
 *
 * Implementation lives in `playwright/__parts__/`.
 */

export {
  generatePlaywrightSpec,
  getHttpMethodForStep,
  getApiPathForStep,
  buildEvidenceLinks,
  buildPreconditions,
  buildStep,
} from './playwright/__parts__/spec-gen';
export type { DynamicScenarioPlan } from './playwright/__parts__/spec-gen';
export {
  collectScenarioTokens,
  hasAnyScenarioToken,
  buildDynamicScenarioPlan,
} from './playwright/__parts__/plan-gen';
