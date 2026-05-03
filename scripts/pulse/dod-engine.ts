/**
 * PULSE Capability Definition-of-Done Engine
 *
 * Evaluates every discovered capability against objective, evidence-backed
 * Definition-of-Done gates spanning UI, API, service, persistence, side
 * effects, testing, runtime observation, observability, security, and
 * recovery dimensions.
 *
 * Capabilities are classified into four maturity levels:
 *   - phantom:    inferred only (no structural evidence beyond node inference)
 *   - latent:     some structural evidence, no runtime observation
 *   - real:       structural evidence + runtime observation confirmed
 *   - production: all DoD gates met (blocking + required + optional)
 *
 * Artifact output:
 *   - `.pulse/current/PULSE_DOD_ENGINE.json` — per-capability gate evaluation
 *   - `.pulse/current/PULSE_DOD_STATE.json`  — classification + scoring state
 */

export { determineRiskLevel } from './__parts__/dod-engine/gates-and-risk';
export { buildDoDEngineState } from './__parts__/dod-engine/engine';
