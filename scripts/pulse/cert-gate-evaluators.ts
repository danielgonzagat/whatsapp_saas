/**
 * Gate evaluator functions: gateFail, evidenceFresh, scope, truthExtraction,
 * pulseSelfTrust, static, runtime, changeRisk.
 * All functions are pure — no I/O, no side effects.
 */
export { gateFail } from './__parts__/cert-gate-evaluators/gate-fail';
export {
  evaluateTruthExtractionGate,
  evaluatePulseSelfTrustGate,
} from './__parts__/cert-gate-evaluators/truth-gates';
export {
  evaluateEvidenceFreshGate,
  evaluateScopeGate,
  evaluateStaticGate,
  evaluateRuntimeGate,
  evaluateChangeRiskGate,
} from './__parts__/cert-gate-evaluators/main';
export { evaluateBrowserGate } from './cert-gate-browser';
