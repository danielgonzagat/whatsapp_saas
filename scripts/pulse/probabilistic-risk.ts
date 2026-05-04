// PULSE — Wave 7 Module A: Probabilistic Risk Model (Bayesian)
//
// Tracks per-capability reliability using a Beta(α,β) distribution updated
// with static, runtime, and security pass/fail evidence from PULSE_HEALTH.json
// and PULSE_CERTIFICATE.json. Applies exponential temporal decay with 7-day
// half-life. Estimates traffic share from route patterns to compute expected
// impact = (1−reliabilityP) × trafficShare.
//
// Prior: Beta(1,1) uniform (no prior belief).
// Output: .pulse/current/PULSE_PROBABILISTIC_RISK.json

export { buildProbabilisticRisk } from './__parts__/probabilistic-risk/engine';
