/**
 * Authority Engine - evaluates operational autonomy gates and manages level transitions.
 * Wave 8, Module B.
 * Determines what level of autonomy PULSE should operate at by evaluating
 * required gates for each authority level transition. Reads evidence from
 * PULSE_CERTIFICATE.json (gates) and PULSE_MACHINE_READINESS.json (criteria).
 * State is persisted to `.pulse/current/PULSE_AUTHORITY_STATE.json`.
 * @module authority-engine
 */
export { determineAuthorityLevel } from './__parts__/authority-engine/api';
export { requiredGatesForLevel } from './__parts__/authority-engine/api';
export { canAdvance } from './__parts__/authority-engine/api';
export { buildAuthorityState } from './__parts__/authority-engine/api';
export { evaluateAuthorityState } from './__parts__/authority-engine/api';
export { evaluateTransitionGates } from './__parts__/authority-engine/api';
export { canAdvanceTo } from './__parts__/authority-engine/api';
export { advanceTo } from './__parts__/authority-engine/api';
